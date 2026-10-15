//! # Solana physical-asset rental marketplace program
//!
//! Owners register physical assets for rent; renters book a bounded period and
//! escrow the price plus a deposit in native SOL; the program holds that escrow
//! until the rental settles, is cancelled, or is resolved after a dispute.
//! Solana is the source of truth for funds and rental state; the backend only
//! mirrors what it can verify here.
//!
//! ## Accounts (all owned by this program)
//!
//! | Account | Seeds |
//! | --- | --- |
//! | `PlatformConfig` | `"config"` |
//! | `AssetListing` | `"asset"` + owner + `asset_id` |
//! | `RentalAgreement` | `"rental"` + listing + `rental_id` |
//!
//! ## Instructions
//!
//! Admin-signed: `initialize_config`, `set_config`, `resolve_dispute`.
//! Owner-signed: `register_asset`, `update_asset`, `set_listing_status`,
//! `close_listing`, `settle_rental` (owner gate).
//! Renter-signed: `create_rental`.
//! Either party: `cancel_rental`, `raise_dispute`.
//! Permissionless: `settle_rental` (grace gate), `close_rental`.
//!
//! ## Invariants
//!
//! 1. **Escrow only moves through three instructions.** `settle_rental`,
//!    `cancel_rental`, and `resolve_dispute` are the only paths that pay
//!    lamports out of a `RentalAgreement`, and each is gated by time, status,
//!    and/or party. There is no admin sweep.
//! 2. **The treasury and fee come from `PlatformConfig`.** No instruction
//!    accepts either from the client, so no caller can redirect a fee.
//! 3. **A rental ID can never be booked twice.** `RentalAgreement` is created
//!    with `init` at `[b"rental", listing, rental_id]`, so a reused ID fails
//!    account creation and rolls the whole transaction back. There is no
//!    pre-check to race.
//! 4. **Single occupancy.** A rental must start at or after the listing's
//!    monotonic `busy_until` watermark, which is set to `end_ts` on every
//!    booking, so overlapping rentals cannot coexist.
//! 5. **Escrow conservation.** Every terminal path pays out exactly
//!    `escrow_lamports` and then zeroes it: `Σ payouts == escrow` holds per
//!    rental, and escrowed lamports never move while `Disputed`.
//! 6. **Booking, escrow, and state move together.** The transfer and every
//!    state write happen in one instruction; any failure leaves all of it
//!    unchanged.

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

// The glob is required: `#[derive(Accounts)]` generates `__client_accounts_*`
// modules beside each account struct, and `#[program]` resolves them as
// `crate::__client_accounts_*`. Re-exporting the instruction modules' contents
// puts those generated modules back at the crate root. See
// `instructions/mod.rs` for the full explanation.
pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("9CN7pM6aw4aYiNb5h715tvE7xeLA31WXMVbUcpmYohxo");

#[program]
pub mod asset_rental {
    use super::*;

    /// Create the singleton `PlatformConfig`. Callable once.
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        treasury: Pubkey,
        fee_bps: u16,
    ) -> Result<()> {
        instructions::config::initialize_config_handler(ctx, treasury, fee_bps)
    }

    /// Update treasury, fee, and/or the pause switch. Admin only.
    pub fn set_config(
        ctx: Context<SetConfig>,
        treasury: Option<Pubkey>,
        fee_bps: Option<u16>,
        paused: Option<bool>,
    ) -> Result<()> {
        instructions::config::set_config_handler(ctx, treasury, fee_bps, paused)
    }

    /// Register one rentable asset and its terms.
    pub fn register_asset(
        ctx: Context<RegisterAsset>,
        asset_id: [u8; ASSET_ID_LEN],
        category: u16,
        price_per_day: u64,
        deposit: u64,
        max_days: u16,
        metadata_hash: [u8; METADATA_HASH_LEN],
    ) -> Result<()> {
        instructions::register_asset::register_asset_handler(
            ctx,
            asset_id,
            category,
            price_per_day,
            deposit,
            max_days,
            metadata_hash,
        )
    }

    /// Update a listing. Price, deposit, and max days are frozen while rented.
    pub fn update_asset(
        ctx: Context<UpdateAsset>,
        price_per_day: Option<u64>,
        deposit: Option<u64>,
        max_days: Option<u16>,
        category: Option<u16>,
        metadata_hash: Option<[u8; METADATA_HASH_LEN]>,
    ) -> Result<()> {
        instructions::update_asset::update_asset_handler(
            ctx,
            price_per_day,
            deposit,
            max_days,
            category,
            metadata_hash,
        )
    }

    /// Activate or deactivate a listing for new bookings.
    pub fn set_listing_status(ctx: Context<SetListingStatus>, active: bool) -> Result<()> {
        instructions::set_listing_status::set_listing_status_handler(ctx, active)
    }

    /// Close a listing that has no open rental and reclaim its rent.
    pub fn close_listing(ctx: Context<CloseListing>) -> Result<()> {
        instructions::close_listing::close_listing_handler(ctx)
    }

    /// Book a listing for `[start_ts, start_ts + days * SECONDS_PER_DAY]` and
    /// escrow `price_per_day * days + deposit`.
    pub fn create_rental(
        ctx: Context<CreateRental>,
        rental_id: [u8; RENTAL_ID_LEN],
        start_ts: i64,
        days: u16,
    ) -> Result<()> {
        instructions::create_rental::create_rental_handler(ctx, rental_id, start_ts, days)
    }

    /// Settle a rental: the owner may from `start_ts`, anyone from
    /// `end_ts + GRACE_SECONDS`.
    pub fn settle_rental(ctx: Context<SettleRental>) -> Result<()> {
        instructions::settle_rental::settle_rental_handler(ctx)
    }

    /// Cancel a rental before its start time and refund the renter in full.
    pub fn cancel_rental(ctx: Context<CancelRental>) -> Result<()> {
        instructions::cancel_rental::cancel_rental_handler(ctx)
    }

    /// Freeze an open rental's escrow until the admin resolves it.
    pub fn raise_dispute(ctx: Context<RaiseDispute>) -> Result<()> {
        instructions::dispute::raise_dispute_handler(ctx)
    }

    /// Split a disputed escrow between the rental's owner and renter.
    pub fn resolve_dispute(ctx: Context<ResolveDispute>, owner_share_bps: u16) -> Result<()> {
        instructions::resolve_dispute::resolve_dispute_handler(ctx, owner_share_bps)
    }

    /// Close a settled rental agreement and reclaim its rent.
    pub fn close_rental(ctx: Context<CloseRental>) -> Result<()> {
        instructions::close_rental::close_rental_handler(ctx)
    }
}
