# Asset Rental — Solana physical-asset rental marketplace (POC)

An on-chain marketplace where an asset **owner** registers a physical item (fan,
fridge, power tool), a **renter** discovers it and books a bounded period, escrows
native SOL (price + deposit), and the rental settles on return. Overlapping
bookings, deposits, cancellation, and dispute resolution are enforced by the
program rather than by trusted intermediaries.

> **Owner registers terms on-chain → renter escrows price + deposit → rental is
> active for `[start, end]` → settlement releases price to owner and deposit to
> renter → disputes freeze funds for an admin split.**

The Solana program is the source of truth for listings, rental agreements,
escrowed funds, and rental status. The backend mirrors that state for search and
UX and **never decides fund movement**.

- **Program:** `programs/asset-rental/` — Anchor 0.30.1, native SOL escrow on devnet.
- **Billing:** escrowed native SOL only; integer lamports; no SPL tokens in the POC.
- **Discovery:** off-chain geo/category index; on-chain financial truth.
- **Listing model:** one PDA-backed `AssetListing` per asset (no NFT in the POC).

The authoritative design and build plan live alongside this repository:

- [`new_architecture.md`](new_architecture.md) — architecture and contract.
- [`new_tasklist.md`](new_tasklist.md) — the LLM-executable build plan.

## Repository layout

| Path | Purpose |
| --- | --- |
| [`programs/`](programs/) | The Anchor program. `asset-rental/` is the live crate; `billing-access/` is a superseded legacy scope note. |
| [`clients/`](clients/) | Published client contract: hand-written TS PDA/instruction helpers and generated IDL/types. |
| [`docs/`](docs/) | Frozen on-chain contract, transaction examples, setup/deploy runbook, and diagrams. |
| [`backend/`](backend/) | Provider backend: geo/category search index, media, rental/order mirror, reconciliation. |
| [`frontend/`](frontend/) | Browser portal for Phantom/Solflare: listing management, search, booking, settle/cancel/dispute. |
| [`shared/`](shared/) | Interface definitions shared between the program clients, backend, and portal. |
| [`infra/`](infra/) | Toolchain, key setup, devnet deploy runbook, Docker packaging, host/VM wiring. |
| [`migrations/`](migrations/) | Anchor deploy hook (`deploy.ts`) used to initialize platform config. |
| [`scripts/`](scripts/) | Toolchain install, keypair generation, client export, diagram rendering. |
| [`fixtures/`](fixtures/) | Committed, non-secret on-chain fixtures produced by the test suite. |
| [`tests/`](tests/) | Cross-component acceptance suite and fixture generation. |
| [`ssh/`](ssh/) | Wallet-authenticated SSH workstream (separate Rust + QEMU test project). |

The Anchor workspace root is this directory: `Anchor.toml`, `Cargo.toml`,
`tests/`, and `migrations/` all live here, and `programs/asset-rental` is the
only workspace member.

## Components

```text
Browser portal + wallet  ------>  Solana RPC  <------  Provider backend
       |                             |
       | signs txs                   | reads finalized state, mirrors
       v                             v
   Solana program  <--------  search index / media / orders (off-chain truth for UX)
```

| Component | Responsibility |
| --- | --- |
| Browser portal + wallet | Listing CRUD, search UI (backed by the backend index), booking flow, rental status, settle/cancel/dispute actions, transaction signing. |
| Solana program | Listing terms and authorization, booking validation, overlap prevention, escrow custody, settlement splits, cancellation refunds, dispute freeze/resolution, platform pause, events. |
| Provider backend | Geo/category search index, asset images and large metadata, off-chain availability, rental/order mirror for UX, reconciliation, notifications. Never decides fund movement. |
| Admin operations | `initialize_config`, `set_config` (treasury, fee, pause), `resolve_dispute`. Admin cannot sweep escrow. |

## On-chain accounts

One program owns three accounts; every layout starts with the 8-byte Anchor
discriminator and ends with the PDA bump.

| Account | PDA seeds | Space |
| --- | --- | --- |
| `PlatformConfig` | `"config"` | 76 bytes |
| `AssetListing` | `"asset"` + owner + `asset_id` | 182 bytes |
| `RentalAgreement` | `"rental"` + listing + `rental_id` | 188 bytes |

See [`programs/asset-rental/README.md`](programs/asset-rental/README.md) and
[`docs/CONTRACT.md`](docs/CONTRACT.md) for fields, offsets, and seeds.

## Rental lifecycle

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

        settle_rental (owner & now>=start, or anyone & now>=end+GRACE)
                                  |
                              Completed
```

Escrow moves only through `settle_rental`, `cancel_rental`, and
`resolve_dispute`. Every open rental has a terminal path, so escrow can never
strand.

## Program-enforced constants

```text
GRACE_SECONDS     = 86_400   (24h after end_ts before permissionless settle)
MAX_FEE_BPS       = 1_000    (10%)
MAX_DAYS          = 36_500
SECONDS_PER_DAY   = 86_400
ASSET_ID_LEN / RENTAL_ID_LEN / METADATA_HASH_LEN = 32
BPS_DENOMINATOR   = 10_000
```

## Quick start

```bash
bash scripts/install-toolchain.sh       # Rust + Solana CLI 1.18.x + Anchor 0.30.1
anchor build                            # program, IDL, generated TS types
anchor test --provider.cluster localnet # isolated program tests
```

Then generate wallets and deploy — see [`docs/SETUP.md`](docs/SETUP.md). The
program ID is written in three places (`declare_id!`, `Anchor.toml`,
`clients/ts/constants.ts`) and `scripts/export-clients.sh` fails if they
disagree.

## Wallet roles

| Key | Role |
| --- | --- |
| `admin` | initializes and mutates `PlatformConfig`; resolves disputes |
| `treasury` | receives the platform fee on settlement (receives only) |
| `owner_a`, `owner_b` | register listings and settle rentals |
| `renter` | books listings and escrows price + deposit |
| `program` | the deployed program account |

Keypairs live in the gitignored `.keys/` directory and are never committed.

## Build streams

The POC is a solo build with three streams (see architecture §13):

1. **On-chain program** — accounts, instructions, events, client helpers, deployment, tests, fixtures.
2. **Portal + backend** — wallet portal, listing CRUD, geo/category search index, media storage, rental/order mirror, reconciliation, Docker packaging.
3. **Infra/docs** — toolchain, key setup, deploy runbook, contract/architecture docs, acceptance runner.

