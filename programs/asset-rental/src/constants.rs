//! Program-wide constants.
//!
//! These are compiled into the program, so they are part of the published
//! contract: `clients/ts/constants.ts` mirrors them and `docs/CONTRACT.md`
//! documents them. Nothing here is configurable at runtime except through
//! `PlatformConfig`, which is capped by `MAX_FEE_BPS`.

/// How long after a rental's `end_ts` the agreement becomes settleable by
/// anyone. This is the recovery window that guarantees escrow is never stranded
/// when an owner stops responding.
pub const GRACE_SECONDS: i64 = 86_400;

/// Hard cap on `PlatformConfig::fee_bps` (1000 bps = 10%).
pub const MAX_FEE_BPS: u16 = 1_000;

/// Hard cap on how many days one rental may run, and on `AssetListing::max_days`.
/// 36_500 days (100 years) is far beyond any real rental period while keeping
/// `start_ts + days * SECONDS_PER_DAY` an order of magnitude away from `i64`
/// overflow.
pub const MAX_DAYS: u16 = 36_500;

/// Seconds in one rental day. Rentals are priced and booked in whole days.
pub const SECONDS_PER_DAY: i64 = 86_400;

/// Byte length of a listing's stable, random, owner-chosen identifier.
pub const ASSET_ID_LEN: usize = 32;

/// Byte length of every rental identifier (`rental_id`).
pub const RENTAL_ID_LEN: usize = 32;

/// Byte length of the off-chain metadata commitment stored with a listing.
pub const METADATA_HASH_LEN: usize = 32;

/// Basis-point denominator used by the platform fee and the dispute split.
pub const BPS_DENOMINATOR: u64 = 10_000;
