# Asset-Rental POC — accumulated progress log

Updated: <leave this header when regenerating>
Purpose: give the next session a single place to read where this project stands mapped
to `new_tasklist.md` (the 6-point build plan). Every section names the exact tasklist
steps, what is done, what is verified, and the exact next command.

## Working tree state (before the next session touches anything)

- Repo root: `Rent-olana/lendersol/` (git repo; first commit already made).
- Exact git root: `/home/bala_elon/ddev/pvt/Rent-olana/lendersol`
- Git remote: `origin git@github.com:baala-codes/unknown.git`
- Branch: `main`, first commit landed, working tree clean (1 staged-then-committed
  snapshot of 110 files; `.freebuff/` excluded, build/keys/node_modules gitignored).
- project.json (root of that repo): `lendersol/project.json` or equivalent is not
  part of this snapshot. The repo-level `README.md` at `Rent-olana/` is separate from
  `lendersol/README.md` and is archived elsewhere.
- Repo-level gitignored (never ship): `target/`, `.anchor/`, `.keys/`, `node_modules/`,
  `test-ledger/`, `.nyc_output/`, `__pycache__/`, `*.pyc`, `*.log`, `.DS_Store`.
- Stale gitignored artifacts still on disk (left in place, not deleted): any legacy
  `target/deploy/solana_vps.*` and `.keys/obsolete-vps-program.json`.

## Point 1 — scaffold, accounts, errors, constants (tasklist steps 1-22) — DONE

Done:
- Project already scaffolded around `programs/asset-rental/` with
  `programs/asset-rental/src/instructions/` holding every instruction module.
- `Cargo.toml` (workspace root) has `[profile.release]` plus overflow-checks.
- `programs/asset-rental/Cargo.toml`: `anchor-lang = "0.30.1"` in dependencies.
- `constants.rs`: GRACE_SECONDS, MAX_FEE_BPS, MAX_DAYS, SECONDS_PER_DAY,
  ASSET_ID_LEN, RENTAL_ID_LEN, METADATA_HASH_LEN, BPS_DENOMINATOR.
- `state.rs`: PlatformConfig, AssetListing, RentalStatus enum, RentalAgreement,
  each with SEED_PREFIX, LEN, and `pda()` built from the seeds in tasklist 1.3.
- `errors.rs`: RentalError with all listed variants and `#[msg(...)]`.
- `lib.rs`: `mod constants; mod errors; mod events; mod state; mod instructions;`
  plus public `use` globs.
- `#[cfg(test)]` Borsh/LEN round-trip tests exist in `state.rs`.

Verified:
- `cargo test -p asset-rental` → 7/7 pass, zero warnings (re-verify after any change).
- `cargo build-sbf` produced a deployable on-chain `.so` for the asset-rental target.

Next:
- None, Point 1 is complete. Re-run `cargo test -p asset-rental` only if code changes.

## Point 2 — instructions (tasklist steps 23-54) — DONE

Done:
- `instructions/mod.rs` declares every module and re-exports with `pub use` globs.
- Config: `config.rs` — InitializeConfig + set_config accounts/handlers, fee cap check.
- Listing: `register_asset`, `update_asset`, `set_listing_status`, `close_listing`
  — all present with ownership/active/current_rental guards.
- Rental (core): `create_rental`, `settle_rental`, `cancel_rental`,
  `raise_dispute`, `resolve_dispute`, `close_rental` — all present.
- Shared PDA-signed transfer helper: `escrow.rs`.
- Events wired in `events.rs` and emitted at transitions.

Verified:
- Program compiles and the instruction modules are all importable/testable from the
  host side (`cargo test -p asset-rental` green).

Next:
- None for Point 2 itself. Point 4 and Point 6 use these instructions, so they get
  re-verified implicitly through the tests.

## Point 3 — validation pass (tasklist steps 55-62) — PARTIAL

Claims embedded in the code (read and trust until formally re-checked):
- Platform treasury is read from `config.treasury` only; no client-passed treasury
  override in the handlers.
- Escrow moves only in `settle_rental`, `cancel_rental`, `resolve_dispute`;
  each re-derives the rental PDA and checks status; no admin sweep.
- Duplicate `rental_id` is enforced atomically by `init` on the rental PDA; runtime
  surfaces an “account already in use” style error, not a `RentalError` alias.
- Overlap guard: `start_ts >= busy_until` on create; pointer cleared on every
  terminal transition except Disputed.
- `paused` blocks only `create_rental`; settle/cancel/dispute still usable while paused.
- Time/lamport math uses `checked_*` and `[profile.release]` has overflow-checks.

What still needs a formal pass:
- Re-read each instruction and confirm the treasury-from-config invariant verbatim
  (step 55).
- Confirm escrow move sites and PDA re-derivation (step 56).
- Confirm the duplicate-rejection comment and alias note (step 57).
- Confirm overlap guard and pointer clearing on each terminal variant (step 58).
- Confirm `paused` scope (step 59).
- Confirm all time/lamport math is checked and overflow profile is set (step 60).
- Confirm listing price/deposit/max_days immutable while `current_rental` is set
  (step 61).
- Run clean build + green host tests and treat that as the §62 gate (step 62).

Next:
- Run the §62 gate command and treat it as the Point 3 completion signal:
  `cargo test -p asset-rental` clean + `cargo build-sbf` or `anchor build` clean.

## Point 4 — publish the shared contract (tasklist steps 63-70) — PARTIAL

Done:
- `clients/ts/constants.ts`: PROGRAM_ID placeholder, CLUSTER, RPC_URL, seed prefixes
  (`config`/`asset`/`rental`), account-length table, rental-status discriminants,
  rental-error code table (base 6000, append-only), GRACE_SECONDS, MAX_FEE_BPS,
  SECONDS_PER_DAY.
- `clients/ts/pda.ts`: `configPda()`, `listingPda(owner, assetId)`,
  `rentalPda(listing, rentalId)` with `toBytes32` length checks, seeds byte-for-byte
  with `state.rs`.
- `clients/ts/instructions.ts`: `newAssetId()`, `newRentalId()` (32 random bytes,
  persist-before-submit guidance), builders for all 11 instructions, PDAs derived
  internally.
- `clients/ts/index.ts`: barrel export.
- `docs/CONTRACT.md`, `docs/EXAMPLES.md`, `docs/SETUP.md` rewritten with byte-offset
  tables, seed tables, discriminators, error table, per-instruction account lists.
- `scripts/export-clients.sh` exists to copy generated IDL + types into `clients/`.

Not done:
- Actual `anchor build` has not been run successfully in this session, so
  `target/idl/asset_rental.json` and `target/types/asset_rental.ts` are not generated
  and have not been copied into `clients/idl/` and `clients/types/`.
- The TS client files were written to mirror the program, but a byte-for-byte
  discriminator / account-size cross-check against a freshly generated IDL has not run.

Verified:
- TS typechecks clean (`npx tsc --noEmit` or `npm run typecheck`) — clients compile
  without generated types.

Next:
1. Install `anchor-cli 0.30.1` (see “version/tooling” below).
2. `anchor build` or equivalent so `target/idl/asset_rental.json` and
   `target/types/asset_rental.ts` exist.
3. Run `bash scripts/export-clients.sh` to copy them into `clients/idl/` and
   `clients/types/`.
4. Fill in the real PROGRAM_ID everywhere (three-place rule:
   `declare_id!` in lib.rs, `Anchor.toml`, `clients/ts/constants.ts`).
5. Re-run TS typecheck with the generated types present.

## Point 5 — deploy & wallet setup (tasklist steps 71-77) — NOT STARTED

Not done:
- Wallet roles fully provisioned across `.keys/` (treasury exists; admin/owner_a/
  owner_b/renter/program placeholders not confirmed).
- Program ID finalized and the three-place rule satisfied.
- `anchor deploy --provider.cluster devnet` (or localnet) not run.
- `migrations/deploy.ts` not executed against a real cluster.
- Real on-chain `register_asset` + `create_rental` + `settle_rental` with recorded
  signatures into `fixtures/` not done.

What exists:
- `Anchor.toml` points at `asset_rental`, devnet cluster, `.keys/admin.json` provider,
  and a `tests/asset-rental.ts` test script target.
- `migrations/deploy.ts` calls `initialize_config(treasury, 250)` idempotently.

Next:
1. Confirm/fix PROGRAM_ID three-place rule.
2. Provision keypairs (`.keys/admin.json`, `.keys/owner_a.json`, `.keys/owner_b.json`,
   `.keys/renter.json`, `.keys/program.json`) using `scripts/gen-keypairs.py` or
   `solana-keygen`.
3. Airdrop SOL to admin/owner_a/owner_b/renter; treasury only receives.
4. `mkdir -p target/deploy && cp .keys/program.json target/deploy/asset_rental-keypair.json
   && anchor keys sync`.
5. `anchor deploy --provider.cluster devnet` (or localnet).
6. Run `migrations/deploy.ts`.
7. Record program ID, deploy tx, config-init tx, and one real register/create/settle
   in `docs/SETUP.md` and dump any signatures/fixtures into `fixtures/`.

## Point 6 — acceptance tests (tasklist steps 78-94) — NOT STARTED

What exists:
- `tests/asset-rental.ts` written (new; old `solana-vps.ts` removed) with the full
  harness: register/create/overlap/replay/rejection-matrix/cancel/settle/dispute/
  pause/close/invariant-fuzz.
- TS typechecks clean.

Not done:
- `anchor test --provider.cluster localnet` not run.
- `anchor test --provider.cluster devnet` not run.
- Results not recorded.

Next:
1. Complete Point 4 and Point 5 first — the TS suite depends on generated IDL +
   deployed program + populated keypairs.
2. Run `anchor test --provider.cluster localnet` and fix any failures.
3. Run `anchor test --provider.cluster devnet` and fix any failures.
4. Commit regenerated `clients/idl/`, `clients/types/`, and any `fixtures/` outputs.
5. Record outcomes in `docs/SETUP.md`.

## Version / tooling alignment — DONE (decision made), install IN PROGRESS

Decision:
- Anchor SDK on the program side: `anchor-lang 0.30.1` (already pinned in
  `programs/asset-rental/Cargo.toml`).
- TypeScript client: `@coral-xyz/anchor 0.30.1` (already in `package.json` and
  `node_modules`).
- Solana CLI: keep whatever is installed; the project already uses Agave-era tooling.
- Toolchain install helper: `scripts/install-toolchain.sh` pins
  `SOLANA_VERSION=v1.18.26` and `ANCHOR_VERSION=0.30.1` by default and is the
  canonical “get a fresh machine to the right versions” script.

What changed because of this:
- No SDK/API version changed in the code. The alignment is: the program’s Anchor
  version is anchored to 0.30.1, the JS client is 0.30.1, and everything beyond that
  (on-chain build, IDL generation, TS client that consumes the IDL) needs
  `anchor-cli 0.30.1`.

What is in progress:
- Installing `anchor-cli 0.30.1` via `avm install 0.30.1` in the background. The
  install compiles from source under Rust `1.79.0` and is long-running. Status is
  tracked in `/tmp/avm.log`. Check with:
  `tail -n 20 /tmp/avm.log` and confirm with `anchor --version`.

What still needs updating in docs if this install succeeds:
- `docs/SETUP.md`, `scripts/README.md`, `new_architecture.md`, and any README that
  mentions the toolchain should reflect the working toolchain once `anchor-cli 0.30.1`
  is actually available. Specifically:
  - Confirm `anchor --version` prints `anchor-cli 0.30.1`.
  - Confirm `solana --version` and `rustc --version` are recorded accurately.
  - Remove any “could not run anchor build / IDL generation” limitation note once
    the IDL path is exercised.

## What was verified in earlier work (before this session)

- Program compiles and passes host tests (Point 1 + Point 2 baked in).
- `cargo build-sbf` built the on-chain binary.
- TS clients + tests typecheck clean.
- Docs rewritten (CONTRACT/EXAMPLES/SETUP) with the tables the tasklist asks for.
- Diagrams redrawn and rendered to SVG where PlantUML was available.
- `new_architecture.md` and `new_tasklist.md` moved into `lendersol/`; `../new/`
  removed; README banners cleaned; link check across READMEs passed.
- First git commit made for recoverability before further changes.

## Exact next actions for the next session

1. Check toolchain install: `tail -n 30 /tmp/avm.log` and `anchor --version`.
   If still installing, wait; if failed, re-run `avm install 0.30.1` or use
   `scripts/install-toolchain.sh`.
2. Once `anchor-cli 0.30.1` is on `PATH`, run the Point 3 gate:
   `cargo test -p asset-rental` clean + `anchor build` clean (or `cargo build-sbf`).
3. Run `bash scripts/export-clients.sh` to generate + copy IDL/types.
4. Complete the Point 3 formal validation pass (steps 55-62) as a doc/code reread.
5. Finalize PROGRAM_ID three-place rule and provision the wallet roles (Point 5).
6. Deploy and run `migrations/deploy.ts` (Point 5).
7. Run `anchor test --provider.cluster localnet`, then `devnet` (Point 6).
8. Commit generated clients/idl/types + any fixtures, and record results in
   `docs/SETUP.md`.
9. Update the version/tooling notes in `docs/SETUP.md` and the READMEs to match
   the toolchain that actually worked.
10. If the old-architecture leftovers (`ssh/`, `programs/billing-access/`, stale
    gitignored artifacts) are meant to be removed, do that explicitly and commit;
    otherwise leave them as the current intentionally-kept state.

## Fallback if `anchor-cli 0.30.1` cannot be installed here

If the environment cannot host 0.30.1, the code itself is already in a buildable/
testable state on the Rust side (Point 1 + Point 2 complete, SBF buildable).
The remaining gaps are then:
- IDL + generated TS types (Point 4 tail),
- deploy + wallet setup (Point 5),
- the JS/TS acceptance suite execution (Point 6).

In that case, the next session should either:
- install 0.30.1 on a machine/toolchain that can host it and finish Points 4-6, or
- pin the tooling to a version that can actually install here and reconcile the
  program’s `anchor-lang` pin against that CLI version, then re-verify build + IDL
  + TS typecheck together.

<!-- Keep this log append-only in spirit: when you regenerate it, preserve the
     structure, the tasklist step mapping, and the exact next-action list. -->
