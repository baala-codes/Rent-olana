//! `cancel_rental`: either party cancels before the start time and the renter
//! is refunded in full. Post-start cancellation is denied.

use anchor_lang::prelude::*;

use crate::errors::RentalError;
use crate::events::RentalCancelled;
use crate::instructions::escrow;
use crate::state::{AssetListing, RentalAgreement, RentalStatus};

#[derive(Accounts)]
pub struct CancelRental<'info> {
    /// Must be the rental's owner or renter.
    pub party: Signer<'info>,

    #[account(
        mut,
        seeds = [AssetListing::SEED_PREFIX, listing.owner.as_ref(), listing.asset_id.as_ref()],
        bump = listing.bump,
    )]
    pub listing: Account<'info, AssetListing>,

    #[account(
        mut,
        has_one = listing,
        seeds = [RentalAgreement::SEED_PREFIX, listing.key().as_ref(), rental.rental_id.as_ref()],
        bump = rental.bump,
        constraint = rental.status == RentalStatus::Reserved @ RentalError::InvalidStatus,
    )]
    pub rental: Account<'info, RentalAgreement>,

    /// CHECK: refund destination, bound to `rental.renter`.
    #[account(mut, address = rental.renter @ RentalError::InvalidPda)]
    pub renter_wallet: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn cancel_rental_handler(ctx: Context<CancelRental>) -> Result<()> {
    require!(
        ctx.accounts.rental.is_party(&ctx.accounts.party.key()),
        RentalError::NotRentalParty
    );

    let now = Clock::get()?.unix_timestamp;
    require!(now < ctx.accounts.rental.start_ts, RentalError::CancelTooLate);

    let refund = ctx.accounts.rental.escrow_lamports;
    escrow::transfer_out(
        &ctx.accounts.rental,
        &ctx.accounts.renter_wallet.to_account_info(),
        refund,
    )?;

    let rental = &mut ctx.accounts.rental;
    rental.escrow_lamports = 0;
    rental.status = RentalStatus::Cancelled;

    // `total_rentals` counts completed rentals only, so cancellation does not
    // increment it, but the booking pointer is released.
    let listing = &mut ctx.accounts.listing;
    listing.release();

    emit!(RentalCancelled {
        rental: rental.key(),
        listing: listing.key(),
        refund,
        cancelled_by: ctx.accounts.party.key(),
    });

    Ok(())
}
