//! `resolve_dispute`: the admin splits a frozen escrow by `owner_share_bps`
//! (`0` = full refund to the renter, `10_000` = full award to the owner). This
//! is the only path that can move escrow out of `Disputed`.

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::RentalError;
use crate::events::RentalResolved;
use crate::instructions::escrow;
use crate::state::{AssetListing, PlatformConfig, RentalAgreement, RentalStatus};

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    /// Must be `config.admin`.
    pub admin: Signer<'info>,

    #[account(
        seeds = [PlatformConfig::SEED_PREFIX],
        bump = config.bump,
        has_one = admin @ RentalError::Unauthorized,
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
        constraint = rental.status == RentalStatus::Disputed @ RentalError::InvalidStatus,
    )]
    pub rental: Account<'info, RentalAgreement>,

    /// CHECK: owner payout destination, bound to `rental.owner`.
    #[account(mut, address = rental.owner @ RentalError::InvalidPda)]
    pub owner_wallet: UncheckedAccount<'info>,

    /// CHECK: renter payout destination, bound to `rental.renter`.
    #[account(mut, address = rental.renter @ RentalError::InvalidPda)]
    pub renter_wallet: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn resolve_dispute_handler(
    ctx: Context<ResolveDispute>,
    owner_share_bps: u16,
) -> Result<()> {
    require!(
        owner_share_bps <= BPS_DENOMINATOR as u16,
        RentalError::InvalidShare
    );

    let (to_owner, to_renter) = ctx.accounts.rental.split(owner_share_bps)?;

    escrow::transfer_out(
        &ctx.accounts.rental,
        &ctx.accounts.owner_wallet.to_account_info(),
        to_owner,
    )?;
    escrow::transfer_out(
        &ctx.accounts.rental,
        &ctx.accounts.renter_wallet.to_account_info(),
        to_renter,
    )?;

    let rental = &mut ctx.accounts.rental;
    rental.escrow_lamports = 0;
    rental.status = RentalStatus::Resolved;

    let listing = &mut ctx.accounts.listing;
    listing.release();

    emit!(RentalResolved {
        rental: rental.key(),
        listing: listing.key(),
        owner_amount: to_owner,
        renter_amount: to_renter,
        owner_share_bps,
    });

    Ok(())
}
