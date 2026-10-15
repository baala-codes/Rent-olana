//! `set_listing_status`: owner activates or deactivates a listing for new
//! bookings. Open rentals are unaffected.

use anchor_lang::prelude::*;

use crate::errors::RentalError;
use crate::events::ListingStatusChanged;
use crate::state::AssetListing;

#[derive(Accounts)]
pub struct SetListingStatus<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        has_one = owner @ RentalError::NotListingOwner,
        seeds = [AssetListing::SEED_PREFIX, owner.key().as_ref(), listing.asset_id.as_ref()],
        bump = listing.bump,
    )]
    pub listing: Account<'info, AssetListing>,
}

pub fn set_listing_status_handler(ctx: Context<SetListingStatus>, active: bool) -> Result<()> {
    let listing = &mut ctx.accounts.listing;
    listing.active = active;

    emit!(ListingStatusChanged {
        listing: listing.key(),
        owner: listing.owner,
        active,
    });

    Ok(())
}
