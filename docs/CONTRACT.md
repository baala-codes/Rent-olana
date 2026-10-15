# On-chain contract (frozen)

**Consumers:** the browser portal, the provider backend, and the TypeScript
client helpers in [`clients/ts/`](../clients/ts/).

This is the published interface for the `asset-rental` program. It is the single
source of truth for account layouts, PDA seeds, instruction arguments, and error
codes. The backend decodes these accounts to mirror listings and rentals for
search/UX, so any change here is a breaking change for the portal and the
backend. Solana remains the source of truth for funds and rental state.

| | |
| --- | --- |
| Program ID | `9CN7pM6aw4aYiNb5h715tvE7xeLA31WXMVbUcpmYohxo` |
| Cluster | `devnet` (local validator: `localnet`, same program ID) |
| RPC | `https://api.devnet.solana.com` |
| Anchor / anchor-lang | `0.30.1` |
| Commitment used for verification | `finalized` |
| Client helpers | [`clients/ts/`](../clients/ts/) |
| Source | [`programs/asset-rental/`](../programs/asset-rental/) |
| Design | [`../new_architecture.md`](../new_architecture.md) |

The program ID must stay identical in three places: `declare_id!` in
`programs/asset-rental/src/lib.rs`, `[programs.devnet]` in `Anchor.toml`, and
`PROGRAM_ID` in `clients/ts/constants.ts`. Run `anchor keys sync` to update the
Rust and `Anchor.toml` copies, then edit `constants.ts` to match;
`scripts/export-clients.sh` fails if the three disagree.

## 1. Accounts

All three accounts are owned by the program. Every layout starts with the 8-byte
Anchor discriminator, so offsets below are absolute from the account data start.
All integers are little-endian (Borsh).

| Account | Size | Discriminator | PDA seeds |
| --- | ---: | --- | --- |
| `PlatformConfig` | 76 | `a04e8000f853e6a0` | `"config"` |
| `AssetListing` | 182 | `3f5da63d4b59edf8` | `"asset"` ‖ owner ‖ `asset_id` |
| `RentalAgreement` | 188 | `54cecc92f0da130e` | `"rental"` ‖ listing ‖ `rental_id` |

### 1.1 `PlatformConfig` — 76 bytes

Discriminator `a04e8000f853e6a0` = `sha256("account:PlatformConfig")[0..8]`.

| Offset | Size | Field | Type | Notes |
| --- | ---: | --- | --- | --- |
| 0 | 8 | discriminator | `[u8; 8]` | |
| 8 | 32 | `admin` | `Pubkey` | Operations authority; updates config and resolves disputes. |
| 40 | 32 | `treasury` | `Pubkey` | Receives the platform fee. Read for every settlement. |
| 72 | 2 | `fee_bps` | `u16` LE | `<= MAX_FEE_BPS` (1000). Charged on `price_total` only. |
| 74 | 1 | `paused` | `bool` | `0`/`1`. Blocks new rentals; never blocks settle/cancel/dispute. |
| 75 | 1 | `bump` | `u8` | PDA bump. |

### 1.2 `AssetListing` — 182 bytes

Discriminator `3f5da63d4b59edf8`.

| Offset | Size | Field | Type | Notes |
| --- | ---: | --- | --- | --- |
| 0 | 8 | discriminator | `[u8; 8]` | |
| 8 | 32 | `owner` | `Pubkey` | Registration authority, payee, settlement authority. |
| 40 | 32 | `asset_id` | `[u8; 32]` | Stable owner-chosen identity. |
| 72 | 2 | `category` | `u16` LE | Coarse discovery code; no strings, no PII. |
| 74 | 8 | `price_per_day` | `u64` LE | Always `> 0`. |
| 82 | 8 | `deposit_lamports` | `u64` LE | Refundable; may be `0`. Excluded from the fee. |
| 90 | 2 | `max_days` | `u16` LE | Always `1..=MAX_DAYS`. |
| 92 | 32 | `metadata_hash` | `[u8; 32]` | Commitment to the off-chain listing document. |
| 124 | 1 | `active` | `bool` | `false` blocks new bookings; open rentals unaffected. |
| 125 | 32 | `current_rental` | `Pubkey` | Holding rental, or `default` when free. |
| 157 | 8 | `busy_until` | `i64` LE | End of the holding booking, or `0`. The overlap watermark. |
| 165 | 8 | `total_rentals` | `u64` LE | Count of rentals that reached `Completed`. |
| 173 | 8 | `created_at` | `i64` LE | Chain time at registration. |
| 181 | 1 | `bump` | `u8` | PDA bump. |

`current_rental` and `busy_until` are cleared together on every terminal rental
transition (`Completed`, `Cancelled`, `Resolved`) and never while `Disputed`.

### 1.3 `RentalAgreement` — 188 bytes

Discriminator `54cecc92f0da130e`.

| Offset | Size | Field | Type | Notes |
| --- | ---: | --- | --- | --- |
| 0 | 8 | discriminator | `[u8; 8]` | |
| 8 | 32 | `listing` | `Pubkey` | The `AssetListing` address. |
| 40 | 32 | `owner` | `Pubkey` | Listing owner at booking time; settlement payee. |
| 72 | 32 | `renter` | `Pubkey` | Renter that booked and funded the escrow. |
| 104 | 32 | `rental_id` | `[u8; 32]` | Unique, persisted before signing. |
| 136 | 8 | `start_ts` | `i64` LE | Rental start (inclusive). |
| 144 | 8 | `end_ts` | `i64` LE | `start_ts + days * SECONDS_PER_DAY`. |
| 152 | 2 | `days` | `u16` LE | Whole days. |
| 154 | 8 | `price_total` | `u64` LE | `price_per_day * days`, frozen at booking. |
| 162 | 8 | `deposit_lamports` | `u64` LE | Deposit, frozen at booking. |
| 170 | 8 | `escrow_lamports` | `u64` LE | `price_total + deposit_lamports`; set to `0` on every terminal path. |
| 178 | 1 | `status` | `u8` enum | `RentalStatus` discriminant. |
| 179 | 8 | `created_at` | `i64` LE | Chain time at creation. |
| 187 | 1 | `bump` | `u8` | PDA bump. |

`RentalStatus` is a one-byte enum in declaration order (mirrored in
`clients/ts/constants.ts` as `RENTAL_STATUS`):

```text
Reserved = 0   booked, not yet started
Active   = 1   open rental at/after start_ts (reserved; no instruction writes it yet)
Completed= 2   settled (terminal)
Cancelled= 3   cancelled before start (terminal)
Disputed = 4   frozen; only resolve_dispute may move escrow
Resolved = 5   admin split (terminal)
```

## 2. PDA seeds and seed encodings

Seeds are fixed byte strings followed by raw 32-byte public keys or IDs. No
length prefixes, no hashing, no string encoding — concatenate the bytes exactly.

### 2.1 Seed prefix byte tables

| Name | Bytes | Length | ASCII |
| --- | --- | ---: | --- |
| `"config"` | `63 6f 6e 66 69 67` | 6 | `config` |
| `"asset"` | `61 73 73 65 74` | 5 | `asset` |
| `"rental"` | `72 65 6e 74 61 6c` | 6 | `rental` |

### 2.2 Seed layouts

| Account | Seeds | Total seed bytes |
| --- | --- | ---: |
| `PlatformConfig` | `"config"` | 6 |
| `AssetListing` | `"asset"` ‖ `owner` ‖ `asset_id` | 5 + 32 + 32 = 69 |
| `RentalAgreement` | `"rental"` ‖ `listing` ‖ `rental_id` | 6 + 32 + 32 = 70 |

`owner` and `listing` above are account addresses (`Pubkey`), not IDs.
Derivation is `findProgramAddress`, so the bump is whatever the runtime finds;
read it from the account's trailing `bump` byte rather than recomputing it.

TypeScript equivalents live in [`clients/ts/pda.ts`](../clients/ts/pda.ts):
`configPda()`, `listingPda(owner, assetId)`, `rentalPda(listing, rentalId)`.

## 3. Instructions

| Instruction | Signer | Arguments | Discriminator |
| --- | --- | --- | --- |
| `initialize_config` | `admin` | `treasury: Pubkey`, `fee_bps: u16` | `d07f1501c2bec446` |
| `set_config` | `admin` | `treasury?: Pubkey`, `fee_bps?: u16`, `paused?: bool` | `6c9e9aafd4623442` |
| `register_asset` | listing owner | `asset_id: [u8;32]`, `category: u16`, `price_per_day: u64`, `deposit: u64`, `max_days: u16`, `metadata_hash: [u8;32]` | `15509b9575cfeb10` |
| `update_asset` | listing owner | `price_per_day?: u64`, `deposit?: u64`, `max_days?: u16`, `category?: u16`, `metadata_hash?: [u8;32]` | `387eee8ac076e4ac` |
| `set_listing_status` | listing owner | `active: bool` | `6242395f0d989f9a` |
| `close_listing` | listing owner | *(none)* | `210fc0514eaf9f61` |
| `create_rental` | renter | `rental_id: [u8;32]`, `start_ts: i64`, `days: u16` | `82f0991df39550f3` |
| `settle_rental` | owner or anyone | *(none)* | `95f1eedb44886e39` |
| `cancel_rental` | owner or renter | *(none)* | `61cc3f0854221c2b` |
| `raise_dispute` | owner or renter | *(none)* | `29f30133965ff649` |
| `resolve_dispute` | `admin` | `owner_share_bps: u16` | `e706ca0660670ce6` |
| `close_rental` | anyone | *(none)* | `b3bc71d329e83333` |

Discriminators are `sha256("global:<name>")[0..8]`. Account lists per
instruction: see [`docs/EXAMPLES.md`](EXAMPLES.md).

### 3.1 `initialize_config`

Admin-signed, callable once. Creates `PlatformConfig` at `[b"config"]` with
`paused = false`. Rejects `fee_bps > MAX_FEE_BPS` (`FeeTooHigh`) and the default
treasury (`InvalidTreasury`). Emits `ConfigInitialized`.

### 3.2 `set_config`

Admin-signed (`has_one = admin`, `Unauthorized`). Applies only the `Some` values
and re-checks the fee cap and the non-default treasury. Emits `ConfigUpdated`.

### 3.3 `register_asset`

Owner-signed. Creates `AssetListing` at `[b"asset", owner, asset_id]` with
`active = true`, `current_rental = default`, `busy_until = 0`, `total_rentals =
0`. Rejects `price_per_day == 0` (`InvalidPrice`) and `max_days` outside
`[1, MAX_DAYS]` (`InvalidDuration`). Emits `ListingUpdated`.

### 3.4 `update_asset`

Owner-signed. If any of `price_per_day`, `deposit`, or `max_days` is present,
requires the listing to be free (`InvalidStatus` when `current_rental` is set).
Re-validates the new bounds. `category` and `metadata_hash` may always change.
Emits `ListingUpdated`.

### 3.5 `set_listing_status` / `close_listing`

Owner-signed. `set_listing_status` flips `active` and emits
`ListingStatusChanged`. `close_listing` requires no open rental (`InvalidStatus`,
which also covers a disputed rental, since the pointer stays set) and closes the
account, returning its rent to the owner; emits `ListingClosed`.

### 3.6 `create_rental`

Renter-signed. Requires: platform not paused (`PlatformPaused`); listing active
(`ListingNotActive`); `renter != owner` (`RenterIsOwner`); `1 <= days <=
max_days` (`InvalidDuration`); `start_ts >= now` (`StartInPast`); `start_ts >=
listing.busy_until` (`ListingBusy`). Computes `price_total = price_per_day *
days`, `end_ts = start_ts + days * 86_400`, and `escrow = price_total +
deposit` with checked arithmetic. Transfers `escrow` from the renter into the
just-initialized rental PDA, writes the agreement with `status = Reserved`, and
sets the listing's `current_rental` and `busy_until = end_ts`. Emits
`RentalCreated`.

The rental account is created with `init` at `[b"rental", listing, rental_id]`,
which is the atomic duplicate-charge guard (§5).

### 3.7 `settle_rental`

Two independent gates, both requiring `status` in `{Reserved, Active}`
(`InvalidStatus` otherwise):

1. the **owner** calls with `now >= start_ts`, or
2. **anyone** calls with `now >= end_ts + GRACE_SECONDS`.

Computes `fee = price_total * fee_bps / 10_000` (rounded down), then, signed by
the rental PDA: `price_total - fee` → `owner_wallet`, `fee` →
`platform_treasury`, `deposit` → `renter_wallet`. `owner_wallet` is bound to
`rental.owner`, `renter_wallet` to `rental.renter`, and `platform_treasury` to
`config.treasury` (`InvalidPda` / `TreasuryMismatch`). Sets `escrow_lamports =
0` and `status = Completed`, clears the listing pointer, and increments
`total_rentals`. Emits `RentalSettled`.

### 3.8 `cancel_rental`

Owner- or renter-signed (`NotRentalParty`), only while `status == Reserved`
(`InvalidStatus`) and `now < start_ts` (`CancelTooLate`). Refunds the full
`escrow_lamports` to `renter_wallet`, sets `status = Cancelled` and
`escrow_lamports = 0`, and clears the listing pointer (without incrementing
`total_rentals`). Emits `RentalCancelled`.

### 3.9 `raise_dispute`

Owner- or renter-signed, only while the rental is open. Sets `status = Disputed`,
which blocks `settle_rental` and `cancel_rental`. The listing pointer is **not**
cleared, so no new rental can start while frozen. Emits `RentalDisputed`.

### 3.10 `resolve_dispute`

Admin-signed (`has_one = admin`, `Unauthorized`), only while `status ==
Disputed`. Requires `owner_share_bps <= 10_000` (`InvalidShare`). Splits the
entire remaining `escrow_lamports`: `to_owner = escrow * owner_share_bps /
10_000`, `to_renter = escrow - to_owner`. Sets `status = Resolved` and
`escrow_lamports = 0`, clears the listing pointer. Emits `RentalResolved`.

### 3.11 `close_rental`

Permissionless. Requires a terminal status (`Completed`, `Cancelled`,
`Resolved`; else `InvalidStatus`) and closes the rental account, returning its
rent-exempt lamports to `renter_wallet` (bound to `rental.renter`). Emits
`RentalClosed`.

## 4. Escrow conservation

Every terminal path pays out exactly `escrow_lamports` and then zeroes it:

- **settle:** `(price_total - fee) + fee + deposit == price_total + deposit == escrow`
- **cancel:** `escrow → renter`
- **resolve:** `owner_amount + renter_amount == escrow`

Escrow never moves while `Disputed`. `Σ(payouts) == escrow` per rental is the
tested invariant (see [`../tests/README.md`](../tests/README.md)).

## 5. Duplicate rental IDs

`RentalAgreement` is created with `init`, **not** `init_if_needed`, at an address
derived from `rental_id`. A reused `rental_id` makes `init` fail (the account
already exists) and the whole transaction rolls back — the escrow transfer never
happens. This is the atomic duplicate-charge/replay guard; there is no pre-check
that a concurrent transaction could race past.

Consequence for callers: a reused ID fails at the runtime level with an
instruction error about the account already being in use, **not** with
`RentalError::RentalIdReused`. The `RentalIdReused` code is reserved and must be
treated as an alias for the same condition by clients that inspect errors.
Persist the `rental_id` before submitting; on an uncertain confirmation, re-read
the rental PDA with the same ID.

## 6. Error codes

`RentalError` starts at 6000. Declaration order is part of the contract —
append only, never reorder.

| Code | Name | Message |
| ---: | --- | --- |
| 6000 | `InvalidPrice` | Price per day must be greater than zero lamports. |
| 6001 | `InvalidDeposit` | The deposit amount is not acceptable. |
| 6002 | `InvalidDuration` | Rental duration must be between 1 day and the listing's max days. |
| 6003 | `InvalidCategory` | The category code is not acceptable. |
| 6004 | `ListingNotActive` | This listing is deactivated and cannot be booked. |
| 6005 | `PlatformPaused` | The platform is paused; new rentals are rejected. |
| 6006 | `RenterIsOwner` | The listing owner cannot rent their own listing. |
| 6007 | `StartInPast` | A rental must start at or after the current chain time. |
| 6008 | `ListingBusy` | This listing is already booked at or after the requested start. |
| 6009 | `RentalIdReused` | This rental ID has already been used for this listing. |
| 6010 | `NotListingOwner` | The signer is not the owner of this listing. |
| 6011 | `NotRentalParty` | Only the rental's owner or renter may do this. |
| 6012 | `InvalidStatus` | This account is not in a state that allows this operation. |
| 6013 | `CancelTooLate` | A rental can only be cancelled before its start time. |
| 6014 | `FeeTooHigh` | Fee must be at most MAX_FEE_BPS (1000 = 10%). |
| 6015 | `TimeOverflow` | Arithmetic overflow while computing a rental timestamp. |
| 6016 | `InvalidPda` | The supplied account does not match its expected PDA. |
| 6017 | `TreasuryMismatch` | The treasury account does not match the platform config. |
| 6018 | `DepositOverflow` | Arithmetic overflow while computing an escrow amount or split. |
| 6019 | `DisputeInProgress` | This rental is frozen by an open dispute; settle and cancel are blocked. |
| 6020 | `Unauthorized` | The signer is not authorized for this operation. |
| 6021 | `InvalidTreasury` | The treasury address is not acceptable. |
| 6022 | `InvalidShare` | The owner share must be at most 10_000 basis points. |

Codes are mirrored in [`clients/ts/constants.ts`](../clients/ts/constants.ts)
(`RENTAL_ERRORS`, `RENTAL_ERROR_CODE`).

## 7. Program-enforced constants

```text
GRACE_SECONDS     = 86_400   (24h after end_ts before permissionless settle)
MAX_FEE_BPS       = 1_000    (10%)
MAX_DAYS          = 36_500
SECONDS_PER_DAY   = 86_400
ASSET_ID_LEN / RENTAL_ID_LEN / METADATA_HASH_LEN = 32
BPS_DENOMINATOR   = 10_000
```

## 8. Read-side rules for the backend

1. Read listings and rentals with `finalized` commitment; verify program
   ownership, discriminator, and PDA derivation before trusting any field.
2. Derive availability from `busy_until` / `current_rental`. A listing with a
   set pointer is not bookable.
3. Expiry is never written on-chain; a rental's state only changes on explicit
   transitions. Treat unusable or stale RPC state as unknown, never as
   confirmation.
4. The mirror is disposable: reconcile against finalized reads after restarts or
   uncertain confirmations. Never decide fund movement off-chain.

## 9. Deliberate deviations from other documents

| Where | Other document says | This contract does |
| --- | --- | --- |
| Seed byte totals | `new_architecture.md` §5 gives `AssetListing` = 70 and `RentalAgreement` = 71 seed bytes | The prefixes are 5 (`asset`) and 6 (`rental`) bytes, so the totals are 69 and 70; the byte tables above are authoritative. |
| `resolve_dispute` argument check | task list used `FeeTooHigh` for `owner_share_bps` | A dedicated `InvalidShare` (6022) is used so the fee message stays accurate. |
| Admin mismatch error | task list names `Unauthorized` | `Unauthorized` (6020) is used for both `set_config` and `resolve_dispute`. |
| `settle_rental` payees | task list leaves `owner_wallet`/`renter_wallet` unconstrained | They are bound to `rental.owner` / `rental.renter` so a caller cannot redirect a payout. |
