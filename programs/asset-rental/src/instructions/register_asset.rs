//! `register_asset`: create one rentable listing and its commercial terms.

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::RentalError;
use crate::events::ListingUpdated;
use crate::state::AssetListing;

/// Owner-signed creation of an `AssetListing` at `[b"asset", owner, asset_id]`.
#[derive(Accounts)]
#[instruction(asset_id: [u8; ASSET_ID_LEN])]
pub struct RegisterAsset<'info> {
    /// Listing owner; pays for the account and becomes its authority.
    #[account(mut)]
    pub owner: Signer<'info>,

    /// New listing. Created with `init`, so a reused `asset_id` fails account
    /// creation and rolls the whole transaction back.
    #[account(
        init,
        payer = owner,
        space = AssetListing::LEN,
        seeds = [AssetListing::SEED_PREFIX, owner.key().as_ref(), asset_id.as_ref()],
        bump,
    )]
    pub listing: Account<'info, AssetListing>,

    pub system_program: Program<'info, System>,
}

pub fn register_asset_handler(
    ctx: Context<RegisterAsset>,
    asset_id: [u8; ASSET_ID_LEN],
    category: u16,
    price_per_day: u64,
    deposit: u64,
    max_days: u16,
    metadata_hash: [u8; METADATA_HASH_LEN],
) -> Result<()> {
    require!(price_per_day > 0, RentalError::InvalidPrice);
    require!(max_days >= 1 && max_days <= MAX_DAYS, RentalError::InvalidDuration);

    let now = Clock::get()?.unix_timestamp;
    let owner = ctx.accounts.owner.key();
    let listing = &mut ctx.accounts.listing;

    listing.owner = owner;
    listing.asset_id = asset_id;
    listing.category = category;
    listing.price_per_day = price_per_day;
    listing.deposit_lamports = deposit;
    listing.max_days = max_days;
    listing.metadata_hash = metadata_hash;
    listing.active = true;
    listing.current_rental = Pubkey::default();
    listing.busy_until = 0;
    listing.total_rentals = 0;
    listing.created_at = now;
    listing.bump = ctx.bumps.listing;

    emit!(ListingUpdated {
        listing: listing.key(),
        owner,
        asset_id,
        category,
        price_per_day,
        deposit_lamports: deposit,
        max_days,
        metadata_hash,
        active: true,
    });

    Ok(())
}
