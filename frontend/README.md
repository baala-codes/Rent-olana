# Rent-olana portal

The browser portal for the asset-rental marketplace, connected to Phantom or
Solflare. It signs transactions but never holds keys, and it never decides fund
movement — the program does. This is the "portal" half of the frontend stream in
[`new_architecture.md`](../new_architecture.md) §7.

> **Theme: Solana.** A near-black canvas with ambient purple/green glow, the
> `#9945FF → #14F195` gradient as the single accent (brand mark, wordmark, primary
> buttons), neon status badges, and monospace addresses. Structurally it stays
> dense and text-first — ranked rows, tabular config, tight metadata tables — in
> the spirit of Hacker News / Y Combinator.

## Stack

- React 18 + TypeScript + Vite.
- `@solana/web3.js` for RPC and transactions.
- `@solana/wallet-adapter` (react, react-ui) with the **Phantom** and **Solflare**
  adapters — exactly the wallets the architecture names.
- Reads go straight to **devnet** (`https://api.devnet.solana.com`).

The portal prefers the **backend index** for discovery, metadata, and media when
it is reachable (`VITE_API_URL`, default `http://127.0.0.1:8787`). If the backend
is offline or still empty, it falls back to direct `getProgramAccounts` reads and
the browser-local metadata store, so booking and settlement keep working as a
static bundle. Set `VITE_API_URL=off` to force the RPC-only mode.

The backend must be running and synced (`POST /v1/admin/sync`, or
`SYNC_ON_START=1`) for shared listings to appear. Metadata and media writes are
wallet-signed; media uploads appear after the owner saves and commits the new
`metadata_hash`.

## Running it

```bash
cd frontend
npm install
npm run dev          # http://127.0.0.1:5173
```

Other scripts: `npm run build` (typecheck + production bundle to `dist/`),
`npm run preview`, `npm run typecheck`. Requires Node 18+.

## What it does

| Tab | Behaviour |
| --- | --- |
| **market** | Searches listings through the backend index (text, category, availability, latitude/longitude/radius) and falls back to RPC reads with client-side filtering. A source badge shows which path served the last read. Selecting a row opens the booking form. |
| **my listings** | Owners register an asset with its off-chain document, publish that document and an optional photo to the backend, then activate/deactivate, edit terms, edit metadata, or close. Economic terms are disabled on-chain while a rental holds the listing. |
| **rentals** | Every rental where the connected wallet is owner or renter, with the actions valid *right now*: pre-start **cancel**, **dispute**, **settle** (owner gate, or permissionless after `end + 24h`), admin **resolve**, and **close** to reclaim rent. |
| **admin** | Initialise the platform config once, update treasury/fee/pause, and resolve the dispute queue. |

The header carries the cluster, the connected wallet's live SOL balance (with a
faucet link when low), and the wallet button.

## How it talks to the program

The portal does **not** carry its own encoding. It imports the published client
contract from [`clients/ts/`](../clients/ts/) through the `@rental-client` alias:

- `clients/ts/contract.ts` — program ID, seeds, statuses, errors, categories.
  Every instruction/account discriminator comes from
  `clients/ts/generated.ts`, which is generated from the published IDL by
  `scripts/gen-client-constants.mjs`. Nothing is hand-copied.
- `clients/ts/wire.ts` — the single Borsh writer/reader, PDA derivation,
  instruction builders, and account decoders. The backend and the acceptance
  tests use the same module, so all three are byte-identical by construction.
- `src/solana/{constants,accounts,instructions}.ts` — thin re-exports for the
  views; the only portal-specific code left in `src/solana/` is formatting and
  transaction sending.

The off-chain metadata commitment is shared too: `src/metadata/store.ts`
persists documents but delegates canonicalisation and SHA-256 to
[`shared/src/metadata.ts`](../shared/src/metadata.ts), which the backend uses to
verify that a stored document matches the on-chain `metadata_hash`.

`scripts/check-contract.mjs` (run by `npm run contract:check`) fails if the IDL,
the program ID, and the client builders drift apart.

Two Vite shims are required by `@solana/web3.js` and live in
[`vite.config.ts`](vite.config.ts): `global → globalThis` and `buffer → the npm
buffer package` (Vite otherwise externalises the Node builtin and breaks
transaction encoding).

## Off-chain metadata

The program stores only a 32-byte `metadata_hash` and a category code. The
human-readable document (name, description, photo URL, location label) is kept
off-chain, and the portal implements that half faithfully:

- `src/metadata/store.ts` builds a **canonical JSON** document (fixed key order),
  takes its **SHA-256**, and writes that 32-byte value on-chain as
  `metadata_hash`. Because the encoding is canonical, the same document always
  commits to the same hash, so a listing's document can be verified against the
  chain.
- Documents are stored in `localStorage` keyed by that hash. The market and
  detail views look up listings by hash and show the name, description, photo,
  and location when the document is known, falling back to the category label
  otherwise.
- Editing metadata always succeeds (only `metadata_hash` changes), even while a
  rental is open — matching the contract, where the hash and category are the
  two always-mutable fields.

## Availability calendar

`AvailabilityCalendar` renders the next 28 days from the listing's on-chain
`busy_until` watermark: days before it are booked, days after it are selectable
and set the booking start date. The program has no interval set, so this is an
exact view of what the program will accept.

## Booking is persist-before-submit

The booking flow mints a fresh 32-byte `rental_id`, **writes it to
`localStorage` before signing**, and reuses it on retry. That makes a
confirmation timeout safe: the retry targets the same rental PDA instead of
double-charging. The id is cleared once the transaction confirms.

## Structure

```
src/
  App.tsx                 tab shell + sidebar + footer
  ProgramContext.tsx      connection, devnet reads (retry/backoff), wallet actions, metadata
  wallet/Providers.tsx    wallet-adapter providers (Phantom, Solflare)
  metadata/store.ts       off-chain document store + sha256 commitment
  solana/                 constants, pda, codec, accounts, instructions, format, tx
  components/             TopBar, WalletBalance, Footer, ActionBar, ProgramStatus, ui primitives
  views/                  Market, ListingDetail, Manage, Rentals, Admin
  styles.css              ordered @import manifest for the theme
  styles/                 base tokens, then one file per UI area
```

## Verified

- `npm run build` (tsc `--noEmit` + `vite build`) passes.
- The dev server renders all four tabs with **no console errors**.
- Hand-encoded instructions were executed in the browser and checked against the
  contract (every discriminator and argument byte matches).
- The metadata commitment was executed in the browser: canonical document →
  64-hex SHA-256 → 32 bytes, deterministic, stored and retrievable.

## Limitations

- **The program is not deployed yet**, so live reads return zero accounts and
  every list shows an empty state. The portal is wired for a deployed program and
  will populate the moment one exists.
- Backend search only sees rows that have been mirrored. Run a sync after a
  listing is registered (or set `SYNC_INTERVAL_MS`) before expecting the shared
  index to show it; chain reads remain the fallback.
- Media uploads are authorized against a fresh finalized chain read and stored under `/media`; the listing must exist on-chain.
- The public devnet RPC rate-limits bursts (HTTP 429); reads are sequential with
  backoff and a friendly retry message.
- The RPC fallback still loads every account and filters client-side, so a large
  deployment depends on the backend index.
