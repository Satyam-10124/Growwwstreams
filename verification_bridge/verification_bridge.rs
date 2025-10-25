#
![no_std]
use gstd::{msg, prelude::*, ActorId};

// The state is stored in static mutable variables.
// This is a common pattern for simple contracts in gstd
// to avoid heap allocations and complex state management structures.

static mut ESCROW_MANAGER: [u8; 32] = [0; 32];
static mut ADMIN: [u8; 32] = [0; 32];

static mut RELAYER_1: [u8; 32] = [0; 32];
static mut RELAYER_2: [u8; 32] = [0; 32];
static mut RELAYER_3: [u8; 32] = [0; 32];

static mut MILESTONE_1_LAST_PERCENT: u16 = 0;
static mut MILESTONE_2_LAST_PERCENT: u16 = 0;
static mut MILESTONE_3_LAST_PERCENT: u16 = 0;

static mut POLICY_MIN_STEP_BPS: u16 = 200; // 2% represented as Basis Points (200 / 10000)

static mut POLICY_TEST_REQUIRED: bool = true;

// A constant to represent an empty/unassigned ActorId.
const ZERO_ACTOR: [u8; 32] = [0; 32];

/// Initializes the verification bridge contract.
///
/// This function is called once upon contract creation.
/// It sets the contract admin to the message source and initializes
/// the escrow manager from the provided payload.
///
/// # Payload
/// `[0 (action byte), escrow_manager (32 bytes)]`
///
/// # Reply
/// `[1]` on success.
#[no_mangle]
extern "C" fn init() {
    let payload = msg::load_bytes().expect("Failed to load init payload");
    gstd::assert!(payload.len() == 33, "Invalid init payload length");

    unsafe {
        ADMIN = msg::source().into();
        ESCROW_MANAGER = payload[1..33]
            .try_into()
            .expect("Invalid escrow_manager bytes");
    }

    // Reply with a success code.
    msg::reply_bytes(&[1], 0).expect("Failed to reply in init");
}

/// Handles incoming messages to the contract.
///
/// This function is the main entry point for all subsequent interactions.
/// It uses the first byte of the payload to dispatch to the correct action handler.
#[no_mangle]
extern "C" fn handle() {
    let cmd = msg::load_bytes().expect("Failed to load handle payload");
    gstd::assert!(!cmd.is_empty(), "Handle payload cannot be empty");

    unsafe {
        match cmd[0] {
            // Action 1: Set a relayer in a specific slot.
            // Payload: [1, relayer_actor_id (32 bytes), slot (1 byte: 1, 2, or 3)]
            1 => {
                gstd::assert_eq!(<[u8; 32]>::from(msg::source()), ADMIN, "Only admin can set relayers");
                gstd::assert!(cmd.len() == 34, "Invalid SET_RELAYER payload length");

                let relayer: [u8; 32] = cmd[1..33].try_into().expect("Invalid relayer bytes");
                let slot = cmd[33];

                match slot {
                    1 => RELAYER_1 = relayer,
                    2 => RELAYER_2 = relayer,
                    3 => RELAYER_3 = relayer,
                    _ => panic!("Invalid relayer slot. Must be 1, 2, or 3."),
                }

                msg::reply_bytes(&[1], 0).expect("Failed to reply to SET_RELAYER");
            }

            // Action 2: A relayer submits an attestation for a milestone.
            // Payload: [2, milestone_idx (1 byte), new_percent (2 bytes LE), tests_passed (1 byte: 0 or 1)]
            2 => {
                let source_actor: [u8; 32] = msg::source().into();
                gstd::assert!(
                    source_actor == RELAYER_1
                        || source_actor == RELAYER_2
                        || source_actor == RELAYER_3,
                    "Only whitelisted relayers can submit attestations"
                );
                 gstd::assert!(cmd.len() == 5, "Invalid SUBMIT_ATTESTATION payload length");

                let milestone_idx = cmd[1];
                let new_percent = u16::from_le_bytes(cmd[2..4].try_into().expect("Invalid new_percent bytes"));
                let tests_passed = cmd[4];

                let last_percent_ref = match milestone_idx {
                    1 => &mut MILESTONE_1_LAST_PERCENT,
                    2 => &mut MILESTONE_2_LAST_PERCENT,
                    3 => &mut MILESTONE_3_LAST_PERCENT,
                    _ => panic!("Invalid milestone index. Must be 1, 2, or 3."),
                };
                
                // Perform validation checks.
                let is_monotonic = new_percent > *last_percent_ref;
                let meets_min_step = (new_percent.saturating_sub(*last_percent_ref)) >= POLICY_MIN_STEP_BPS;
                let tests_ok = !POLICY_TEST_REQUIRED || tests_passed == 1;

                if is_monotonic && meets_min_step && tests_ok {
                    *last_percent_ref = new_percent;

                    // Construct and send the message to the escrow contract.
                    // The escrow contract is expected to handle a payload of:
                    // [milestone_idx (1 byte), new_percent (2 bytes LE)]
                    let mut escrow_payload = Vec::with_capacity(3);
                    escrow_payload.push(milestone_idx);
                    escrow_payload.extend_from_slice(&new_percent.to_le_bytes());
                    
                    msg::send_bytes(ActorId::from(ESCROW_MANAGER), escrow_payload, 0)
                        .expect("Failed to send message to escrow contract");
                    
                    msg::reply_bytes(&[1], 0).expect("Failed to reply to SUBMIT_ATTESTATION");
                } else {
                    // Attestation failed validation, reply with failure code.
                    msg::reply_bytes(&[0], 0).expect("Failed to reply to SUBMIT_ATTESTATION");
                }
            }

            // Action 3: Get the last reported percentage for a milestone.
            // Payload: [3, milestone_idx (1 byte)]
            3 => {
                gstd::assert!(cmd.len() == 2, "Invalid GET_LAST_PERCENT payload length");
                let milestone_idx = cmd[1];

                let last_percent = match milestone_idx {
                    1 => MILESTONE_1_LAST_PERCENT,
                    2 => MILESTONE_2_LAST_PERCENT,
                    3 => MILESTONE_3_LAST_PERCENT,
                    _ => panic!("Invalid milestone index. Must be 1, 2, or 3."),
                };

                msg::reply_bytes(&last_percent.to_le_bytes(), 0)
                    .expect("Failed to reply to GET_LAST_PERCENT");
            }
            
            // Action 4: Update the escrow manager contract address.
            // Payload: [4, new_escrow_manager (32 bytes)]
            4 => {
                gstd::assert_eq!(<[u8; 32]>::from(msg::source()), ADMIN, "Only admin can set escrow manager");
                gstd::assert!(cmd.len() == 33, "Invalid SET_ESCROW payload length");

                let new_escrow: [u8; 32] = cmd[1..33].try_into().expect("Invalid escrow bytes");
                gstd::assert!(new_escrow != ZERO_ACTOR, "Escrow manager cannot be the zero address");
                ESCROW_MANAGER = new_escrow;
                
                msg::reply_bytes(&[1], 0).expect("Failed to reply to SET_ESCROW");
            }

            _ => {
                // Unknown action, do nothing or panic.
                panic!("Unknown action");
            }
        }
    }
}