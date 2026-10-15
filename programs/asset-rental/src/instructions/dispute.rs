//! `raise_dispute`: either party freezes an open rental. While `Disputed`,
//! `settle_rental` and `cancel_rental` both fail, and only `resolve_dispute`
//! can move the escrow. The listing pointer is intentionally **not** cleared,
//! so no new rental can start on the frozen listing.

use anchor_lang::prelude::*;

use crate::errors::RentalError;
use crate::events::RentalDisputed;
use crate::state::{AssetListing, RentalAgreement, RentalStatus};

#[derive(Accounts)]
pub struct RaiseDispute<'info> {
    /// Must be the rental's owner or renter.
    pub party: Signer<'info>,

    #[account(
        seeds = [AssetListing::SEED_PREFIX, listing.owner.as_ref(), listing.asset_id.as_ref()],
        bump = listing.bump,
    )]
    pub listing: Account<'info, AssetListing>,

    #[account(
        mut,
        has_one = listing,
        seeds = [RentalAgreement::SEED_PREFIX, listing.key().as_ref(), rental.rental_id.as_ref()],
        bump = rental.bump,
        constraint = rental.status.is_open() @ RentalError::InvalidStatus,
    )]
    pub rental: Account<'info, RentalAgreement>,
}

pub fn raise_dispute_handler(ctx: Context<RaiseDispute>) -> Result<()> {
    require!(
        ctx.accounts.rental.is_party(&ctx.accounts.party.key()),
        RentalError::NotRentalParty
    );

    let rental = &mut ctx.accounts.rental;
    rental.status = RentalStatus::Disputed;

    emit!(RentalDisputed {
        rental: rental.key(),
        listing: ctx.accounts.listing.key(),
        by: ctx.accounts.party.key(),
    });

    Ok(())
}
