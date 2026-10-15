//! `settle_rental`: release escrow to the owner, treasury, and renter.
//!
//! Two independent gates accept the call, both requiring an open rental:
//!
//! 1. the listing **owner** may settle from `now >= start_ts` (handover
//!    attestation), or
//! 2. **anyone** may settle from `now >= end_ts + GRACE_SECONDS` (non-return
//!    auto-settle, so an unresponsive owner can never strand escrow).

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::RentalError;
use crate::events::RentalSettled;
use crate::instructions::escrow;
use crate::state::{AssetListing, PlatformConfig, RentalAgreement};

#[derive(Accounts)]
pub struct SettleRental<'info> {
    /// The owner settling early, or any wallet on the timeout path.
    pub caller: Signer<'info>,

    #[account(
        seeds = [PlatformConfig::SEED_PREFIX],
        bump = config.bump,
    )]
    pub config: Account<'info, PlatformConfig>,

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
        constraint = rental.status.is_open() @ RentalError::InvalidStatus,
    )]
    pub rental: Account<'info, RentalAgreement>,

    /// CHECK: payout destination, bound to `rental.owner`.
    #[account(mut, address = rental.owner @ RentalError::InvalidPda)]
    pub owner_wallet: UncheckedAccount<'info>,

    /// CHECK: platform fee destination, bound to `config.treasury`.
    #[account(mut, address = config.treasury @ RentalError::TreasuryMismatch)]
    pub platform_treasury: UncheckedAccount<'info>,

    /// CHECK: deposit refund destination, bound to `rental.renter`.
    #[account(mut, address = rental.renter @ RentalError::InvalidPda)]
    pub renter_wallet: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn settle_rental_handler(ctx: Context<SettleRental>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    let price_total = ctx.accounts.rental.price_total;
    let deposit = ctx.accounts.rental.deposit_lamports;
    let start_ts = ctx.accounts.rental.start_ts;
    let end_ts = ctx.accounts.rental.end_ts;
    let owner = ctx.accounts.rental.owner;

    let is_owner = ctx.accounts.caller.key() == owner;
    let owner_gate = is_owner && now >= start_ts;
    let timeout_gate = now >= end_ts.checked_add(GRACE_SECONDS).ok_or(RentalError::TimeOverflow)?;
    require!(owner_gate || timeout_gate, RentalError::InvalidStatus);

    let fee = ctx.accounts.config.fee_on(price_total)?;
    let owner_amount = price_total.checked_sub(fee).ok_or(RentalError::DepositOverflow)?;

    // Three payouts that sum exactly to the escrow: (price - fee) + fee +
    // deposit == price + deposit. `transfer_out` signs with the rental PDA.
    escrow::transfer_out(
        &ctx.accounts.rental,
        &ctx.accounts.owner_wallet.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        owner_amount,
    )?;
    escrow::transfer_out(
        &ctx.accounts.rental,
        &ctx.accounts.platform_treasury.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        fee,
    )?;
    escrow::transfer_out(
        &ctx.accounts.rental,
        &ctx.accounts.renter_wallet.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        deposit,
    )?;

    let rental = &mut ctx.accounts.rental;
    rental.escrow_lamports = 0;
    rental.status = crate::state::RentalStatus::Completed;

    let listing = &mut ctx.accounts.listing;
    listing.release();
    listing.total_rentals = listing
        .total_rentals
        .checked_add(1)
        .ok_or(RentalError::DepositOverflow)?;

    emit!(RentalSettled {
        rental: rental.key(),
        listing: listing.key(),
        owner_amount,
        fee,
        deposit_refund: deposit,
        settled_by: ctx.accounts.caller.key(),
    });

    Ok(())
}
