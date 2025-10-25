#
![no_std]
use gstd::{msg, prelude::*, ActorId};

// State variables using static mut, as required.
static mut OWNER: [u8; 32] = [0; 32];
static mut DEVELOPER: [u8; 32] = [0; 32];
static mut BUDGET: u128 = 0;
static mut IS_ACTIVE: bool = false;
static mut IS_FUNDED: bool = false;
static mut DEVELOPER_SELECTED: bool = false;
static mut PROGRESS_POOL: u128 = 0;
static mut FINAL_POOL: u128 = 0;
static mut RELEASED_PROGRESS: u128 = 0;
static mut RELEASED_FINAL: u128 = 0;
static mut MILESTONE_1_PERCENT: u16 = 0; // Basis points (0-10000)

static mut MILESTONE_2_PERCENT: u16 = 0; // Basis points (0-10000)
static mut MILESTONE_3_PERCENT: u16 = 0; // Basis points (0-10000)
static mut AUTHORIZED_VERIFIER: [u8; 32] = [0; 32];
static mut TREASURY: [u8; 32] = [0; 32];
static mut USDC_TOKEN: [u8; 32] = [0; 32];

const BPS_MAX: u128 = 10000;
const SUCCESS_REPLY: [u8; 1] = [1];
const FAILURE_REPLY: [u8; 1] = [0];

#[no_mangle]
extern "C" fn init() {
    let payload = msg::load_bytes().expect("Failed to load init payload");
    gstd::assert!(payload.len() == 64, "Invalid init payload length");

    unsafe {
        OWNER = *msg::source().as_ref();
        TREASURY.copy_from_slice(&payload[0..32]);
        USDC_TOKEN.copy_from_slice(&payload[32..64]);
    }
    // A real contract would likely verify these addresses are valid contracts.

    msg::reply_bytes(&SUCCESS_REPLY, 0).expect("Failed to reply in init");
}

#[no_mangle]
extern "C" fn handle() {
    let cmd_bytes = msg::load_bytes().expect("Failed to load command bytes");
    gstd::assert!(!cmd_bytes.is_empty(), "Command cannot be empty");

    let source = msg::source();
    let source_bytes = *source.as_ref();

    unsafe {
        match cmd_bytes[0] {
            // 1. CREATE_PROJECT [1, budget(16 LE)]
            1 => {
                gstd::assert_eq!(source_bytes, OWNER, "Only owner can create a project");
                gstd::assert!(!IS_ACTIVE, "Project already created");
                gstd::assert!(cmd_bytes.len() == 17, "Invalid payload for CREATE_PROJECT");

                let budget_bytes: [u8; 16] = cmd_bytes[1..17]
                    .try_into()
                    .expect("Invalid budget bytes");
                BUDGET = u128::from_le_bytes(budget_bytes);
                gstd::assert!(BUDGET > 0, "Budget must be greater than zero");
                IS_ACTIVE = true;

                msg::reply_bytes(&SUCCESS_REPLY, 0).expect("Reply failed");
            }

            // 2. FUND_PROJECT [2]
            2 => {
                gstd::assert_eq!(source_bytes, OWNER, "Only owner can fund the project");
                gstd::assert!(IS_ACTIVE, "Project is not active");
                gstd::assert!(!IS_FUNDED, "Project is already funded");

                let fee = BUDGET.checked_mul(5).unwrap().checked_div(100).unwrap();
                let net_budget = BUDGET.checked_sub(fee).unwrap();

                // 60% of net budget for progress milestones
                PROGRESS_POOL = net_budget.checked_mul(60).unwrap().checked_div(100).unwrap();
                // 35% of net budget for final payment
                FINAL_POOL = net_budget.checked_mul(35).unwrap().checked_div(100).unwrap();

                IS_FUNDED = true;

                msg::reply_bytes(&SUCCESS_REPLY, 0).expect("Reply failed");
            }

            // 3. SELECT_DEVELOPER [3, dev(32)]
            3 => {
                gstd::assert_eq!(source_bytes, OWNER, "Only owner can select a developer");
                gstd::assert!(IS_FUNDED, "Project must be funded first");
                gstd::assert!(!DEVELOPER_SELECTED, "Developer already selected");
                gstd::assert!(cmd_bytes.len() == 33, "Invalid payload for SELECT_DEVELOPER");

                DEVELOPER.copy_from_slice(&cmd_bytes[1..33]);
                DEVELOPER_SELECTED = true;

                msg::reply_bytes(&SUCCESS_REPLY, 0).expect("Reply failed");
            }

            // 4. APPLY_PROGRESS [4, milestone_idx(1), new_percent(2 LE)]
            4 => {
                gstd::assert_eq!(source_bytes, AUTHORIZED_VERIFIER, "Only the verifier can apply progress");
                gstd::assert!(DEVELOPER_SELECTED, "Developer must be selected");
                gstd::assert!(cmd_bytes.len() == 4, "Invalid payload for APPLY_PROGRESS");

                let milestone_idx = cmd_bytes[1];
                let percent_bytes: [u8; 2] = cmd_bytes[2..4].try_into().expect("Invalid percent bytes");
                let new_percent = u16::from_le_bytes(percent_bytes);
                gstd::assert!(new_percent <= BPS_MAX as u16, "Percentage cannot exceed 10000 bps");

                let current_total_percent = MILESTONE_1_PERCENT as u128 + MILESTONE_2_PERCENT as u128 + MILESTONE_3_PERCENT as u128;

                let mut update_successful = false;

                match milestone_idx {
                    1 => {
                        if new_percent > MILESTONE_1_PERCENT {
                            MILESTONE_1_PERCENT = new_percent;
                            update_successful = true;
                        }
                    }
                    2 => {
                        if new_percent > MILESTONE_2_PERCENT {
                            MILESTONE_2_PERCENT = new_percent;
                            update_successful = true;
                        }
                    }
                    3 => {
                        if new_percent > MILESTONE_3_PERCENT {
                            MILESTONE_3_PERCENT = new_percent;
                            update_successful = true;
                        }
                    }
                    _ => gstd::panic!("Invalid milestone index"),
                }

                if update_successful {
                    let new_total_percent = MILESTONE_1_PERCENT as u128 + MILESTONE_2_PERCENT as u128 + MILESTONE_3_PERCENT as u128;
                    // Total percent is out of 30000 bps (3 * 10000)
                    let total_releasable = PROGRESS_POOL.checked_mul(new_total_percent).unwrap()
                        .checked_div(BPS_MAX * 3).unwrap();
                    
                    let payout_delta = total_releasable.checked_sub(RELEASED_PROGRESS).unwrap();

                    if payout_delta > 0 {
                        RELEASED_PROGRESS = RELEASED_PROGRESS.checked_add(payout_delta).unwrap();
                        // In a real contract, this would trigger a gclient::transfer call to USDC_TOKEN
                        // to send `payout_delta` to `DEVELOPER`.
                    }
                    msg::reply_bytes(&SUCCESS_REPLY, 0).expect("Reply failed");
                } else {
                    // Non-monotonic update is not an error, but we reply failure.
                    msg::reply_bytes(&FAILURE_REPLY, 0).expect("Reply failed");
                }
            }

            // 5. MARK_FINAL_APPROVED [5]
            5 => {
                gstd::assert_eq!(source_bytes, OWNER, "Only owner can mark as final");
                gstd::assert!(RELEASED_FINAL == 0, "Final payment already released");
                gstd::assert!(MILESTONE_1_PERCENT == BPS_MAX as u16, "Milestone 1 not complete");
                gstd::assert!(MILESTONE_2_PERCENT == BPS_MAX as u16, "Milestone 2 not complete");
                gstd::assert!(MILESTONE_3_PERCENT == BPS_MAX as u16, "Milestone 3 not complete");

                RELEASED_FINAL = FINAL_POOL;
                // In a real contract, this would trigger a gclient::transfer call to USDC_TOKEN
                // to send `FINAL_POOL` to `DEVELOPER`.

                msg::reply_bytes(&SUCCESS_REPLY, 0).expect("Reply failed");
            }

            // 6. SET_VERIFIER [6, verifier(32)]
            6 => {
                gstd::assert_eq!(source_bytes, OWNER, "Only owner can set the verifier");
                gstd::assert!(cmd_bytes.len() == 33, "Invalid payload for SET_VERIFIER");

                AUTHORIZED_VERIFIER.copy_from_slice(&cmd_bytes[1..33]);

                msg::reply_bytes(&SUCCESS_REPLY, 0).expect("Reply failed");
            }

            _ => {
                gstd::panic!("Unknown command");
            }
        }
    }
}