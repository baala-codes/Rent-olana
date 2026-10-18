# asset-rental program

The Anchor program behind the physical-asset rental marketplace. An owner
registers a rentable asset and its terms, a renter books a bounded period and
escrows `price_per_day * days + deposit` in native SOL, and the program holds
that escrow until the rental settles, is cancelled before it starts, or is
resolved after a dispute. **Solana is the source of truth for funds and rental
state; the backend only mirrors what it can verify here.**

- **Crate:** `asset-rental` · **library:** `asset_rental` · **Anchor / anchor-lang:** 0.30.1
- **Cluster:** devnet (local validator for isolated tests)
- **`overflow-checks = true`** is set on the release profile
- **IDL:** `target/idl/asset_rental.json` · **types:** `target/types/asset_rental.ts`
- **Design:** [`../../new_architecture.md`](../../new_architecture.md) · **build plan:** [`../../new_tasklist.md`](../../new_tasklist.md)

## Layout

```text
programs/asset-rental/
  Cargo.toml
  build.rs
  src/
    lib.rs            #[program] entrypoints + declare_id!
    constants.rs      GRACE_SECONDS, MAX_FEE_BPS, MAX_DAYS, seed lengths, BPS_DENOMINATOR
    state.rs          PlatformConfig, AssetListing, RentalAgreement, RentalStatus
    errors.rs         RentalError (codes from 6000)
    events.rs         indexer events
    instructions/     one module per instruction group + mod.rs
```

Each instruction module owns its `#[derive(Accounts)]` structs and a uniquely
named `<instruction>_handler`. `instructions/mod.rs` re-exports the modules with
globs because `#[derive(Accounts)]` generates `__client_accounts_*` modules that
`#[program]` resolves at the crate root; see the comments in `mod.rs` and
`lib.rs`.

## Accounts

Every layout starts with the 8-byte Anchor discriminator and ends with the PDA
bump. Seeds are raw bytes with no length prefixes and no hashing.

| Account | Space | Main fields | PDA seeds |
| --- | --- | --- | --- |
| `PlatformConfig` | 76 | `admin`, `treasury`, `fee_bps`, `paused` | `[b"config"]` |
| `AssetListing` | 182 | `owner`, `asset_id`, `category`, `price_per_day`, `deposit_lamports`, `max_days`, `metadata_hash`, `active`, `current_rental`, `busy_until`, `total_rentals`, `created_at` | `[b"asset", owner, asset_id]` |
| `RentalAgreement` | 188 | `listing`, `owner`, `renter`, `rental_id`, `start_ts`, `end_ts`, `days`, `price_total`, `deposit_lamports`, `escrow_lamports`, `status`, `created_at` | `[b"rental", listing, rental_id]` |

```text
PlatformConfig   [b"config"]
AssetListing     [b"asset"]  + owner(32) + asset_id(32)      = 70 bytes
RentalAgreement  [b"rental"] + listing(32) + rental_id(32)   = 71 bytes
```

`RentalStatus` is a one-byte enum in declaration order:
`Reserved(0)`, `Active(1)`, `Completed(2)`, `Cancelled(3)`, `Disputed(4)`,
`Resolved(5)`. No instruction writes `Active`: an open rental stays `Reserved`
until it is terminal, and every gate accepts either open variant via
`is_open()`. The variant remains for forward compatibility; the `LEN` constants
are verified against Borsh in `state.rs` unit tests.

## Instructions

```text
Admin-signed:
  initialize_config(treasury, fee_bps)
  set_config(treasury?, fee_bps?, paused?)
  resolve_dispute(rental, owner_share_bps)

Listing-owner-signed:
  register_asset(asset_id, category, price_per_day, deposit, max_days, metadata_hash)
  update_asset(price_per_day?, deposit?, max_days?, category?, metadata_hash?)
  set_listing_status(active)
  close_listing()
  settle_rental(rental)                (gate: now >= start_ts)

Renter-signed:
  create_rental(rental_id, start_ts, days)

Owner OR renter:
  cancel_rental(rental)                (gate: status Reserved && now < start_ts)
  raise_dispute(rental)                (gate: status Reserved || Active)

Anyone (permissionless):
  settle_rental(rental)                (gate: now >= end_ts + GRACE_SECONDS)
  close_rental(rental)                 (gate: terminal status; rent to renter)
```

- `register_asset` creates a listing with `active = true`, `current_rental =
  Pubkey::default()`, `busy_until = 0`, `total_rentals = 0`; requires
  `price_per_day > 0` and `1 <= max_days <= MAX_DAYS` (deposit may be zero).
- `update_asset` freezes `price_per_day`, `deposit_lamports`, and `max_days`
  while `current_rental != Pubkey::default()`; `metadata_hash` and `category`
  may always change.
- `create_rental` requires an active listing, a non-paused platform, `renter !=
  owner`, `days` within `[1, max_days]`, `start_ts >= now`, and `start_ts >=
  listing.busy_until`; it computes `price_total`/`end_ts` with checked
  arithmetic and transfers `price_total + deposit` into the just-initialized
  rental PDA.
- `settle_rental` has two independent gates: the owner with `now >= start_ts`,
  or anyone with `now >= end_ts + GRACE_SECONDS`. It releases `price_total -
  fee` to the owner, `fee` to the platform treasury, and the deposit to the
  renter, sets `escrow_lamports = 0` and `status = Completed`, clears the
  listing pointer, and increments `total_rentals`.
- `cancel_rental` refunds the full escrow to the renter while `Reserved` and
  `now < start_ts`.
- `raise_dispute` freezes the rental (`status = Disputed`) so `settle_rental`
  and `cancel_rental` are blocked.
- `resolve_dispute` is admin-only and splits the entire remaining escrow by
  `owner_share_bps` (`0` = full refund to the renter, `10_000` = full award to
  the owner).
- `close_listing` (owner, no open rental) and `close_rental` (terminal status)
  reclaim rent-exempt lamports.

## Invariants

1. **Escrow moves only through three instructions.** `settle_rental`,
   `cancel_rental`, and `resolve_dispute` are the only paths that pay lamports
   out of a `RentalAgreement`, each gated by time, status, and/or party. There is
   no admin fund sweep.
2. **Treasury and fee come from `PlatformConfig`.** No instruction accepts either
   from the client, so no caller can redirect a fee.
3. **A rental ID can never be booked twice.** The agreement is created with
   `init` at `[b"rental", listing, rental_id]`, so a reused ID fails account
   creation and rolls the whole transaction back; there is no pre-check to race.
4. **Single occupancy.** A booking must start at or after the listing's
   `busy_until` watermark, which is set to `end_ts` on every booking.
5. **Escrow conservation.** Every terminal path pays out exactly
   `escrow_lamports` and then zeroes it; escrow never moves while `Disputed`.
6. **Booking, escrow, and state move together.** The transfer and every state
   write happen in one instruction; any failure leaves all of it unchanged.

## Errors and events

`RentalError` codes start at `6000` in declaration order (append only). Events
(`events.rs`) are the indexing contract: `RentalCreated`, `RentalSettled`,
`RentalCancelled`, `RentalDisputed`, `RentalResolved`, plus the config and
listing events. Events carry account addresses and amounts only — never
coordinates, PII, or documents. See [`../../docs/CONTRACT.md`](../../docs/CONTRACT.md)
for the byte-level contract.

## Build and test

```bash
bash scripts/anchor.sh build
cargo test -p asset-rental
bash scripts/anchor.sh test --provider.cluster localnet
bash scripts/anchor.sh test --provider.cluster devnet
```

The settlement-gate rule is a pure function (`settle_allowed`) with unit tests
covering both gates and the grace-period boundary, so the timeout path is
verified without waiting 24 hours or warping a validator clock.

