# Asset-Rental POC — consolidated progress log

Updated: 2026-10-16
Purpose: the single place to read where this project stands mapped to
`new_tasklist.md` (the 6-point, 94-step build plan). Each section names the exact
tasklist steps, what is done, what is verified, and the exact next command.

This is the only progress log. `new_architecture.md` and `new_tasklist.md` live at
the repository root. Companion file: `pending.md` (blockers + handoff).

## Overall completion

The on-chain program builds, its client contract is published, and the local
validator acceptance suite now runs. What remains is **deploy → initialize →
run on devnet**, which is blocked on a funded devnet wallet set (the public
faucet is exhausted for this machine's IP — see `pending.md` §1).

| Point | Steps | Deliverable status | Est. % |
| --- | --- | --- | --- |
| 1. Scaffold, accounts, errors, constants | 1–22 | Done — all files present | 100% |
| 2. Instructions (11 instructions + helper) | 23–54 | Done — all handlers + events wired | 100% |
| 3. Validation pass | 55–62 | **§62 gate re-run and green**: 7/7 host tests, no program warnings | 100% |
| 4. Publish the shared contract | 63–70 | **§63 done**: IDL + types regenerated and published; three-place ID check passes | 100% |
| 5. Deploy & wallet setup | 71–77 | Anchor.toml/keys/migration in place; **not deployed** (no devnet SOL) | ~65% |
| 6. Acceptance tests | 78–94 | Suite runs on localnet; **devnet run blocked**; fixtures stale | ~90% |
| **Total** | **94** | | **~94% (≈88/94)** |

The remaining work is concentrated entirely in the devnet deploy/run tail.

## Toolchain (installed and verified in this environment)

`rustc 1.86.0-nightly`, `cargo 1.86.0-nightly`, `anchor-cli 0.30.1`,
`solana-cli 1.18.26`, `node v20.19.2`; `node_modules` installed. Use the wrapper
`bash scripts/anchor.sh …` (or `npm run …`) so the IDL build picks the pinned
`nightly-2025-01-15`.

## Point 1 — scaffold, accounts, errors, constants (steps 1–22) — DONE

- `programs/asset-rental/` workspace; root `Cargo.toml` sets
  `[profile.release] overflow-checks = true`; the crate pins
  `anchor-lang = "0.30.1"`.
- `constants.rs`, `state.rs` (`PlatformConfig` LEN 76, `AssetListing` LEN 182,
  `RentalStatus`, `RentalAgreement` LEN 188), `errors.rs` (`RentalError`), each
  with the tasklist seeds and `LEN`/`pda()`.
- `#[cfg(test)]` tests in `state.rs` (Borsh/LEN round-trips, 1-byte enum
  discriminants, status classification, fee rounding, split conservation,
  pointer release).

## Point 2 — instructions (steps 23–54) — DONE

All 11 instructions plus the shared `escrow.rs` helper exist, are registered in
`lib.rs`, and emit their events (config, listing CRUD/status/close, create,
settle, cancel, dispute, resolve, close rental).

## Point 3 — validation pass (steps 55–62) — DONE (re-verified here)

Invariants enforced by construction: treasury/fee only from `PlatformConfig`;
escrow moves only in `settle_rental`/`cancel_rental`/`resolve_dispute`, each
re-deriving the rental PDA; duplicate `rental_id` rejected atomically by `init`;
overlap guard `start_ts >= busy_until`; pointer cleared on every terminal
transition except `Disputed`; `paused` blocks only `create_rental`; all
time/lamport math `checked_*` with `overflow-checks = true`.

§62 gate **re-run in this session**:

- `cargo test -p asset-rental` → **7 passed, 0 failed**.
- clean program rebuild (`cargo clean -p asset-rental` then
  `bash scripts/anchor.sh build`) → **no warnings from the program crate**
  (the only warnings are `anchor-lang` build-script `check-cfg` / incremental
  cache noise, unrelated to our source).

## Point 4 — publish the shared contract (steps 63–70) — DONE

- §63 **done here**: `bash scripts/export-clients.sh` → `anchor build`, then
  copied `target/idl/asset_rental.json` → `clients/idl/` and
  `target/types/asset_rental.ts` → `clients/types/` (both byte-identical to
  `target/`), and the three-place program-ID check passed:
  `lib.rs` = `Anchor.toml` = `clients/ts/constants.ts` =
  `DhbEciuQ2HDMUbQzCRnGWe15cYK9wSav9KgXP42v4DUZ`.
- `clients/ts/{constants,pda,instructions,index}.ts` (steps 64–67),
  `docs/CONTRACT.md` (68), `docs/EXAMPLES.md` (69), and the fixture-dump
  convention in the test suite (70) are all present.

## Point 5 — deploy & wallet setup (steps 71–77) — PARTIAL

Done:
- `Anchor.toml` (step 71): devnet + localnet program IDs, `provider.cluster`,
  `provider.wallet = ".keys/admin.json"`, `test` script.
- `.keys/` present (step 72): `admin`, `treasury`, `owner_a`, `owner_b`,
  `renter`, `program`; `target/deploy/asset_rental-keypair.json` matches
  `.keys/program.json`.
- `migrations/deploy.ts` (step 76 code): idempotent
  `initialize_config(treasury, 250)`; default treasury corrected to the current
  `.keys/treasury.json`.
- `docs/SETUP.md` (step 77): toolchain, wallet-role table, three-place
  program-ID rule, deploy steps, troubleshooting. Program ID and wallet public
  keys corrected to the current values.

Not done (blocked on devnet SOL — see `pending.md` §1):
- Step 73 funding: **no wallet is funded**; the faucet returns
  `429 "reached your airdrop limit today / the faucet has run dry"`.
- Step 75 `anchor deploy --provider.cluster devnet` not run; no deploy tx.
- Step 76 migration not executed on devnet; no config-init tx.
- Step 77 tail: no live devnet register/book/settle with signatures.

Fixes made while preparing the deploy (details in `pending.md` §2):

- `Anchor.toml` `[programs.localnet]` was the stale `9CN7pM6aw…` while
  `declare_id!`/devnet/`constants.ts` were `DhbEciu…` → the entire localnet run
  died with `DeclaredProgramIdMismatch` (4100). Set localnet to `DhbEciu…`.
- `docs/{CONTRACT,EXAMPLES,SETUP}.md` old program ID → `DhbEciu…`.
- `migrations/deploy.ts` stale default treasury → current
  `8tQDkhEo1EdheZyFEV8SZmFWyWhmar14JgSHpTjBfQWr`.
- `docs/SETUP.md` wallet table → current public keys.

## Point 6 — acceptance tests (steps 78–94) — PARTIAL

- The suite (`tests/asset-rental.ts`) implements the full harness and coverage
  list (steps 78–92).
- `anchor test --provider.cluster localnet` (step 93): was **0/15** at session
  start (every run died in the `before` hook on `DeclaredProgramIdMismatch`).
  After the localnet ID fix and two test-harness fixes it is being re-run; see
  the result recorded below.
- Not done: `anchor test --provider.cluster devnet` (step 93), and step 94
  (record device txs in `docs/SETUP.md`, regenerate `fixtures/`, commit
  `clients/idl`, `clients/types`, `fixtures/`).

Test-harness fixes (details in `pending.md` §2f and §3):

- Bookings meant to start "immediately" used `chainNow() + 2`. `create_rental`
  requires `start_ts >= Clock::get()` and the transaction is sent after that
  timestamp is chosen, so a 2-second headroom races the clock and the booking
  reverts with `StartInPast`. Introduced `START_MARGIN` (default 30) and used it
  for the "immediate" bookings; `waitForStart` waits it out.
- The **`replay`** case only tests duplicate-id rejection and the pre-start
  refund, so its booking starts far in the future (`nowTs() + 3_600`) and no
  longer leaves listing `l2` rented when its pre-start `cancel_rental` runs —
  that leftover had cascaded `ListingBusy` into every later `l2` test.
- `settle: owner path` asserted `owner delta == price_total - fee - txFee`, but
  `rpc()` sends with the provider wallet (`admin`) as fee payer, so the owner's
  delta is exactly `price_total - fee`. Removed the phantom `- txFee` and added
  an explicit check that the provider wallet is the one that paid.
- Fixture `cluster` field was hard-coded to the `CLUSTER` constant (`"devnet"`),
  so localnet runs wrote fixtures labelled devnet. Now derived from
  `ANCHOR_PROVIDER_URL` (`localnet`/`devnet`/`mainnet`).

Also note (see `pending.md` §3): Anchor 0.30.1 wraps on-chain failures with the
legacy `new SendTransactionError(message, logs)` signature while
`@solana/web3.js` ≥1.95 expects an object, so the real program logs are
**masked** as `Error: Unknown action 'undefined'`. This hides the true error for
any failing instruction and should be worked around in the harness.

### Localnet result (step 93)

```
(to be filled from the run in flight)
```

## Blockers (short form)

1. **Devnet SOL** — the faucet is exhausted for this IP; deploy and the devnet
   run cannot proceed. Addresses and the exact funding needed are in
   `pending.md` §1.
2. **`Unknown action 'undefined'`** — Anchor/web3.js error-masking bug; hides
   real on-chain errors in the suite (`pending.md` §3).

## Exact next commands (in order)

```bash
# 1. (already green this session)
cargo test -p asset-rental
bash scripts/export-clients.sh

# 2. localnet acceptance suite
bash scripts/anchor.sh test --provider.cluster localnet

# 3. fund devnet wallets (see pending.md §1), then:
bash scripts/anchor.sh deploy --provider.cluster devnet      # runs migrations/deploy.ts
anchor test --provider.cluster devnet

# 4. record the deploy/config-init txs in docs/SETUP.md and commit
#    clients/idl, clients/types, fixtures/
```
