use anchor_lang::prelude::*;

/// Events are the indexing contract: the backend mirrors rentals from these
/// logs and treats chain state as the source of truth for funds. Every event
/// carries the account addresses a consumer needs to re-read, never raw
/// off-chain content (no coordinates, no PII, no documents).

/// Emitted by `initialize_config`.
#[event]
pub struct ConfigInitialized {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u16,
}

/// Emitted by `set_config`; mirrors the config after the update.
#[event]
pub struct ConfigUpdated {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u16,
    pub paused: bool,
}

/// Emitted by `register_asset` and `update_asset`.
#[event]
pub struct ListingUpdated {
    pub listing: Pubkey,
    pub owner: Pubkey,
    pub asset_id: [u8; 32],
    pub category: u16,
    pub price_per_day: u64,
    pub deposit_lamports: u64,
    pub max_days: u16,
    pub metadata_hash: [u8; 32],
    pub active: bool,
}

/// Emitted by `set_listing_status`.
#[event]
pub struct ListingStatusChanged {
    pub listing: Pubkey,
    pub owner: Pubkey,
    pub active: bool,
}

/// Emitted by `close_listing`.
#[event]
pub struct ListingClosed {
    pub listing: Pubkey,
    pub owner: Pubkey,
}

/// Emitted by `create_rental`.
///
/// `escrow_lamports == price_total + deposit`; the field is `deposit` here and
/// `deposit_lamports` on the account, matching the event contract.
#[event]
pub struct RentalCreated {
    pub listing: Pubkey,
    pub rental: Pubkey,
    pub renter: Pubkey,
    pub owner: Pubkey,
    pub start_ts: i64,
    pub end_ts: i64,
    pub price_total: u64,
    pub deposit: u64,
    pub escrow_lamports: u64,
}

/// Emitted by `settle_rental`. Mirrors the three payouts exactly.
#[event]
pub struct RentalSettled {
    pub rental: Pubkey,
    pub listing: Pubkey,
    pub owner_amount: u64,
    pub fee: u64,
    pub deposit_refund: u64,
    pub settled_by: Pubkey,
}

/// Emitted by `cancel_rental`.
#[event]
pub struct RentalCancelled {
    pub rental: Pubkey,
    pub listing: Pubkey,
    pub refund: u64,
    pub cancelled_by: Pubkey,
}

/// Emitted by `raise_dispute`.
#[event]
pub struct RentalDisputed {
    pub rental: Pubkey,
    pub listing: Pubkey,
    pub by: Pubkey,
}

/// Emitted by `resolve_dispute`.
#[event]
pub struct RentalResolved {
    pub rental: Pubkey,
    pub listing: Pubkey,
    pub owner_amount: u64,
    pub renter_amount: u64,
    pub owner_share_bps: u16,
}

/// Emitted by `close_rental`.
#[event]
pub struct RentalClosed {
    pub rental: Pubkey,
    pub renter: Pubkey,
    pub rent_reclaimed: u64,
}
