# Asset-Rental POC — consolidated progress log

Updated: 2026-10-15
Purpose: the single place to read where this project stands mapped to
`new_tasklist.md` (the 6-point, 94-step build plan). Each section names the exact
tasklist steps, what is done, what is verified, and the exact next command.

This file replaces the earlier `progress.md` at the repository root (a free-form
session dump) and `lendersol/progress.md` (a structured tasklist-mapped log). The
structured mapping is kept; the `lendersol/` folder has been removed, so this
root file is now the only progress log. `new_architecture.md` and
`new_tasklist.md` live at the repository root.

## Overall completion

The on-chain program and its hand-written clients/docs/tests exist and were
designed to the tasklist. What remains is the **build → publish → deploy → run**
tail, which is blocked on a machine with the Anchor/Solana toolchain and a funded
wallet set.

| Point | Steps | Deliverable status | Est. % |
| --- | --- | --- | --- |
| 1. Scaffold, accounts, errors, constants | 1–22 | Done — all files present | 100% |
| 2. Instructions (11 instructions + helper) | 23–54 | Done — all handlers + events wired | 100% |
| 3. Validation pass | 55–62 | Invariants enforced in code; §62 gate not re-run here | ~100% |
| 4. Publish the shared contract | 63–70 | TS clients + docs done; **IDL/types not generated** (step 63) | ~88% |
| 5. Deploy & wallet setup | 71–77 | Anchor.toml + migration done; **not deployed / keys absent** | ~43% |
| 6. Acceptance tests | 78–94 | Suite written; **never executed**, no fixtures | ~88% |
| **Total** | **94** | | **~92% (≈87/94)** |

"Deliverable status" counts a step as done when its artifact exists in the tree;
it does not mean the step's command was executed or verified in this environment.
The ~8% left is concentrated entirely in Points 4-tail, 5, and 6-execution.

## Working tree state

- Repository root: `Rent-olana/` (git repo; `main`).
- Root files: `Anchor.toml`, `Cargo.toml`/`Cargo.lock`, `package.json`/lock,
  `tsconfig.json`, `new_architecture.md`, `new_tasklist.md`, `README.md`, this
  `progress.md`.
- `lendersol/` has been **removed** (it contained only a duplicate
  `progress.md`); nothing else in the tree linked into it.
- Gitignored / not present in this snapshot: `.keys/`, `node_modules/`,
  `target/`, `.anchor/`, `test-ledger/`.
- Not installed in this environment: `rustc`, `cargo`, `anchor`, `solana`
  (only `node` v26 is present). So no Rust build, SBF build, IDL generation,
  validator run, or TS typecheck can be executed here — see "Verification".

## Point 1 — scaffold, accounts, errors, constants (steps 1–22) — DONE

- `programs/asset-rental/` workspace; `Cargo.toml` (root) sets
  `[profile.release] overflow-checks = true`; `programs/asset-rental/Cargo.toml`
  pins `anchor-lang = "0.30.1"`.
- `constants.rs`: `GRACE_SECONDS`, `MAX_FEE_BPS`, `MAX_DAYS`, `SECONDS_PER_DAY`,
  `ASSET_ID_LEN`, `RENTAL_ID_LEN`, `METADATA_HASH_LEN`, and the basis-point
  denominator (named `BPS_DENOMINATOR`; tasklist wrote `BASIS_POINTS_DENOMINATOR`).
- `state.rs`: `PlatformConfig` (LEN 76), `AssetListing` (LEN 182), `RentalStatus`
  enum, `RentalAgreement` (LEN 188) — each with `SEED_PREFIX`, `LEN`, and `pda()`
  built exactly from the tasklist 1.3 seeds. Extra helpers: `fee_on`, `is_open`,
  `is_terminal`, `is_party`, `split`, `release`.
- `errors.rs`: `RentalError` with `#[msg(...)]` on every variant, in declaration
  order. Adds `InvalidTreasury` and `InvalidShare` beyond the tasklist list.
- `lib.rs`: declares and glob-re-exports `constants`/`errors`/`events`/`state`/
  `instructions`; `declare_id!` set.
- `#[cfg(test)]` tests in `state.rs`: Borsh/LEN round-trips, 1-byte enum
  discriminants, status classification, fee rounding, split conservation, pointer
  release (7 tests).

Status: complete. Prior sessions recorded `cargo test -p asset-rental` → 7/7 and
`cargo build-sbf` producing a deployable `.so`; those runs cannot be repeated
here for lack of a Rust toolchain.

## Point 2 — instructions (steps 23–54) — DONE

All 11 instructions plus the shared escrow helper exist, are registered in
`lib.rs`, and emit their events:

- Config: `config.rs` — `InitializeConfig`, `SetConfig`, both handlers; fee cap
  and non-default treasury checks.
- Listing: `register_asset.rs`, `update_asset.rs`, `set_listing_status.rs`,
  `close_listing.rs` — ownership / active / `current_rental` guards; economic
  terms frozen while rented.
- Rental core: `create_rental.rs` (escrow transfer + pointer/watermark),
  `settle_rental.rs` (owner gate ∨ `end + GRACE` gate; three-way split),
  `cancel_rental.rs` (pre-start full refund), `dispute.rs` (`raise_dispute`),
  `resolve_dispute.rs` (admin bps split), `close_rental.rs` (rent to renter).
- `escrow.rs`: single PDA-signed `transfer_out` helper, so the
  `[b"rental", listing, rental_id]` seed layout can't drift across the three
  moving paths.
- `events.rs`: `ConfigInitialized`, `ConfigUpdated`, `ListingUpdated`,
  `ListingStatusChanged`, `ListingClosed`, `RentalCreated`, `RentalSettled`,
  `RentalCancelled`, `RentalDisputed`, `RentalResolved`, `RentalClosed`.

Status: complete in code.

## Point 3 — validation pass (steps 55–62) — DONE (invariants in code)

Every invariant the tasklist asks to re-check is enforced by construction:

- Treasury/fee come from `PlatformConfig` only; no instruction accepts either
  from the client (steps 55, 59).
- Escrow moves only in `settle_rental`, `cancel_rental`, `resolve_dispute`; each
  re-derives the rental PDA from stored state; no admin sweep (step 56).
- Duplicate `rental_id` is rejected atomically by `init` on the rental PDA
  (documented in `lib.rs`/`state.rs` as the replay guard); `RentalIdReused`
  remains a reserved alias, matching the tasklist note (step 57).
- Overlap guard `start_ts >= busy_until`; pointer/watermark cleared on every
  terminal transition except `Disputed` (step 58).
- `paused` blocks only `create_rental`; settle/cancel/dispute keep working
  (step 59).
- All time/lamport math uses `checked_*`; `overflow-checks = true` is set
  (step 60).
- Price/deposit/max_days immutable while `current_rental` is set (step 61).

Outstanding for a literal §62 pass: re-run a clean `cargo test -p asset-rental`
+ `anchor build` (or `cargo build-sbf`) on a machine with the toolchain, and
treat zero warnings + green tests as the Point 3 completion signal.

## Point 4 — publish the shared contract (steps 63–70) — PARTIAL (7/8)

Done:
- `clients/ts/constants.ts` (step 64): program ID, cluster, RPC, seed prefixes,
  account-length table, `RENTAL_STATUS` discriminants, `RENTAL_ERRORS` table
  (base 6000, append-only), `GRACE_SECONDS`, `MAX_FEE_BPS`, `SECONDS_PER_DAY`.
- `clients/ts/pda.ts` (step 65): `configPda` / `listingPda` / `rentalPda` with
  `toBytes32` length checks, byte-for-byte with `state.rs`.
- `clients/ts/instructions.ts` (step 66): `newAssetId` / `newRentalId` and
  builders for all instructions, PDAs derived internally.
- `clients/ts/index.ts` (step 67): barrel export.
- `docs/CONTRACT.md` (step 68) and `docs/EXAMPLES.md` (step 69): byte-offset
  tables, seed tables, discriminators, error table, per-instruction account
  lists.
- Fixture-dump convention (`scenario()` + `recordFixture()` into
  `fixtures/<scenario>.json`) ported into the test suite (step 70).

Not done (step 63):
- `anchor build` has not been run successfully, so `target/idl/asset_rental.json`
  and `target/types/asset_rental.ts` do not exist and have not been copied into
  `clients/idl/` and `clients/types/` (both directories are absent). The TS
  helpers were written to mirror the program, but have not been cross-checked
  byte-for-byte against a freshly generated IDL.

Next:
1. Install `anchor-cli 0.30.1` (`scripts/install-toolchain.sh`).
2. `anchor build` so the IDL/types are produced.
3. `bash scripts/export-clients.sh` to publish them into `clients/idl` +
   `clients/types` (it also enforces the three-place program-ID check).

## Point 5 — deploy & wallet setup (steps 71–77) — PARTIAL

Done:
- `Anchor.toml` (step 71): `asset_rental` under `[programs.devnet]` and
  `[programs.localnet]`, `provider.cluster = "devnet"`,
  `provider.wallet = ".keys/admin.json"`, and the `test` script pointing at
  `tests/asset-rental.ts`.
- `migrations/deploy.ts` (step 76 code): idempotent `initialize_config(treasury,
  250)`, signature logged.
- `docs/SETUP.md` (part of step 77): toolchain, wallet-role table, three-place
  program-ID rule, deploy steps, troubleshooting. Program ID is consistent in the
  three places, and generated wallet **public** keys are recorded there.

Not done:
- `.keys/` is absent from this tree, so the role keypairs are not present to
  deploy with (step 72); nothing is funded (step 73).
- `anchor keys sync` not run against a local program keypair (step 74).
- `anchor deploy --provider.cluster devnet` not run; no deploy tx recorded
  (step 75).
- No real devnet `register_asset` + `create_rental` + `settle_rental` run with
  recorded signatures into `fixtures/` (step 77 tail).

Next:
1. Regenerate keys only if needed:
   `mkdir -p .keys && python3 scripts/gen-keypairs.py .keys admin treasury owner_a owner_b renter program`
   (or reuse the existing keypairs) and fund admin/owner_a/owner_b/renter.
2. `mkdir -p target/deploy && cp .keys/program.json target/deploy/asset-rental-keypair.json && anchor keys sync`,
   then mirror the resulting ID into `clients/ts/constants.ts`.
3. `anchor deploy --provider.cluster devnet`; verify with `solana program show`.
4. Let the migration run `initialize_config`; record the tx in `docs/SETUP.md`.
5. Do one live register/book/settle and drop the signatures into `fixtures/`.

## Point 6 — acceptance tests (steps 78–94) — PARTIAL (written, not run)

Done (steps 78–92): `tests/asset-rental.ts` (~1008 lines) implements the full
harness — `fund()` from the deploy wallet, `scenario()` with pre/post fixture
dump, `expectError()`/`expectFailure()` — and the complete coverage list:
register fields, update auth + frozen terms, create escrow/watermark/pointer,
overlap, replay, rejection matrix, cancel (pre/post start), settle owner path,
settle timeout gate, dispute freeze + non-admin denial + exact admin split,
pause, close listing/rental, and a randomized invariant fuzz. The before-hook
initializes config (250 bps) and registers L1/L2 with the specified terms.

Not done:
- `anchor test --provider.cluster localnet` not run (step 93).
- `anchor test --provider.cluster devnet` not run (step 93).
- No `fixtures/*.json` committed and no program ID / deployment tx /
  config-init tx recorded (step 94).

Next:
1. Finish Points 4 and 5 first — the suite needs the generated IDL plus a
   deployed program and funded wallets.
2. `anchor test --provider.cluster localnet`, fix failures, then repeat on
   `devnet`.
3. Commit regenerated `clients/idl`, `clients/types`, and `fixtures/`, and
   record cluster, program ID, signatures, and IDs in `docs/SETUP.md`.

## Verification performed in this pass

- Read the full program source, client helpers, docs, `Anchor.toml`,
  `migrations/deploy.ts`, `scripts/export-clients.sh`, and the test suite, and
  confirmed the artifacts each tasklist step names exist.
- Confirmed `target/idl`, `target/types`, `clients/idl`, `clients/types`, and
  `.keys/` do **not** exist, and that no `fixtures/*.json` are present.
- Confirmed no toolchain (`rustc`/`cargo`/`anchor`/`solana`) is installed here
  and `node_modules` is absent, so builds, IDL generation, the validator suite,
  and `tsc --noEmit` could not be run in this environment. Earlier sessions
  recorded green host tests and an SBF build; those results are not re-verified
  here and should be re-confirmed after the toolchain is installed.

## Known deviations / minor notes

- `BPS_DENOMINATOR` (program) vs `BASIS_POINTS_DENOMINATOR` (tasklist);
  `DepositOverflow` used where the tasklist named `AmountOverflow`. Both are
  documented as deliberate deviations in `docs/CONTRACT.md`.
- `DisputeInProgress` exists as an error but the current guards reuse
  `InvalidStatus`; noted as reserved.
- `docs/README.md` still says the design docs live in "the repository's `new/`
  directory" — a stale pointer; the files are at the repo root. Cosmetic.

## Exact next commands (in order)

```bash
bash scripts/install-toolchain.sh                 # anchor 0.30.1, solana 1.18.x
cargo test -p asset-rental                        # Point 3 §62 gate
anchor build                                      # generate IDL + types
bash scripts/export-clients.sh                    # Point 4 §63 -> clients/
anchor keys sync && anchor deploy --provider.cluster devnet   # Point 5
anchor test --provider.cluster localnet           # Point 6
anchor test --provider.cluster devnet             # Point 6
```
