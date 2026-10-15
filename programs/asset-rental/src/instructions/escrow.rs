//! Shared escrow outflows.
//!
//! Every path that pays lamports out of a `RentalAgreement` goes through
//! [`transfer_out`], which signs with the rental PDA seeds. Keeping the signing
//! in one place means `settle_rental`, `cancel_rental`, and `resolve_dispute`
//! cannot drift from the `[b"rental", listing, rental_id]` seed layout, and it
//! keeps the "escrow moves only through three instructions" invariant auditable.
//!
//! This module declares no accounts and emits no events, so it is not
//! re-exported by `instructions/mod.rs`; it is a plain helper.

use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};

use crate::state::RentalAgreement;

/// Move `amount` lamports from the rental PDA to `to`, signed by the rental
/// PDA seeds.
///
/// A zero amount is a no-op that skips the CPI entirely, which keeps the
/// caller's transaction valid when (for example) a fee rounds down to zero or a
/// disputed split awards everything to one side. The rental account stays alive
/// with its rent-exempt minimum; `close_rental` reclaims that later.
pub fn transfer_out<'info>(
    rental: &Account<'info, RentalAgreement>,
    to: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }

    let from = rental.to_account_info();
    let seeds: &[&[u8]] = &[
        RentalAgreement::SEED_PREFIX,
        rental.listing.as_ref(),
        rental.rental_id.as_ref(),
        &[rental.bump],
    ];

    system_program::transfer(
        CpiContext::new_with_signer(
            system_program.clone(),
            Transfer {
                from,
                to: to.clone(),
            },
            &[seeds],
        ),
        amount,
    )
}
