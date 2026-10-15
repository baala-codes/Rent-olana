//! Shared escrow outflows.
//!
//! Every path that pays lamports out of a `RentalAgreement` goes through
//! [`transfer_out`], keeping the debit/credit in one place so
//! `settle_rental`, `cancel_rental`, and `resolve_dispute` cannot drift, and so
//! the "escrow moves only through three instructions" invariant stays
//! auditable.
//!
//! This module declares no accounts and emits no events, so it is not
//! re-exported by `instructions/mod.rs`; it is a plain helper.

use anchor_lang::prelude::*;

use crate::errors::RentalError;
use crate::state::RentalAgreement;

/// Move `amount` lamports from the rental PDA to `to`.
///
/// The rental PDA is a program-owned account that carries data (the
/// `RentalAgreement`), so it **cannot** be the source of a
/// `system_program::transfer`: the runtime rejects that with
/// "`Transfer: \`from\` must not carry data`". The program owns the account, so
/// it debits the lamports directly and credits the destination instead.
///
/// A zero amount is a no-op that skips the mutation entirely, which keeps the
/// caller's transaction valid when (for example) a fee rounds down to zero or a
/// disputed split awards everything to one side. The rental account stays alive
/// with its rent-exempt minimum; `close_rental` reclaims that later.
pub fn transfer_out<'info>(
    rental: &Account<'info, RentalAgreement>,
    to: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }

    let from = rental.to_account_info();

    // Read both balances before taking any `RefMut`, so the two borrows of the
    // lamports cells never overlap.
    let from_lamports = from.lamports();
    let to_lamports = to.lamports();

    **from.try_borrow_mut_lamports()? = from_lamports
        .checked_sub(amount)
        .ok_or(RentalError::DepositOverflow)?;
    **to.try_borrow_mut_lamports()? = to_lamports
        .checked_add(amount)
        .ok_or(RentalError::DepositOverflow)?;

    Ok(())
}
