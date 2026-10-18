# Backend

The provider backend for the asset-rental marketplace: a Node/TypeScript service
that makes listings discoverable and rentals usable. It **never decides fund
movement** — the Solana program owns the funds and the rental state. It reads
finalized chain accounts, mirrors them, and serves the off-chain half (search,
metadata, media, order history, audit).

- **Runtime:** Node 22.18+ (runs the TypeScript sources directly through `tsx`).
- **Storage:** SQLite via the built-in `node:sqlite` module — no native build.
  The mirror is disposable and can be rebuilt from chain state at any time.
- **Chain client:** `clients/ts/wire.ts` — the same codec, discriminators and
  account decoders the portal uses.
- **HTTP:** Node's built-in server, no framework.

## Run it

```bash
cd backend
npm install
npm start          # http://127.0.0.1:8787
npm test           # 20 tests, no validator or network required
npm run typecheck
```

On first start the mirror is empty. Populate it from finalized devnet state:

```bash
export ADMIN_TOKEN=dev-only-token
npm start
curl -X POST -H "x-admin-token: dev-only-token" http://127.0.0.1:8787/v1/admin/sync
```

Or set `SYNC_ON_START=1` (and optionally `SYNC_INTERVAL_MS=60000`). A failed RPC
read returns 503 and leaves the mirror untouched — "unknown" is never recorded
as "confirmed".

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `HOST` / `PORT` | `127.0.0.1` / `8787` | Bind address |
| `CLUSTER` | `devnet` | Label used for the RPC default and `/health` |
| `RPC_URL` | `https://api.devnet.solana.com` | Finalized chain reads |
| `DB_PATH` | `var/mirror.sqlite` | SQLite mirror |
| `MEDIA_DIR` | `var/media` | Content-addressed image files |
| `AUDIT_PATH` | `var/audit.jsonl` | Append-only audit log |
| `ADMIN_TOKEN` | unset | Enables `/v1/admin/*`; unset disables them |
| `CORS_ORIGINS` | `http://127.0.0.1:5173,http://localhost:5173` | Portal origins |
| `MAX_UPLOAD_BYTES` | `5242880` | Image upload cap |
| `SYNC_ON_START` | `false` | Sync once at boot |
| `SYNC_INTERVAL_MS` | `0` | Periodic sync (0 = off) |

## API

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/health` | Mirror counts and last sync time |
| `GET` | `/v1/categories` | Category codes (from the on-chain contract) |
| `GET` | `/v1/config` | Mirrored `PlatformConfig`, or `null` |
| `GET` | `/v1/listings` | Search: `q`, `category`, `lat`+`lng`+`radiusKm`, `availableFrom`, `days`, `sort`, `limit`, `offset`, `includeInactive` |
| `GET` | `/v1/listings/:address` | One listing with metadata and media |
| `PUT` | `/v1/listings/:address/metadata` | Owner-signed; document must hash to the on-chain `metadata_hash` |
| `POST` | `/v1/listings/:address/media` | Owner-signed raw image (`image/jpeg|png|webp|gif|avif`) |
| `GET` | `/v1/rentals` | Filters: `owner`, `renter`, `status`, `listing` |
| `GET` | `/v1/rentals/:address` | One mirrored rental |
| `POST` | `/v1/admin/sync` | Full snapshot upsert (`x-admin-token`) |
| `POST` | `/v1/admin/reconcile` | Re-read every mirrored account, correct drift |
| `GET` | `/v1/admin/audit` | Recent JSONL events |
| `GET` | `/media/:filename` | Immutable content-addressed file |

Amounts are decimal-string lamports; timestamps are Unix seconds. See
[`shared/src/api.ts`](../shared/src/api.ts) for the exact DTOs.

### Wallet-signed writes

Metadata and media writes must prove ownership of the listing. The request
carries `x-wallet`, `x-issued-at`, `x-nonce`, and `x-signature`; the signature is
Ed25519 over:

```text
asset-rental:v1
<METHOD>
<path>
<sha256 hex of the raw body bytes>
<issued-at>
<nonce>
```

Timestamps are accepted within ±5 minutes and each nonce is single-use, so a
captured request cannot be replayed. The signer must equal the listing's on-chain
owner. See [`src/auth.ts`](src/auth.ts); `backend/test/helpers.ts` has a signing
example.

### Why the metadata hash is checked

`PUT .../metadata` rejects a document whose canonical SHA-256 differs from the
listing's on-chain `metadata_hash` (409). That is the point of committing the hash
on chain: the backend must not serve a document the chain does not point at. The
canonical encoding lives in [`shared/src/metadata.ts`](../shared/src/metadata.ts)
and is shared with the portal.

## Mirror and reconciliation

`sync()` fetches the config, every `AssetListing`, and every `RentalAgreement`,
upserts them, removes rows whose accounts no longer exist, and writes an audit
event for each observed transition (`listing.registered`, `listing.updated`,
`rental.created`, `rental.settled`, …).

`reconcile()` re-reads each mirrored account individually from a finalized node,
updates or removes drift, and reports counts plus the mismatched addresses. Run
it after a restart, an uncertain confirmation, or any RPC outage.

`confirmed_at` on every DTO is the last time that row was checked. The portal
should show stale rows as unknown, not as proof.

## Tests

`npm test` runs 20 tests against an in-memory SQLite database and a fake
`ChainReader`; no validator, devnet, or network access is needed. Coverage:
search (text, category, availability, radius + distance order, pagination,
rentals by party/status), mirror sync (first observation, term changes, terminal
transitions, removals, RPC failure), reconcile (drift, missing accounts, config),
wallet auth (signature, replay, expiry, non-owner), media (upload, serve,
traversal rejection), and admin token gating.

## Trust boundary

- All amounts and statuses come from decoded program accounts; nothing here is
  authoritative.
- Writes only touch off-chain rows; the service holds no keys and signs nothing.
- The audit log contains addresses, timestamps, and amounts — never keys, PII,
  coordinates beyond a coarse location label, or document bodies.
