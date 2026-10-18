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

/// The two settlement gates, expressed as one pure rule so they can be tested
/// without a validator clock.
///
/// An owner may settle from `start_ts`; anyone may settle from
/// `end_ts + GRACE_SECONDS`. An overflowing grace deadline is never reached.
pub fn settle_allowed(now: i64, start_ts: i64, end_ts: i64, is_owner: bool) -> bool {
    if is_owner && now >= start_ts {
        return true;
    }
    match end_ts.checked_add(GRACE_SECONDS) {
        Some(deadline) => now >= deadline,
        None => false,
    }
}

pub fn settle_rental_handler(ctx: Context<SettleRental>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    let price_total = ctx.accounts.rental.price_total;
    let deposit = ctx.accounts.rental.deposit_lamports;
    let start_ts = ctx.accounts.rental.start_ts;
    let end_ts = ctx.accounts.rental.end_ts;
    let owner = ctx.accounts.rental.owner;

    let is_owner = ctx.accounts.caller.key() == owner;
    require!(
        settle_allowed(now, start_ts, end_ts, is_owner),
        RentalError::InvalidStatus
    );

    let fee = ctx.accounts.config.fee_on(price_total)?;
    let owner_amount = price_total.checked_sub(fee).ok_or(RentalError::DepositOverflow)?;

    // Three payouts that sum exactly to the escrow: (price - fee) + fee +
    // deposit == price + deposit. `transfer_out` signs with the rental PDA.
    escrow::transfer_out(
        &ctx.accounts.rental,
        &ctx.accounts.owner_wallet.to_account_info(),
        owner_amount,
    )?;
    escrow::transfer_out(
        &ctx.accounts.rental,
        &ctx.accounts.platform_treasury.to_account_info(),
        fee,
    )?;
    escrow::transfer_out(
        &ctx.accounts.rental,
        &ctx.accounts.renter_wallet.to_account_info(),
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

#[cfg(test)]
mod tests {
    use super::settle_allowed;
    use crate::constants::GRACE_SECONDS;

    #[test]
    fn owner_gate_opens_at_start() {
        let start = 1_800_000_000;
        let end = start + 86_400;
        assert!(!settle_allowed(start - 1, start, end, true));
        assert!(settle_allowed(start, start, end, true));
        assert!(settle_allowed(end, start, end, true));
    }

    #[test]
    fn timeout_gate_requires_the_full_grace_period() {
        let start = 1_800_000_000;
        let end = start + 86_400;
        assert!(!settle_allowed(end, start, end, false));
        assert!(!settle_allowed(end + GRACE_SECONDS - 1, start, end, false));
        assert!(settle_allowed(end + GRACE_SECONDS, start, end, false));
    }

    #[test]
    fn an_owner_settling_before_start_does_not_open_the_timeout_gate() {
        let start = 1_800_000_000;
        let end = start + 86_400;
        assert!(!settle_allowed(start - 1, start, end, true));
        assert!(!settle_allowed(start - 1, start, end, false));
    }

    #[test]
    fn an_overflowing_grace_deadline_is_never_reached() {
        assert!(!settle_allowed(i64::MAX, 0, i64::MAX, false));
    }
}
