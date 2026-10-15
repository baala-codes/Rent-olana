use anchor_lang::prelude::*;

use crate::constants::*;

/// Singleton platform configuration.
///
/// `treasury` and `fee_bps` are read from *this* account by every instruction
/// that moves lamports. No instruction accepts a treasury or a fee from the
/// client, so a caller can never redirect a fee or reprice a settlement.
#[account]
pub struct PlatformConfig {
    /// Operations authority: may update this config and resolve disputes.
    pub admin: Pubkey,
    /// Receives the platform fee taken from rental price at settlement.
    pub treasury: Pubkey,
    /// Fee in basis points, charged on `RentalAgreement::price_total` only.
    /// Always `<= MAX_FEE_BPS`. The deposit is never fee-bearing.
    pub fee_bps: u16,
    /// When true, `create_rental` is rejected. Settlement, cancellation, and
    /// dispute resolution keep working: pausing must never trap escrow.
    pub paused: bool,
    /// PDA bump seed.
    pub bump: u8,
}

impl PlatformConfig {
    /// Account space: 8 discriminator + 32 + 32 + 2 + 1 + 1 = 76.
    pub const LEN: usize = 8 + 32 + 32 + 2 + 1 + 1;

    /// Seed prefix: `"config"`.
    pub const SEED_PREFIX: &'static [u8] = b"config";

    /// Derive `[b"config"]` under the program ID.
    pub fn pda() -> (Pubkey, u8) {
        Pubkey::find_program_address(&[Self::SEED_PREFIX], &crate::ID)
    }

    /// Platform fee owed on `price_total`, rounded down, with checked
    /// arithmetic. The deposit is deliberately not part of the base.
    pub fn fee_on(&self, price_total: u64) -> Result<u64> {
        let numerator = price_total
            .checked_mul(self.fee_bps as u64)
            .ok_or(RentalError::DepositOverflow)?;
        Ok(numerator / BPS_DENOMINATOR)
    }
}

/// One rentable physical asset, owned by the wallet that registered it.
///
/// The on-chain record carries only commercial terms. Location, photos, and
/// free-text description live off-chain; `metadata_hash` is the commitment to
/// them, and `category` is the only discovery field the program keeps so the
/// backend can index a listing without trusting a client-supplied label.
#[account]
pub struct AssetListing {
    /// Listing owner: registers the asset, sets terms, settles, is paid.
    pub owner: Pubkey,
    /// Stable 32-byte identifier chosen by the owner at registration.
    pub asset_id: [u8; ASSET_ID_LEN],
    /// Coarse category code for off-chain indexing (numeric by design: no
    /// strings on chain, no PII, no coordinates).
    pub category: u16,
    /// Rental price in integer lamports per day. Always `> 0`.
    pub price_per_day: u64,
    /// Refundable deposit in lamports. May be `0`.
    pub deposit_lamports: u64,
    /// Longest rental this owner accepts, in days. Always `1..=MAX_DAYS`.
    pub max_days: u16,
    /// `sha256` (or any 32-byte commitment) of the off-chain listing document.
    pub metadata_hash: [u8; METADATA_HASH_LEN],
    /// When false, `create_rental` is rejected. Open rentals are unaffected.
    pub active: bool,
    /// The rental currently holding this asset, or the default public key when
    /// the listing is free. Cleared by every terminal rental transition.
    pub current_rental: Pubkey,
    /// End of the booking that currently holds this listing, or `0` when the
    /// listing is free. `create_rental` requires `start_ts >= busy_until`, which
    /// is what makes bookings single-occupancy without storing an interval set:
    /// two transactions that both write this account cannot run concurrently, so
    /// the second one always sees the first one's watermark.
    pub busy_until: i64,
    /// Number of rentals that reached `Completed` on this listing.
    pub total_rentals: u64,
    /// Chain time at which the listing was registered.
    pub created_at: i64,
    /// PDA bump seed.
    pub bump: u8,
}

impl AssetListing {
    /// Account space: 8 + 32 + 32 + 2 + 8 + 8 + 2 + 32 + 1 + 32 + 8 + 8 + 8 + 1 = 182.
    pub const LEN: usize = 8
        + 32
        + ASSET_ID_LEN
        + 2
        + 8
        + 8
        + 2
        + METADATA_HASH_LEN
        + 1
        + 32
        + 8
        + 8
        + 8
        + 1;

    /// Seed prefix: `"asset"`.
    pub const SEED_PREFIX: &'static [u8] = b"asset";

    /// Derive `[b"asset", owner, asset_id]` under the program ID.
    pub fn pda(owner: &Pubkey, asset_id: &[u8; ASSET_ID_LEN]) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[Self::SEED_PREFIX, owner.as_ref(), asset_id], &crate::ID)
    }

    /// True while a rental holds this listing.
    pub fn is_rented(&self) -> bool {
        self.current_rental != Pubkey::default()
    }

    /// Release the listing after a rental reached a terminal state.
    ///
    /// Both fields are cleared together: `current_rental` is the authoritative
    /// "is someone holding this asset" flag, and `busy_until` is only
    /// meaningful while that flag is set. Single occupancy survives the reset
    /// because `create_rental` writes this account, and the runtime serializes
    /// writes to the same account.
    pub fn release(&mut self) {
        self.current_rental = Pubkey::default();
        self.busy_until = 0;
    }
}

/// Lifecycle status of one rental agreement.
///
/// `Reserved` = booked, not yet started. `Active` = an open rental that has
/// reached its start time. Both are accepted identically by every gate, so a
/// rental behaves the same in either state; no instruction currently writes
/// `Active` (there is no separate "activate" step), but the variant is part of
/// the declared contract and can be written by a future instruction without a
/// migration. The three terminal states never transition again, and `Disputed`
/// is the only state that freezes escrow.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum RentalStatus {
    /// Booked and paid; the rental period has not started.
    Reserved,
    /// Open rental that has reached its start time.
    Active,
    /// Settled: price minus fee paid to the owner, fee to treasury, deposit
    /// refunded to the renter.
    Completed,
    /// Cancelled before the start time; the renter was refunded in full.
    Cancelled,
    /// Frozen by either party; only `resolve_dispute` can move the escrow.
    Disputed,
    /// Resolved by the admin; escrow split between owner and renter.
    Resolved,
}

impl RentalStatus {
    /// True when a rental is still live and can move.
    ///
    /// `Disputed` is deliberately neither open nor terminal: it blocks
    /// settlement and cancellation, but only `resolve_dispute` may finish it.
    pub fn is_open(&self) -> bool {
        matches!(self, RentalStatus::Reserved | RentalStatus::Active)
    }

    /// True when a rental has finished and `close_rental` may reclaim its rent.
    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            RentalStatus::Completed | RentalStatus::Cancelled | RentalStatus::Resolved
        )
    }
}

/// One escrowed rental of one listing.
///
/// The agreement is the durable, verifiable record of a rental: parties,
/// interval, the exact amounts escrowed, and the terminal outcome. Its address
/// is `[b"rental", listing, rental_id]` and it is created with `init`, so a
/// reused `rental_id` cannot be booked twice — the second transaction fails on
/// account creation and rolls back entirely. There is no pre-check to race.
#[account]
pub struct RentalAgreement {
    /// The `AssetListing` this rental belongs to.
    pub listing: Pubkey,
    /// Listing owner at the time of booking; the settlement payee.
    pub owner: Pubkey,
    /// Renter that booked and funded the escrow.
    pub renter: Pubkey,
    /// Unique 32-byte identifier chosen by the renter before signing.
    pub rental_id: [u8; RENTAL_ID_LEN],
    /// Unix timestamp the rental starts (inclusive).
    pub start_ts: i64,
    /// Unix timestamp the rental ends; `start_ts + days * SECONDS_PER_DAY`.
    pub end_ts: i64,
    /// Length of the rental in whole days.
    pub days: u16,
    /// `price_per_day * days` at booking time, frozen for the rental's life.
    pub price_total: u64,
    /// Deposit refunded to the renter on every terminal path, frozen at booking
    /// time. Excluded from the platform fee.
    pub deposit_lamports: u64,
    /// Lamports escrowed by this agreement: `price_total + deposit_lamports`.
    /// Set to `0` by every terminal transition, which is what makes the
    /// conservation invariant (`sum of payouts == escrow`) checkable on chain.
    pub escrow_lamports: u64,
    /// Lifecycle status.
    pub status: RentalStatus,
    /// Chain time at which the agreement was created.
    pub created_at: i64,
    /// PDA bump seed.
    pub bump: u8,
}

impl RentalAgreement {
    /// Account space: 8 + 32 + 32 + 32 + 32 + 8 + 8 + 2 + 8 + 8 + 8 + 1 + 8 + 1 = 188.
    pub const LEN: usize = 8
        + 32
        + 32
        + 32
        + RENTAL_ID_LEN
        + 8
        + 8
        + 2
        + 8
        + 8
        + 8
        + 1
        + 8
        + 1;

    /// Seed prefix: `"rental"`.
    pub const SEED_PREFIX: &'static [u8] = b"rental";

    /// Derive `[b"rental", listing, rental_id]` under the program ID.
    pub fn pda(listing: &Pubkey, rental_id: &[u8; RENTAL_ID_LEN]) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[Self::SEED_PREFIX, listing.as_ref(), rental_id], &crate::ID)
    }

    /// True when the caller is one of the two parties to this rental.
    pub fn is_party(&self, wallet: &Pubkey) -> bool {
        wallet == &self.owner || wallet == &self.renter
    }

    /// Lamports one side receives when a disputed escrow is split.
    ///
    /// `owner_share_bps` is at most `BPS_DENOMINATOR`, so this never overflows
    /// for any `escrow_lamports` that fits in `u64`.
    pub fn split(&self, owner_share_bps: u16) -> Result<(u64, u64)> {
        let to_owner = self
            .escrow_lamports
            .checked_mul(owner_share_bps as u64)
            .ok_or(RentalError::DepositOverflow)?
            / BPS_DENOMINATOR;
        let to_renter = self
            .escrow_lamports
            .checked_sub(to_owner)
            .ok_or(RentalError::DepositOverflow)?;
        Ok((to_owner, to_renter))
    }
}

use crate::errors::RentalError;

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::prelude::borsh::BorshSerialize;

    /// The `LEN` constants are hand-written for the `space =` attributes, so
    /// they are verified here against what Borsh actually serializes. A wrong
    /// constant would silently truncate or over-allocate every account this
    /// program creates, which no runtime error would make obvious.
    #[test]
    fn len_constants_match_borsh_serialization() {
        let config = PlatformConfig {
            admin: Pubkey::default(),
            treasury: Pubkey::default(),
            fee_bps: 0,
            paused: false,
            bump: 0,
        };
        assert_eq!(config.try_to_vec().unwrap().len() + 8, PlatformConfig::LEN);

        let listing = AssetListing {
            owner: Pubkey::default(),
            asset_id: [0u8; ASSET_ID_LEN],
            category: 0,
            price_per_day: 0,
            deposit_lamports: 0,
            max_days: 0,
            metadata_hash: [0u8; METADATA_HASH_LEN],
            active: false,
            current_rental: Pubkey::default(),
            busy_until: 0,
            total_rentals: 0,
            created_at: 0,
            bump: 0,
        };
        assert_eq!(listing.try_to_vec().unwrap().len() + 8, AssetListing::LEN);

        let rental = RentalAgreement {
            listing: Pubkey::default(),
            owner: Pubkey::default(),
            renter: Pubkey::default(),
            rental_id: [0u8; RENTAL_ID_LEN],
            start_ts: 0,
            end_ts: 0,
            days: 0,
            price_total: 0,
            deposit_lamports: 0,
            escrow_lamports: 0,
            status: RentalStatus::Reserved,
            created_at: 0,
            bump: 0,
        };
        assert_eq!(rental.try_to_vec().unwrap().len() + 8, RentalAgreement::LEN);
    }

    /// `RentalStatus` is serialized as a single discriminant byte, which is what
    /// `RentalAgreement::LEN` budgets for, and the discriminants are part of the
    /// published contract (`clients/ts/constants.ts` mirrors them).
    #[test]
    fn rental_status_is_one_byte_in_declaration_order() {
        let statuses = [
            (RentalStatus::Reserved, 0u8),
            (RentalStatus::Active, 1),
            (RentalStatus::Completed, 2),
            (RentalStatus::Cancelled, 3),
            (RentalStatus::Disputed, 4),
            (RentalStatus::Resolved, 5),
        ];
        for (status, discriminant) in statuses {
            let bytes = status.try_to_vec().unwrap();
            assert_eq!(bytes.len(), 1);
            assert_eq!(bytes[0], discriminant);
        }
    }

    /// Open/terminal classification is what the settlement, cancellation, and
    /// close gates rely on; a mistake here would either strand escrow or allow a
    /// second payout.
    #[test]
    fn status_classification_covers_every_variant() {
        assert!(RentalStatus::Reserved.is_open());
        assert!(RentalStatus::Active.is_open());

        assert!(RentalStatus::Completed.is_terminal());
        assert!(RentalStatus::Cancelled.is_terminal());
        assert!(RentalStatus::Resolved.is_terminal());

        // Disputed is neither: it blocks settle/cancel and only resolve ends it.
        assert!(!RentalStatus::Disputed.is_open());
        assert!(!RentalStatus::Disputed.is_terminal());

        assert!(!RentalStatus::Completed.is_open());
        assert!(!RentalStatus::Cancelled.is_open());
        assert!(!RentalStatus::Resolved.is_open());
        assert!(!RentalStatus::Reserved.is_terminal());
        assert!(!RentalStatus::Active.is_terminal());
    }

    #[test]
    fn fee_is_taken_on_price_only_and_rounds_down() {
        let config = PlatformConfig {
            admin: Pubkey::default(),
            treasury: Pubkey::default(),
            fee_bps: MAX_FEE_BPS,
            paused: false,
            bump: 0,
        };
        // 10% of 0.1 SOL.
        assert_eq!(config.fee_on(100_000_000).unwrap(), 10_000_000);
        // Rounds down, never up, and an empty price costs nothing.
        assert_eq!(config.fee_on(9).unwrap(), 0);
        assert_eq!(config.fee_on(0).unwrap(), 0);
    }

    #[test]
    fn dispute_split_conserves_the_escrow() {
        let rental = RentalAgreement {
            listing: Pubkey::default(),
            owner: Pubkey::default(),
            renter: Pubkey::default(),
            rental_id: [0u8; RENTAL_ID_LEN],
            start_ts: 0,
            end_ts: 0,
            days: 0,
            price_total: 0,
            deposit_lamports: 0,
            escrow_lamports: 100_000_003,
            status: RentalStatus::Disputed,
            created_at: 0,
            bump: 0,
        };

        for share in [0u16, 1, 2_500, 5_000, 9_999, BPS_DENOMINATOR as u16] {
            let (to_owner, to_renter) = rental.split(share).unwrap();
            assert_eq!(
                to_owner + to_renter,
                rental.escrow_lamports,
                "every split must pay out the whole escrow exactly"
            );
        }

        assert_eq!(rental.split(0).unwrap(), (0, 100_000_003));
        assert_eq!(
            rental.split(BPS_DENOMINATOR as u16).unwrap(),
            (100_000_003, 0)
        );
    }

    #[test]
    fn release_clears_pointer_and_watermark_together() {
        let mut listing = AssetListing {
            owner: Pubkey::default(),
            asset_id: [0u8; ASSET_ID_LEN],
            category: 0,
            price_per_day: 0,
            deposit_lamports: 0,
            max_days: 0,
            metadata_hash: [0u8; METADATA_HASH_LEN],
            active: true,
            current_rental: Pubkey::new_unique(),
            busy_until: 1_700_000_000,
            total_rentals: 0,
            created_at: 0,
            bump: 0,
        };
        assert!(listing.is_rented());

        listing.release();
        assert!(!listing.is_rented());
        assert_eq!(listing.busy_until, 0);
    }
}
