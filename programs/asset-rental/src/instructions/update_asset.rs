//! `update_asset`: owner edits terms. Price, deposit, and max days are frozen
//! while a rental holds the listing; metadata and category are always editable.

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::RentalError;
use crate::events::ListingUpdated;
use crate::state::AssetListing;

/// Owner-signed update of an existing listing.
#[derive(Accounts)]
pub struct UpdateAsset<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        has_one = owner @ RentalError::NotListingOwner,
        seeds = [AssetListing::SEED_PREFIX, owner.key().as_ref(), listing.asset_id.as_ref()],
        bump = listing.bump,
    )]
    pub listing: Account<'info, AssetListing>,
}

pub fn update_asset_handler(
    ctx: Context<UpdateAsset>,
    price_per_day: Option<u64>,
    deposit: Option<u64>,
    max_days: Option<u16>,
    category: Option<u16>,
    metadata_hash: Option<[u8; METADATA_HASH_LEN]>,
) -> Result<()> {
    let listing = &mut ctx.accounts.listing;

    // Economic terms are locked while someone holds the asset, so a booking can
    // never be repriced out from under an already-escrowed rental.
    if price_per_day.is_some() || deposit.is_some() || max_days.is_some() {
        require!(!listing.is_rented(), RentalError::InvalidStatus);
    }

    if let Some(price) = price_per_day {
        require!(price > 0, RentalError::InvalidPrice);
        listing.price_per_day = price;
    }
    if let Some(deposit) = deposit {
        listing.deposit_lamports = deposit;
    }
    if let Some(days) = max_days {
        require!(days >= 1 && days <= MAX_DAYS, RentalError::InvalidDuration);
        listing.max_days = days;
    }
    if let Some(category) = category {
        listing.category = category;
    }
    if let Some(metadata_hash) = metadata_hash {
        listing.metadata_hash = metadata_hash;
    }

    emit!(ListingUpdated {
        listing: listing.key(),
        owner: listing.owner,
        asset_id: listing.asset_id,
        category: listing.category,
        price_per_day: listing.price_per_day,
        deposit_lamports: listing.deposit_lamports,
        max_days: listing.max_days,
        metadata_hash: listing.metadata_hash,
        active: listing.active,
    });

    Ok(())
}
