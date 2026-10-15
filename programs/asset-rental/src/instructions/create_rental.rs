//! `create_rental`: book a listing for a bounded period and escrow
//! `price_per_day * days + deposit` in the same transaction.

use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};

use crate::constants::*;
use crate::errors::RentalError;
use crate::events::RentalCreated;
use crate::state::{AssetListing, PlatformConfig, RentalAgreement, RentalStatus};

/// Renter-signed booking. The rental PDA is created with `init`, which is the
/// atomic duplicate-charge guard: a reused `rental_id` fails account creation
/// and rolls back the escrow transfer with it.
#[derive(Accounts)]
#[instruction(rental_id: [u8; RENTAL_ID_LEN], start_ts: i64, days: u16)]
pub struct CreateRental<'info> {
    #[account(mut)]
    pub renter: Signer<'info>,

    #[account(
        seeds = [PlatformConfig::SEED_PREFIX],
        bump = config.bump,
        constraint = !config.paused @ RentalError::PlatformPaused,
    )]
    pub config: Account<'info, PlatformConfig>,

    #[account(
        mut,
        seeds = [AssetListing::SEED_PREFIX, listing.owner.as_ref(), listing.asset_id.as_ref()],
        bump = listing.bump,
        constraint = listing.active @ RentalError::ListingNotActive,
    )]
    pub listing: Account<'info, AssetListing>,

    #[account(
        init,
        payer = renter,
        space = RentalAgreement::LEN,
        seeds = [RentalAgreement::SEED_PREFIX, listing.key().as_ref(), rental_id.as_ref()],
        bump,
    )]
    pub rental: Account<'info, RentalAgreement>,

    pub system_program: Program<'info, System>,
}

pub fn create_rental_handler(
    ctx: Context<CreateRental>,
    rental_id: [u8; RENTAL_ID_LEN],
    start_ts: i64,
    days: u16,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    let renter = ctx.accounts.renter.key();
    let listing_key = ctx.accounts.listing.key();
    let owner = ctx.accounts.listing.owner;
    let price_per_day = ctx.accounts.listing.price_per_day;
    let deposit = ctx.accounts.listing.deposit_lamports;
    let max_days = ctx.accounts.listing.max_days;
    let busy_until = ctx.accounts.listing.busy_until;

    require!(renter != owner, RentalError::RenterIsOwner);
    require!(days >= 1 && days <= max_days, RentalError::InvalidDuration);
    require!(start_ts >= now, RentalError::StartInPast);
    // Single occupancy: the listing exposes a monotonic watermark, so a start
    // before the current booking's end is rejected. No interval set is stored.
    require!(start_ts >= busy_until, RentalError::ListingBusy);

    let price_total = price_per_day
        .checked_mul(days as u64)
        .ok_or(RentalError::DepositOverflow)?;
    let day_span = (days as i64)
        .checked_mul(SECONDS_PER_DAY)
        .ok_or(RentalError::TimeOverflow)?;
    let end_ts = start_ts
        .checked_add(day_span)
        .ok_or(RentalError::TimeOverflow)?;
    let escrow = price_total
        .checked_add(deposit)
        .ok_or(RentalError::DepositOverflow)?;

    // Escrow the price plus deposit into the just-initialized rental PDA. The
    // rental account keeps its rent-exempt minimum on top of `escrow`.
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.renter.to_account_info(),
                to: ctx.accounts.rental.to_account_info(),
            },
        ),
        escrow,
    )?;

    let rental = &mut ctx.accounts.rental;
    rental.listing = listing_key;
    rental.owner = owner;
    rental.renter = renter;
    rental.rental_id = rental_id;
    rental.start_ts = start_ts;
    rental.end_ts = end_ts;
    rental.days = days;
    rental.price_total = price_total;
    rental.deposit_lamports = deposit;
    rental.escrow_lamports = escrow;
    rental.status = RentalStatus::Reserved;
    rental.created_at = now;
    rental.bump = ctx.bumps.rental;

    let listing = &mut ctx.accounts.listing;
    listing.current_rental = rental.key();
    listing.busy_until = end_ts;

    emit!(RentalCreated {
        listing: listing_key,
        rental: rental.key(),
        renter,
        owner,
        start_ts,
        end_ts,
        price_total,
        deposit,
        escrow_lamports: escrow,
    });

    Ok(())
}
