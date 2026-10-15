//! `close_rental`: reclaim a terminated rental's rent-exempt lamports to the
//! renter, who funded the account. Permissionless: the destination is fixed to
//! `rental.renter`, so any caller is safe.

use anchor_lang::prelude::*;

use crate::errors::RentalError;
use crate::events::RentalClosed;
use crate::state::RentalAgreement;

#[derive(Accounts)]
pub struct CloseRental<'info> {
    /// Closed back to the renter; the `close` attribute returns the rent.
    #[account(
        mut,
        close = renter_wallet,
        seeds = [RentalAgreement::SEED_PREFIX, rental.listing.as_ref(), rental.rental_id.as_ref()],
        bump = rental.bump,
        constraint = rental.status.is_terminal() @ RentalError::InvalidStatus,
    )]
    pub rental: Account<'info, RentalAgreement>,

    /// CHECK: receives the reclaimed rent, bound to `rental.renter`.
    #[account(mut, address = rental.renter @ RentalError::InvalidPda)]
    pub renter_wallet: UncheckedAccount<'info>,
}

pub fn close_rental_handler(ctx: Context<CloseRental>) -> Result<()> {
    let rental = &ctx.accounts.rental;
    let rent_reclaimed = rental.to_account_info().lamports();

    emit!(RentalClosed {
        rental: rental.key(),
        renter: rental.renter,
        rent_reclaimed,
    });

    Ok(())
}
