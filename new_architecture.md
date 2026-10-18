# Solana Physical-Asset Rental Marketplace Architecture

**Status:** Proposed proof of concept (POC)
**Environment:** Browser portal, provider backend (search/media/orders), Solana devnet or testnet
**Billing:** Escrowed native SOL payments on Solana only
**Discovery:** Off-chain geo/category index; on-chain financial truth
**Settlement:** Program-held escrow with owner attestation, permissionless auto-settle after grace, and admin dispute resolution
**Listing model:** PDA-backed `AssetListing` per asset (no NFT in the POC)

> **Owner registers terms on-chain → renter escrows price + deposit → rental is active for [start, end] → settlement releases price to owner and deposit to renter → disputes freeze funds for an admin split.**

The on-chain program is the source of truth for listings, rental agreements, escrowed funds, and rental status. The backend mirrors state for search and UX and never decides fund movement.

<!-- TOC -->
- [1. Purpose and Scope](#1-purpose-and-scope)
- [2. System Requirements](#2-system-requirements)
  - [2.1. Functional Requirements](#21-functional-requirements)
  - [2.2. Security and Reliability Requirements](#22-security-and-reliability-requirements)
  - [2.3. Runtime and Development Requirements](#23-runtime-and-development-requirements)
- [3. Components and Responsibilities](#3-components-and-responsibilities)
- [4. Platform Configuration](#4-platform-configuration)
- [5. On-Chain Data and Instructions](#5-on-chain-data-and-instructions)
  - [5.1. On-Chain Entity Diagram](#51-on-chain-entity-diagram)
- [6. Rental Lifecycle](#6-rental-lifecycle)
- [7. Portal Flows](#7-portal-flows)
- [8. Authorization Summary](#8-authorization-summary)
- [9. Enforcement, Recovery, and Edge Cases](#9-enforcement-recovery-and-edge-cases)
- [10. Local State and Audit Records](#10-local-state-and-audit-records)
- [11. Testing](#11-testing)
  - [11.1. Test Environment](#111-test-environment)
  - [11.2. Test Execution](#112-test-execution)
- [12. Acceptance Scenarios](#12-acceptance-scenarios)
- [13. Work Breakdown](#13-work-breakdown)
- [14. Future Improvements](#14-future-improvements)
<!-- /TOC -->

## 1. Purpose and Scope

Demonstrate that an asset owner can register a physical item for rent (fan, fridge,
power tool), a renter can discover it through the portal, book a bounded rental
period, escrow SOL on-chain, and settle on return — with overlapping-booking
prevention, deposits, cancellation, and dispute resolution enforced by the program
rather than by trusted intermediaries.

The architecture includes:

- asset listings owned by provider wallets (price per day, deposit, category,
  maximum rental duration, off-chain metadata hash);
- single-occupancy rentals with on-chain overlapping-booking prevention;
- escrowed SOL (price total + deposit) held by a program-owned PDA;
- settlement by owner attestation, or permissionless auto-settle after the rental
  end plus a grace period;
- pre-start cancellation with a full refund, by either party;
- dispute freeze with admin resolution and an explicit basis-point escrow split;
- platform pause switch and admin-controlled treasury and fee;
- Anchor events for indexing; a backend that mirrors state for search and UX only.

All payments use native SOL on the configured test cluster (devnet/testnet). Prices
and deposits use integer lamports. The payer also pays transaction fees and account
rent. Precise geo-location, images, descriptions, identity documents, and contact
details are never stored on-chain.

Out of scope for the POC (see §14): NFT provenance, hourly granularity, future
scheduled bookings per listing, SPL-token payments, multisig administration.

## 2. System Requirements

### 2.1. Functional Requirements

- **Wallet access:** Support wallet connection and transaction signing through
  Phantom or Solflare from the browser portal.
- **Listings:** Owners register assets with a stable random 32-byte `asset_id`,
  category, price per day, deposit, maximum duration, and an off-chain metadata
  hash. Owners update terms (blocked for price/deposit/duration while a rental is
  open), activate/deactivate listings, and close listings that have no open rental.
- **Booking:** Renters select a listing and a start date and duration. The program
  validates duration bounds, rejects starts in the past, and rejects any booking
  that overlaps the listing's current occupancy window.
- **Payment:** Renters escrow `price_total + deposit` into the rental PDA in the
  same transaction that creates the rental agreement. `price_total =
  price_per_day * days` and `end_ts = start_ts + days * 86_400` are computed
  on-chain with checked arithmetic.
- **Settlement:** The owner settles after handover (`now >= start_ts`); anyone can
  settle after `end_ts + GRACE_SECONDS` (non-return path). Settlement pays
  `price_total - fee` to the owner, `fee` to the platform treasury, and the deposit
  back to the renter.
- **Cancellation:** Either party cancels before `start_ts` for a full escrow
  refund. Post-start cancellation is denied; the rental runs to settlement or
  dispute.
- **Disputes:** Either party freezes a rental while `Reserved` or `Active`;
  settlement and cancellation are blocked until the admin resolves with an explicit
  `owner_share_bps` split of the remaining escrow.
- **Portal feedback:** Listing management, geo/category search results, booking
  calendar with availability, rental status, and settle/cancel/dispute actions.
- **Persistence and reconciliation:** The backend mirrors rentals and listings for
  UX; it reconciles against finalized chain reads after restarts. Solana remains
  the source of truth for funds and rental state.
- **Recovery:** Escrow can never strand: every open rental has a terminal path
  (owner settle, permissionless timeout settle, cancel before start, admin dispute
  resolution).

### 2.2. Security and Reliability Requirements

- Never request or store wallet private keys or seed phrases. The program makes all
  fund-movement decisions; the backend only reads state.
- Fail closed on invalid accounts, wrong signers, substituted PDAs, paused
  platform, bad status, and arithmetic overflow. Use checked arithmetic for every
  time and lamport computation; keep `overflow-checks = true`.
- Every PDA is re-derived from stored state with its stored bump; never trust
  client-supplied addresses or bumps. The platform treasury is read from
  `PlatformConfig` only.
- Only `settle_rental`, `cancel_rental`, and `resolve_dispute` move escrowed funds,
  each gated by time, status, and/or admin. There is no admin fund-sweep
  instruction.
- Duplicate `rental_id` is impossible: the agreement account is created with `init`
  on `[b"rental", listing, rental_id]`, so a reused ID fails account creation and
  rolls back the entire transaction (including the escrow transfer). Persist the
  `rental_id` before submitting; reuse the same ID when resubmitting after an
  uncertain confirmation.
- Single occupancy per listing: `create_rental` requires `start_ts >=
  max(now, listing.busy_until)`; `busy_until` and `current_rental` are cleared on
  every terminal transition so completed rentals never block future bookings.
- `paused` blocks only new rentals. Refunds, settlement, and dispute resolution
  must remain possible while paused.
- Keep rent-exempt minimums intact: escrows are initialized rent-exempt; settlement
  drains only the escrow and leaves the account alive as the durable receipt; a
  separate `close_rental` instruction returns the rent-exempt lamports to the
  renter after termination.
- Synchronize clocks. On-chain time is `Clock::unix_timestamp`; the backend uses
  finalized reads and treats unavailable or stale RPC state as "unknown", never as
  confirmation.
- No PII, coordinates, phone numbers, ID documents, or challenge material in on-chain
  data or audit logs.

### 2.3. Runtime and Development Requirements

| Component | Required environment |
|-----------|----------------------|
| Program | Anchor 0.30.1 workspace, Solana CLI 1.18.x, Rust toolchain via `scripts/install-toolchain.sh`. |
| Cluster | devnet for the POC; local validator for isolated program tests. |
| Wallets | admin, treasury, two owner test keypairs, one renter test keypair in gitignored `.keys/`; funded on devnet. |
| Backend | Node/TypeScript service: geo/category search index, asset media storage, off-chain metadata, rental/order mirror, reconciliation, notification hooks. SQLite or Postgres for the mirror. |
| Portal | Browser with Phantom or Solflare; static or lightly served frontend. |
| Client helpers | `clients/ts/` hand-written PDA/instruction helpers plus generated IDL/types. |
| Networking | Browser to backend and Solana RPC; backend to RPC; nothing else required for the POC. |

## 3. Components and Responsibilities

### 3.1. Overview

```text
Browser portal + wallet  ------>  Solana RPC  <------  Provider backend
       |                             |
       | signs txs                   | reads finalized state, mirrors
       v                             v
   Solana program  <--------  search index / media / orders (off-chain truth for UX)
```

### 3.2. Responsibilities

| Component | Responsibility |
|-----------|----------------|
| Browser portal and wallet | Listing CRUD, search UI (backed by the backend index), booking flow with date/duration selection, rental status display, settle/cancel/dispute actions, transaction signing. |
| Solana program | Listing terms and authorization, booking validation, overlap prevention, escrow custody, settlement splits, cancellation refunds, dispute freeze/resolution, platform pause, events. |
| Provider backend | Geo/category search index, asset images and large metadata, off-chain availability display, rental/order mirror for UX, reconciliation after restarts, notifications. Never decides fund movement. |
| Admin operations | `initialize_config`, `set_config` (treasury, fee, pause), `resolve_dispute`. Admin cannot sweep escrow. |

## 4. Platform Configuration

One singleton `PlatformConfig` account, PDA seeds `[b"config"]`, initialized once by
the admin and mutated only by the admin:

```text
admin: Pubkey         operations authority (single key in the POC)
treasury: Pubkey      receives the platform fee on every settlement
fee_bps: u16          platform fee in basis points, charged on price_total
                      at settlement only; capped at MAX_FEE_BPS
paused: bool          blocks new rentals; never blocks refunds/settlement
bump: u8
```

Program-enforced constants:

```text
GRACE_SECONDS     = 86_400   (24h after end_ts before permissionless settle)
MAX_FEE_BPS       = 1_000    (10%)
MAX_DAYS          = 36_500   (hard cap on max_days)
SECONDS_PER_DAY   = 86_400
ASSET_ID_LEN      = 32
RENTAL_ID_LEN     = 32
METADATA_HASH_LEN = 32
```

Wallet input cannot choose a different treasury, fee, or admin; those live in the
config account and are read by the program.

## 5. On-Chain Data and Instructions

One program owns the following accounts. All layouts start with the 8-byte Anchor
discriminator and end with the PDA bump. All seed encodings are fixed.

| Account | Main fields | PDA seeds |
|---------|-------------|-----------|
| `PlatformConfig` | admin, treasury, fee_bps, paused | `config` |
| `AssetListing` | owner, asset_id, category, price_per_day, deposit_lamports, max_days, metadata_hash, active, current_rental, busy_until, total_rentals, created_at | `asset`, owner wallet, asset_id |
| `RentalAgreement` | listing, owner, renter, rental_id, start_ts, end_ts, days, price_total, deposit_lamports, escrow_lamports, status, created_at | `rental`, listing address, rental_id |

Seed layouts (concatenate raw bytes; no length prefixes, no hashing):

```text
PlatformConfig   [b"config"]
AssetListing     [b"asset"]  + owner(32) + asset_id(32)      = 70 bytes
RentalAgreement  [b"rental"] + listing(32) + rental_id(32)   = 71 bytes
```

`RentalStatus` is a 1-byte enum: `Reserved(0)`, `Active(1)`, `Completed(2)`,
`Cancelled(3)`, `Disputed(4)`, `Resolved(5)`. A rental is `Reserved` before
`start_ts` and `Active` at/after `start_ts`.

```text
Admin-signed:
  initialize_config(treasury, fee_bps)
  set_config(treasury?, fee_bps?, paused?)
  resolve_dispute(rental, owner_share_bps)

Listing-owner-signed:
  register_asset(asset_id, category, price_per_day, deposit_lamports, max_days, metadata_hash)
  update_asset(price_per_day, deposit_lamports, max_days, metadata_hash, category)
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

`register_asset` creates the listing with `active = true`,
`current_rental = Pubkey::default()`, `busy_until = 0`, `total_rentals = 0`. It
requires `price_per_day > 0` and `1 <= max_days <= MAX_DAYS`; deposit may be zero.

`update_asset` is owner-only. `price_per_day`, `deposit_lamports`, and `max_days`
cannot change while `current_rental != Pubkey::default()`; `metadata_hash` and
`category` may always change.

`create_rental` requires the listing active, the platform not paused,
`renter != owner`, `days` within `[1, max_days]`, `start_ts >= now`, and
`start_ts >= listing.busy_until`. It computes `price_total` and `end_ts` with
checked arithmetic, transfers `price_total + deposit_lamports` from the renter into
the (just-initialized) rental PDA, sets `status = Reserved`, and updates the
listing to `busy_until = end_ts`, `current_rental = agreement`.

`settle_rental` has two independent gates, both requiring `status` in
`{Reserved, Active}`:

1. the listing owner calls it with `now >= start_ts` (handover attestation), or
2. anyone calls it with `now >= end_ts + GRACE_SECONDS` (non-return auto-settle).

It computes `fee = price_total * fee_bps / 10_000` and releases from the rental PDA
(signed by its PDA seeds): `price_total - fee` to the owner, `fee` to the platform
treasury, and the deposit to the renter. It sets `escrow_lamports = 0`,
`status = Completed`, clears the listing pointer, and increments `total_rentals`.

`cancel_rental` is owner- or renter-signed, only while `Reserved` and
`now < start_ts`; it refunds the full escrow to the renter and clears the pointer.

`raise_dispute` is owner- or renter-signed, only while `Reserved` or `Active`; it
sets `status = Disputed` and thereby freezes `settle_rental` and `cancel_rental`.

`resolve_dispute` is admin-only and splits the entire remaining escrow by
`owner_share_bps` (0 = full refund to renter, 10_000 = full award to owner), sets
`status = Resolved`, and clears the pointer.

`close_listing` (owner, no open rental) and `close_rental` (terminal status, rent
to the renter as funder) reclaim rent-exempt lamports.

### 5.1. On-Chain Entity Diagram

```text
PlatformConfig (1) ----< AssetListing (N, owner) ----< RentalAgreement (N, listing)
                                      ^ current_rental: 0..1 back-pointer
```

## 6. Rental Lifecycle

```text
Listing.active ──create_rental──> Reserved ──start_ts──> Active
                                  |                         |
                    (now<start)   |                         |
                    cancel_rental |              raise_dispute (owner/renter)
                                  |                         |
                              Cancelled                 Disputed
                                                          |
                                        resolve_dispute(admin, owner_share_bps)
                                                          |
                                                        Resolved
                                  |
        settle_rental (owner & now>=start, or anyone & now>=end+GRACE)
                                  |
                              Completed
```

Rules:

- The pointer (`busy_until`, `current_rental`) is cleared on `Completed`,
  `Cancelled`, and `Resolved` — never on `Disputed` (funds and occupancy stay
  frozen).
- While `Disputed`, no escrow moves and no new rental on that listing can start
  (the pointer is still set).
- Each transition is one atomic transaction; the lifecycle as a whole is not
  atomic — it spans real-world handover across multiple transactions over time.
- Invariant (tested per scenario): on every terminal path, the sum of outgoing
  transfers equals the escrowed amount exactly, and escrow never moves while
  `Disputed`.

## 7. Portal Flows

1. **Register:** Owner connects wallet, uploads images/metadata off-chain, stores
   the content hash, and calls `register_asset`. The backend indexes the listing by
   location and category (off-chain).
2. **Discover:** Renter searches the backend index; results show availability
   windows from the mirrored `busy_until`/`current_rental`.
3. **Book:** Renter picks start date and days; the portal generates a fresh
   `rental_id`, persists it, builds `create_rental`, and the wallet signs. A
   confirmation timeout is reconciled by re-reading the rental PDA with the same
   `rental_id` — never by generating a new ID.
4. **Use the item:** Renter and owner coordinate handover off-chain.
5. **Settle:** Owner calls `settle_rental` after handover; or anyone after
   `end + 24h`. Pre-start changes: either party calls `cancel_rental`. Conflicts:
   either party calls `raise_dispute`, then the admin resolves.
6. **History:** Backend mirrors terminal states from events + finalized reads.

## 8. Authorization Summary

Allow `create_rental` only when: platform not paused; listing active;
`renter != owner`; `start_ts >= max(now, busy_until)`; `days` within bounds; and the
rental PDA does not exist. Allow `settle_rental` only when: status is `Reserved` or
`Active`; and (caller is the owner with `now >= start_ts`) or (`now >= end_ts +
GRACE_SECONDS` for anyone). Allow `cancel_rental` only when: status `Reserved`,
`now < start_ts`, caller is owner or renter. Allow `raise_dispute` only when: status
`Reserved` or `Active`, caller is owner or renter. Allow `resolve_dispute` only by
admin, only while `Disputed`. Listing mutations only by the listing owner; config
mutations only by the admin. Escrow moves only through settle, cancel, and
resolve-dispute.

## 9. Enforcement, Recovery, and Edge Cases

- **Non-return:** permissionless settle after `end_ts + GRACE_SECONDS`. No keeper
  infrastructure is required — any wallet (or the backend reconciler) is the keeper.
- **Owner never settles early:** the owner path exists only at/after `start_ts`; a
  renter cannot be charged before the rental begins because the escrow transfer is
  bound to agreement creation with `start_ts >= now`.
- **Stuck funds:** impossible by construction — every open rental has a terminal
  path (settle ×2 gates, pre-start cancel, admin resolve). The invariant test
  verifies conservation across randomized sequences.
- **Overlapping bookings:** rejected at creation via `busy_until`; there is no
  interval storage, so a listing supports exactly one rental at a time.
- **Dispute abuse:** either party can freeze, but only the admin can move funds
  while frozen, and resolution is a public, explicit split.
- **Pause:** the admin can freeze new bookings during incidents; in-flight rentals
  remain fully operable (settle/cancel/dispute).
- **Replay:** reused `rental_id` fails `init` and rolls back the whole transaction;
  substituted PDAs fail seed re-derivation; wrong signers fail ownership
  constraints.
- **Rent:** terminal rentals keep their rent-exempt minimum until `close_rental`
  reclaims it to the renter; listings reclaim to the owner via `close_listing`.

## 10. Local State and Audit Records

The backend mirrors listings and rentals for UX (search, calendars, status pages)
in SQLite or Postgres and reconciles against finalized RPC reads after restarts or
uncertain confirmations. Solana remains the source of truth for funds and rental
state; the mirror is a disposable view.

Write listing, booking, settlement, cancellation, dispute, and config transitions
to a local JSONL audit log with rental/listing ID, wallet where applicable,
timestamp, and reason. Do not log secret material, keys, or PII. Off-chain asset
metadata (images, descriptions, location) lives in object storage; only its hash is
anchored on-chain.

## 11. Testing

### 11.1. Test Environment

| Component | Test setup |
|-----------|------------|
| Program | `anchor test --provider.cluster localnet` for isolated runs; devnet for the funded suite. |
| Wallets | admin, treasury, owner_a, owner_b, renter; funded by the deploy wallet (no faucet dependence). |
| Backend | Local instance against devnet; search index seeded from fixtures. |
| Portal | Manual + scripted wallet flows against devnet. |

### 11.2. Test Execution

1. **Program unit tests:** `LEN` constants vs Borsh, enum sizes, PDA helper
   determinism.
2. **Happy path:** register → create (escrow exact) → settle (three-way split exact)
   → listing reusable.
3. **Rejection matrix:** each adversarial case asserts state and balances unchanged
   (see §12 and the task list Point 6).
4. **Invariant fuzz:** randomized sequences asserting escrow conservation and
   single occupancy.
5. **Devnet run:** full suite green on devnet; fixtures and signatures recorded.

Record cluster, program ID, transaction signatures, rental/listing IDs, and expected
vs actual outcomes per run.

## 12. Acceptance Scenarios

- **Register:** a listing is created with exact terms; non-owner updates are
  rejected; terms are immutable while a rental is open.
- **Booking:** the escrow PDA holds exactly `price_total + deposit`;
  `busy_until == end_ts`; pointer set.
- **Overlap:** a second booking inside the window is rejected and leaves all state
  unchanged.
- **Replay:** a reused `rental_id` fails with no double charge.
- **Settlement:** exact split — owner receives `price_total - fee`, treasury
  receives `fee`, renter receives the deposit, to the lamport; owner path and
  permissionless timeout path both work.
- **Cancellation:** pre-start full refund; post-start cancel denied.
- **Dispute:** freeze blocks settle and cancel; non-admin resolution denied; the
  admin split is exact; pointer cleared.
- **Pause:** new rentals blocked while paused; settlement and refunds still succeed.
- **Recovery:** a rental past `end + grace` auto-settles permissionlessly; no path
  strands escrow.
- **Invariant:** across every scenario, `Σ(out) == escrow_in` per rental, and two
  open rentals never share a listing.

## 13. Work Breakdown

Solo build; three streams.

| Stream | Deliverables |
|--------|--------------|
| 1. On-chain program | `PlatformConfig`, `AssetListing`, `RentalAgreement`; 12 instructions; events; client helpers; deployment; program tests; fixtures. |
| 2. Portal + backend | Wallet portal, listing CRUD, geo/category search index, media storage, rental/order mirror, reconciliation, Docker packaging. |
| 3. Infra/docs | Toolchain, key setup, deploy runbook, architecture/contract docs, acceptance runner. |

Integration order:

1. **Freeze the contract:** account layouts, seeds, instruction set, error codes,
   events, state machine (this document + `docs/CONTRACT.md`).
2. **Build the program:** points 1–3 of the task list; localnet green.
3. **Publish + deploy:** clients, IDL, devnet deploy, config initialization, real
   register/book/settle fixture.
4. **Build portal/backend:** against the frozen contract and fixtures.
5. **Acceptance:** every §12 scenario reproducible from a clean setup.

The POC is complete when a fresh owner can register an item, a fresh renter can
book, pay, and get the deposit back on settlement, and every §12 scenario passes.

## 14. Future Improvements

- NFT provenance per asset; listing ownership transfer.
- Future/scheduled bookings per listing (interval storage, multi-occupancy).
- Hourly granularity and dynamic pricing.
- Wallet-signed delivery/return proofs (challenge–response attestations signed by
  the owner and renter wallets).
- SPL-token billing including USDC.
- Programmatic deposit forfeiture rules and bonded arbitrator panels.
- Multisig admin; insurance and dispute-evidence integrations.
- RPC redundancy, monitoring, and a mainnet rollout with independent review.
