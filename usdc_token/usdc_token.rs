#
![no_std]

use gstd::{msg, prelude::*, ActorId};

// The contract's state is stored in static mutable variables.
// This is a simple approach required for this specific problem, avoiding complex state management.

// The administrator of the contract, typically the creator.
static mut ADMIN: [u8; 32] = [0; 32];
// The total number of tokens in circulation.
static mut TOTAL_SUPPLY: u128 = 0;

// A fixed-size array-like structure to store account data.
// This is intentionally simple and limited to 5 accounts as per the user request.
static mut ACCOUNT_1: [u8; 32] = [0; 32];
static mut BALANCE_1: u128 = 0;
static mut ACCOUNT_2: [u8; 32] = [0; 32];
static mut BALANCE_2: u128 = 0;
static mut ACCOUNT_3: [u8; 32] = [0; 32];
static mut BALANCE_3: u128 = 0;
static mut ACCOUNT_4: [u8; 32] = [0; 32];
static mut BALANCE_4: u128 = 0;
static mut ACCOUNT_5: [u8; 32] = [0; 32];
static mut BALANCE_5: u128 = 0;

// Constants for reply messages.
const SUCCESS_REPLY: [u8; 1] = [1];
const FAILURE_REPLY: [u8; 1] = [0];

// Helper function to find an account's slot index (1-5)
.
// Returns 0 if the account is not found.
unsafe fn find_account_slot(account_id: &[u8; 32]) -> u8 {
    if *account_id == ACCOUNT_1 && *account_id != [0u8; 32] {
        return 1;
    }
    if *account_id == ACCOUNT_2 && *account_id != [0u8; 32] {
        return 2;
    }
    if *account_id == ACCOUNT_3 && *account_id != [0u8; 32] {
        return 3;
    }
    if *account_id == ACCOUNT_4 && *account_id != [0u8; 32] {
        return 4;
    }
    if *account_id == ACCOUNT_5 && *account_id != [0u8; 32] {
        return 5;
    }
    0 // Not found
}

// Helper function to find an existing account or create a new one in an empty slot.
// Returns the slot index (1-5) or 0 if no empty slots are available.
unsafe fn find_or_create_account_slot(account_id: &[u8; 32]) -> u8 {
    let existing_slot = find_account_slot(account_id);
    if existing_slot != 0 {
        return existing_slot;
    }

    // Find an empty slot and assign the account to it.
    if ACCOUNT_1 == [0u8; 32] {
        ACCOUNT_1 = *account_id;
        return 1;
    }
    if ACCOUNT_2 == [0u8; 32] {
        ACCOUNT_2 = *account_id;
        return 2;
    }
    if ACCOUNT_3 == [0u8; 32] {
        ACCOUNT_3 = *account_id;
        return 3;
    }
    if ACCOUNT_4 == [0u8; 32] {
        ACCOUNT_4 = *account_id;
        return 4;
    }
    if ACCOUNT_5 == [0u8; 32] {
        ACCOUNT_5 = *account_id;
        return 5;
    }

    0 // No empty slots available
}

// Helper function to get a mutable reference to a balance based on its slot.
// Panics if the slot is invalid (should be checked before calling).
unsafe fn get_balance_mut_by_slot(slot: u8) -> &'static mut u128 {
    match slot {
        1 => &mut BALANCE_1,
        2 => &mut BALANCE_2,
        3 => &mut BALANCE_3,
        4 => &mut BALANCE_4,
        5 => &mut BALANCE_5,
        _ => panic!("Invalid account slot"),
    }
}

// Helper function to get a copy of a balance based on its slot.
unsafe fn get_balance_by_slot(slot: u8) -> u128 {
    match slot {
        1 => BALANCE_1,
        2 => BALANCE_2,
        3 => BALANCE_3,
        4 => BALANCE_4,
        5 => BALANCE_5,
        _ => 0,
    }
}

#[no_mangle]
extern "C" fn init() {
    let source_id: [u8; 32] = msg::source().into();
    unsafe {
        ADMIN = source_id;
        TOTAL_SUPPLY = 0;
    }
    // Reply with success message.
    msg::reply_bytes(&SUCCESS_REPLY, 0).expect("Failed to reply in init");
}

#[no_mangle]
extern "C" fn handle() {
    // Load the incoming message payload as bytes.
    let payload = msg::load_bytes().expect("Failed to load payload");
    if payload.is_empty() {
        // Ignore empty payloads.
        return;
    }

    let action = payload[0];
    let source_id: [u8; 32] = msg::source().into();

    unsafe {
        match action {
            // Action 1: Mint new tokens
            // Payload: [1, to_address(32 bytes), amount(16 bytes LE)]
            1 => {
                // Only the admin can mint tokens.
                if source_id != ADMIN {
                    msg::reply_bytes(&FAILURE_REPLY, 0).expect("Reply failed");
                    return;
                }

                // Check payload length: 1 (action) + 32 (address) + 16 (amount) = 49
                if payload.len() != 49 {
                    msg::reply_bytes(&FAILURE_REPLY, 0).expect("Reply failed");
                    return;
                }

                let to_account: [u8; 32] = payload[1..33].try_into().expect("Invalid 'to' address");
                let amount = u128::from_le_bytes(payload[33..49].try_into().expect("Invalid amount"));

                let slot = find_or_create_account_slot(&to_account);
                if slot == 0 {
                    // No empty slots available for the new account.
                    msg::reply_bytes(&FAILURE_REPLY, 0).expect("Reply failed");
                    return;
                }

                let balance = get_balance_mut_by_slot(slot);
                
                // Use checked arithmetic to prevent overflows.
                if let (Some(new_balance), Some(new_total_supply)) =
                    (balance.checked_add(amount), TOTAL_SUPPLY.checked_add(amount))
                {
                    *balance = new_balance;
                    TOTAL_SUPPLY = new_total_supply;
                    msg::reply_bytes(&SUCCESS_REPLY, 0).expect("Reply failed");
                } else {
                    // Overflow occurred.
                    msg::reply_bytes(&FAILURE_REPLY, 0).expect("Reply failed");
                }
            }

            // Action 2: Transfer tokens from sender to another account
            // Payload: [2, to_address(32 bytes), amount(16 bytes LE)]
            2 => {
                // Check payload length: 1 (action) + 32 (address) + 16 (amount) = 49
                if payload.len() != 49 {
                    msg::reply_bytes(&FAILURE_REPLY, 0).expect("Reply failed");
                    return;
                }
                
                let to_account: [u8; 32] = payload[1..33].try_into().expect("Invalid 'to' address");
                let amount = u128::from_le_bytes(payload[33..49].try_into().expect("Invalid amount"));

                // Find sender's account slot.
                let sender_slot = find_account_slot(&source_id);
                if sender_slot == 0 {
                    // Sender account does not exist.
                    msg::reply_bytes(&FAILURE_REPLY, 0).expect("Reply failed");
                    return;
                }
                
                // Check for sufficient balance.
                let sender_balance_ref = get_balance_mut_by_slot(sender_slot);
                if *sender_balance_ref < amount {
                    msg::reply_bytes(&FAILURE_REPLY, 0).expect("Reply failed");
                    return;
                }

                // Find or create recipient's account slot.
                let recipient_slot = find_or_create_account_slot(&to_account);
                if recipient_slot == 0 {
                    // No empty slots for recipient.
                    msg::reply_bytes(&FAILURE_REPLY, 0).expect("Reply failed");
                    return;
                }
                
                // Get recipient's balance reference.
                let recipient_balance_ref = get_balance_mut_by_slot(recipient_slot);

                // Perform the transfer using checked arithmetic.
                if let (Some(new_sender_balance), Some(new_recipient_balance)) =
                    (sender_balance_ref.checked_sub(amount), recipient_balance_ref.checked_add(amount))
                {
                    *sender_balance_ref = new_sender_balance;
                    *recipient_balance_ref = new_recipient_balance;
                    msg::reply_bytes(&SUCCESS_REPLY, 0).expect("Reply failed");
                } else {
                    // This case should be rare if checks are done properly but is a safeguard.
                    msg::reply_bytes(&FAILURE_REPLY, 0).expect("Reply failed");
                }
            }

            // Action 5: Query the balance of an account
            // Payload: [5, account_address(32 bytes)]
            5 => {
                // Check payload length: 1 (action) + 32 (address) = 33
                if payload.len() != 33 {
                   msg::reply_bytes(&[0u8; 16], 0).expect("Reply failed");
                   return;
                }
                
                let account_to_query: [u8; 32] = payload[1..33].try_into().expect("Invalid account address");
                
                let slot = find_account_slot(&account_to_query);
                let balance = get_balance_by_slot(slot);
                
                // Reply with the balance as 16 little-endian bytes.
                msg::reply_bytes(&balance.to_le_bytes(), 0).expect("Reply failed");
            }

            _ => {
                // Unknown action, reply with failure.
                msg::reply_bytes(&FAILURE_REPLY, 0).expect("Reply failed");
            }
        }
    }
}