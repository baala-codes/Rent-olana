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
| [`backend/`](backend/) | Provider backend: geo/category search, metadata, media, rental mirror, reconciliation, JSONL audit. |
| [`frontend/`](frontend/) | Browser portal for Phantom/Solflare: listing management, search, booking, settle/cancel/dispute. |
| [`shared/`](shared/) | Off-chain contract: metadata commitment, API DTOs, search parsing, categories. |
| [`migrations/`](migrations/) | Anchor deploy hook (`deploy.ts`) used to initialize platform config. |
| [`scripts/`](scripts/) | Toolchain install, keypair generation, client export, diagram rendering. |
| [`fixtures/`](fixtures/) | Committed, non-secret on-chain fixtures produced by the test suite. |
| [`tests/`](tests/) | Cross-component acceptance suite and fixture generation. |
| [`vercel.json`](vercel.json) | Vercel build for the portal (`frontend/dist`). |
| [`security.json`](security.json) | Canonical security.txt payload for the program metadata account. |
| [`SECURITY.md`](SECURITY.md) | Responsible-disclosure policy. |

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
| Browser portal + wallet | Listing CRUD, search UI, booking flow, rental status, settle/cancel/dispute actions, transaction signing. |
| Solana program | Listing terms and authorization, booking validation, overlap prevention, escrow custody, settlement splits, cancellation refunds, dispute freeze/resolution, platform pause, events. |
| Provider backend | Geo/category search, metadata and images, availability display, rental mirror, reconciliation, JSONL audit. Wallet-signed owner writes. Never decides fund movement. |
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
npm install                             # client/test dependencies
npm run keys:init                       # create .keys/ role wallets (gitignored)
npm run build                           # program + IDL + generated client types
npm test                                # isolated localnet program tests
```

Node 22 LTS is required for the tooling (`ts-mocha` does not run on Node 26).
Anchor test signing needs the five role wallets in `.keys/`; `npm run keys:init`
creates them on a fresh clone, and the test suite needs no funding on localnet.

Then deploy — see [`docs/SETUP.md`](docs/SETUP.md). The program ID is written in
`declare_id!` and `Anchor.toml`; the client constants are generated from the
published IDL (`clients/ts/generated.ts`). `npm run contract:check` fails if the
ID, the IDL, and the client builders disagree.

## Backend and shared contract

```bash
npm run contract:check     # IDL/ID/client drift check (no build required)
npm run test:client        # encoding + decoder + error-parsing tests
cd shared && npm install && npm test      # metadata commitment, API limits
cd backend && npm install && npm test     # search, mirror, auth, media, API
```

The backend mirrors **finalized** chain state into SQLite and serves search,
metadata, media, and order history. It never decides fund movement. See
[`backend/README.md`](backend/README.md) for the API and the wallet-signature
scheme; the portal/backend payloads live in [`shared/`](shared/).

## Deploying

| Piece | Where | Guide |
| --- | --- | --- |
| Portal | Vercel | [`docs/DEPLOY-VERCEL.md`](docs/DEPLOY-VERCEL.md) |
| Backend | Any host with a persistent `/data` volume (Render, Fly, Railway, VPS) | [`backend/README.md`](backend/README.md) |
| Program | Devnet `Ge4Z…` | [`docs/SETUP.md`](docs/SETUP.md) |

Set `VITE_API_URL` in Vercel to the backend's public URL. Without it the portal
still reads Solana, but shared names and photos are unavailable.

Program verification and security.txt are covered in
[`docs/VERIFY.md`](docs/VERIFY.md). Note that OtterSec's remote verification is
mainnet-only, so the Explorer verified badge cannot be completed for the current
devnet deployment. Media storage costs and options are in
[`docs/MEDIA.md`](docs/MEDIA.md).

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
2. **Portal + backend** — wallet portal, listing CRUD, geo/category search, media storage, rental/order mirror, reconciliation, JSONL audit.
3. **Docs/tooling** — toolchain, key bootstrap, deploy runbook, contract/architecture docs, acceptance runner, drift checks.

