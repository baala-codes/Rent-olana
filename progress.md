# Project status

Updated: 2026-10-18

This is the single status document for the asset-rental POC. It records what is
built, what was verified and with which command, and what is genuinely blocked.
`pending.md` no longer exists; its blockers and findings were folded in here.

## Shape of the repository

| Path | What it is | State |
| --- | --- | --- |
| `programs/asset-rental/` | Anchor 0.30.1 program: 3 accounts, 12 instructions, events, unit tests | Complete; localnet suite exists |
| `clients/{idl,types,ts}/` | Published client: IDL, generated types, one wire implementation | Complete |
| `frontend/` | React/Vite portal: Phantom/Solflare, 5 views, booking and settlement actions | Builds; reads live devnet |
| `backend/` | Search/media/mirror/reconciliation service (Node + SQLite) | Complete and tested |
| `shared/` | Off-chain contract: metadata commitment, DTOs, search parsing | Complete and tested |
| `docs/` | Byte-level contract, examples, setup runbook, diagrams | Complete |
| `tests/` | Acceptance suite (localnet) + validator-free contract tests | Both present |
| `ssh/`, `infra/` | Removed — not part of this product | — |

## What is verified (commands run on 2026-10-18)

| Check | Command | Result |
| --- | --- | --- |
| Contract drift (IDL ↔ ID ↔ builders) | `npm run contract:check` | Pass: 12 instructions, 3 accounts |
| Client encoding/decoding/errors | `npm run test:client` | 11 pass, 0 fail |
| Shared metadata/search contract | `cd shared && npm test` | 12 pass, 0 fail |
| Backend | `cd backend && npm test` | 25 pass, 0 fail |
| Backend typecheck | `cd backend && npx tsc --noEmit` | Pass |
| Portal typecheck + production build | `cd frontend && npm run build` | Pass |
| Root typecheck + all of the above | `npm run verify` | Pass (48 tests total) |
| Backend boots and serves | `curl /health`, `/v1/listings` | 200; admin routes 403 without a token |

Not run in this environment: `cargo test`, `anchor build`, and the localnet
acceptance suite. The sandbox has no Rust/Solana/Anchor toolchain, so the
program's own 10 unit tests and the 15-case localnet suite were **not**
independently re-run here. Treat their status as "reported green previously,
needs one run on a toolchain host".

## What changed in this pass

1. **SSH workstream removed.** `ssh/` and its two diagrams are gone; the README,
   architecture note, and diagram index no longer reference it. It was a separate
   Rust/QEMU product and is not part of the rental marketplace.
2. **One encoding of the contract.** The portal no longer hand-writes
   discriminators, Borsh, PDAs, or decoders. `clients/ts/wire.ts` is the single
   implementation, consumed by the portal (`@rental-client` alias), the backend,
   and the tests. Discriminators are generated from the published IDL into
   `clients/ts/generated.ts`; `scripts/check-contract.mjs` fails on drift,
   including a check that each IDL discriminator equals
   `sha256("global:<name>")[..8]` / `sha256("account:<Name>")[..8]`.
3. **On-chain errors are no longer masked.** Anchor 0.30.1 calls
   `new SendTransactionError(message, logs)`, but web3.js ≥1.95 expects an
   options object, so the action becomes `undefined` and both logs and signature
   are dropped. `clients/ts/instructions.ts` now re-simulates the same builder on
   failure (`replaceRecentBlockhash`, no signer needed) and rethrows a
   `ProgramInvocationError` carrying the real code, name, message, and logs.
   `parseProgramError` also decodes RPC and structured error shapes.
4. **Booking race removed.** The acceptance suite no longer uses a fixed
   `START_MARGIN` (30s) to dodge `StartInPast`. `bookStartingSoon` starts with a
   small lead and retries with a fresh timestamp only if the program returns
   `StartInPast`; retries reuse the same `rental_id` and cannot double-escrow.
5. **Fresh clone can test.** `.keys/` is gitignored but `.keys/admin.json` was
   referenced by `Anchor.toml`. `scripts/bootstrap-keys.sh` creates the five role
   wallets (`npm run keys:init`), and `scripts/anchor.sh` calls it automatically
   before any command that needs a wallet. `--program` also creates the deploy
   keypair and runs `anchor keys sync` with an explicit warning that the ID moves.
6. **Stylesheet split.** `frontend/src/styles.css` is now an ordered `@import`
   manifest over `frontend/src/styles/*.css` (14 files, split at the existing
   section boundaries). The built CSS is byte-identical (same hash), so this is a
   maintainability change with no visual delta. New component-specific rules
   should use CSS Modules beside the component.
7. **Backend and shared contract built.** See `backend/README.md` and
   `shared/README.md`. The backend does finalized-only reads, never handles keys,
   and never decides fund movement. Terminal rental transitions can be posted to
   an operator webhook (`NOTIFY_WEBHOOK_URL`); delivery is best-effort and never
   blocks `sync()`.
8. **Portal uses the backend when available.** Discovery, metadata, and media
   come from `/v1/listings` and `/v1/rentals`; direct RPC reads remain the
   fallback. The market gained latitude/longitude/radius search and the booking
   form gained a 28-day availability calendar driven by `busy_until`. Owner
   metadata and media writes are wallet-signed against a fresh finalized read.
9. **Payout hardening.** `settle_rental` payees are bound to the stored rental
   parties, and the two settlement gates are a pure, unit-tested rule.

## Deliberately out of scope

- **Systemd/cloud deployment.** Dockerfiles and a compose file are included for
  local packaging; no systemd units, Kubernetes manifests, or managed-cloud
  deployment are part of the POC.
- **Event-subscription indexing.** The backend mirrors finalized accounts on a
  poll/reconcile loop. It does not keep a live program-log subscription; the
  chain accounts remain the authoritative source.

## Real blockers and open items

1. **Devnet SOL.** Deploying and running the devnet acceptance suite still needs a
   funded wallet set. The public faucet is exhausted for the author's IP. The
   suite now funds each role wallet with **0.05 SOL** (`fund()`), so the tests
   themselves need only ~0.2 SOL; fund `admin` with whatever the faucet gives
   (up to 1 SOL) plus enough for deployment rent, then run:
   ```bash
   bash scripts/anchor.sh deploy --provider.cluster devnet
   bash scripts/anchor.sh test --provider.cluster devnet
   ```
2. **Fixtures are localnet.** `fixtures/*.json` carry `"cluster": "localnet"`.
   Regenerate them on devnet (step §94) before the portal/backend treat them as
   shared examples.
3. **Program tests need a toolchain host.** Run `cargo test -p asset-rental` and
   `bash scripts/anchor.sh test --provider.cluster localnet` once on a machine
   with Rust + Anchor. This pass could not.
4. **Node version.** Use Node 22 LTS. `ts-mocha` (the acceptance suite runner)
   crashes on Node 26 because of a yargs/ESM incompatibility; the new
   validator-free tests use `tsx` and run on either.

## Next commands (in order)

```bash
npm ci                          # root: tsx, tsc, anchor client
npm run keys:init               # five role wallets in .keys/ (gitignored)
npm run contract:check          # IDL / program ID / builders agree
npm run test:client             # encoding, decoders, error parsing
npm run typecheck

cd shared  && npm install && npm test
cd backend && npm install && npm test && npm start   # http://127.0.0.1:8787
# with the backend running, prime the index once:
curl -X POST -H "x-admin-token: dev-only-token" http://127.0.0.1:8787/v1/admin/sync
cd frontend && npm install && npm run build

# with a funded devnet wallet:
bash scripts/anchor.sh deploy --provider.cluster devnet
bash scripts/anchor.sh test   --provider.cluster devnet
```
