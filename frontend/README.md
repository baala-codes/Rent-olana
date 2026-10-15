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

The portal is **self-contained**: no backend is required. Listing discovery uses
`getProgramAccounts`, and the off-chain half of a listing (name, description,
photo, location) is kept locally — see below.

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
| **market** | Reads every `AssetListing` from devnet with search (name/asset id/owner/category/location), a category filter, and an availability filter. Loads with skeletons. Selecting a row opens the booking form. |
| **my listings** | Owners register an asset with its off-chain document, then activate/deactivate, edit terms, edit metadata, or close. Economic terms are disabled on-chain while a rental holds the listing. |
| **rentals** | Every rental where the connected wallet is owner or renter, with the actions valid *right now*: pre-start **cancel**, **dispute**, **settle** (owner gate, or permissionless after `end + 24h`), admin **resolve**, and **close** to reclaim rent. |
| **admin** | Initialise the platform config once, update treasury/fee/pause, and resolve the dispute queue. |

The header carries the cluster, the connected wallet's live SOL balance (with a
faucet link when low), and the wallet button.

## How it talks to the program

There is **no generated IDL** (the workspace has not run `anchor build`), so the
portal hand-encodes everything against the frozen contract:

- `src/solana/constants.ts` — program ID, seeds, account/instruction
  discriminators, error table. Verified against [`docs/CONTRACT.md`](../docs/CONTRACT.md).
- `src/solana/codec.ts` — a small Borsh writer/reader (LE integers, the `Option`
  tag, raw 32-byte values).
- `src/solana/instructions.ts` — one builder per instruction; account order and
  writability flags match [`docs/EXAMPLES.md`](../docs/EXAMPLES.md).
- `src/solana/accounts.ts` — fetches and decodes accounts using the byte-offset
  tables in `CONTRACT.md`.

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
  styles.css              the Solana theme
```

## Verified

- `npm run build` (tsc `--noEmit` + `vite build`) passes.
- The dev server renders all four tabs with **no console errors**.
- Hand-encoded instructions were executed in the browser and checked against the
  contract (every discriminator and argument byte matches).
- The metadata commitment was executed in the browser: canonical document →
  64-hex SHA-256 → 32 bytes, deterministic, stored and retrievable.

## Limitations

- **The program is not deployed** (no IDL, no `.keys/`, nothing on devnet), so
  live reads return zero accounts and every list shows an empty state. The portal
  is wired for a deployed program and will populate the moment one exists.
- Metadata is per-browser (`localStorage`), so a listing's name/photo is only
  visible to whoever created it on that machine. A shared index (object storage
  + a provider backend) is the documented next step for cross-user discovery.
- The public devnet RPC rate-limits bursts (HTTP 429); reads are sequential with
  backoff and a friendly retry message.
- Search is client-side over `getProgramAccounts`; the geo/category index the
  architecture describes is not built here.
