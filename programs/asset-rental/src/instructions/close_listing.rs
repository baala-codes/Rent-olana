//! `close_listing`: owner reclaims a listing's rent once it has no open rental.

use anchor_lang::prelude::*;

use crate::errors::RentalError;
use crate::events::ListingClosed;
use crate::state::AssetListing;

#[derive(Accounts)]
pub struct CloseListing<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// Closed back to `owner`; `close` returns the rent-exempt lamports.
    // Seeds come from the account's stored `owner`, so a non-owner who passes
    // the real listing account is rejected by `has_one = owner`
    // (`NotListingOwner`) instead of a mismatched seed set.
    #[account(
        mut,
        close = owner,
        has_one = owner @ RentalError::NotListingOwner,
        seeds = [AssetListing::SEED_PREFIX, listing.owner.as_ref(), listing.asset_id.as_ref()],
        bump = listing.bump,
    )]
    pub listing: Account<'info, AssetListing>,
}

pub fn close_listing_handler(ctx: Context<CloseListing>) -> Result<()> {
    // The pointer is the authoritative "someone holds this asset" flag. A
    // disputed rental keeps it set, so a disputed listing cannot be closed
    // either, which protects the escrow.
    require!(!ctx.accounts.listing.is_rented(), RentalError::InvalidStatus);

    emit!(ListingClosed {
        listing: ctx.accounts.listing.key(),
        owner: ctx.accounts.listing.owner,
    });

    Ok(())
}
