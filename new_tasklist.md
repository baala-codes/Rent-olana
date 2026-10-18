# Asset-Rental — Complete On-Chain Build Plan (LLM-Executable Micro-Instructions)

Each numbered step is a self-contained instruction you can paste directly to a coding
LLM/agent. Do them in order; each builds on the previous. Mirrors the old
`solana-vps` plan; the domain is now the physical-asset rental marketplace described
in `new_architecture.md`.

---

## Point 1 — Scaffold, Accounts, Errors, Constants

### 1.1 Project setup
1. Run `anchor init asset-rental --typescript` and `cd asset-rental`.
2. Create folder `programs/asset-rental/src/instructions/` with empty `.rs` files: `config.rs`, `listing.rs`, `rental.rs`.
3. Create `programs/asset-rental/src/{state.rs, errors.rs, constants.rs, events.rs}` as empty files.
4. In `programs/asset-rental/Cargo.toml`, set `anchor-lang = { version = "0.30.1", features = ["init-if-needed"] }` under `[dependencies]`.
5. Add `overflow-checks = true` under `[profile.release]` in the workspace `Cargo.toml`.
6. Run `anchor build` once to confirm the empty scaffold compiles.

### 1.2 Constants (`constants.rs`)
7. Add `pub const GRACE_SECONDS: i64 = 86_400;`
8. Add `pub const MAX_FEE_BPS: u16 = 1_000;`
9. Add `pub const MAX_DAYS: u16 = 36_500;`
10. Add `pub const SECONDS_PER_DAY: i64 = 86_400;`
11. Add `pub const ASSET_ID_LEN: usize = 32;`, `pub const RENTAL_ID_LEN: usize = 32;`, `pub const METADATA_HASH_LEN: usize = 32;`
12. Add `pub const BASIS_POINTS_DENOMINATOR: u64 = 10_000;`

### 1.3 State (`state.rs`)
13. Add `use anchor_lang::prelude::*;` and `use crate::constants::*;`.
14. Write `#[account] pub struct PlatformConfig { admin: Pubkey, treasury: Pubkey, fee_bps: u16, paused: bool, bump: u8 }` with `SEED_PREFIX: &[u8] = b"config"`, `LEN`, and `pda() -> (Pubkey, u8)` over `&[b"config"]`.
15. Write `#[account] pub struct AssetListing { owner: Pubkey, asset_id: [u8; ASSET_ID_LEN], category: u16, price_per_day: u64, deposit_lamports: u64, max_days: u16, metadata_hash: [u8; METADATA_HASH_LEN], active: bool, current_rental: Pubkey, busy_until: i64, total_rentals: u64, created_at: i64, bump: u8 }` with `SEED_PREFIX = b"asset"`, `LEN`, and `pda(owner, asset_id)` over `[b"asset", owner, asset_id]`.
16. Write `#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)] pub enum RentalStatus { Reserved, Active, Completed, Cancelled, Disputed, Resolved }`.
17. Write `#[account] pub struct RentalAgreement { listing: Pubkey, owner: Pubkey, renter: Pubkey, rental_id: [u8; RENTAL_ID_LEN], start_ts: i64, end_ts: i64, days: u16, price_total: u64, deposit_lamports: u64, escrow_lamports: u64, status: RentalStatus, created_at: i64, bump: u8 }` with `SEED_PREFIX = b"rental"`, `LEN`, and `pda(listing, rental_id)` over `[b"rental", listing, rental_id]`.
18. Add a `#[cfg(test)] mod tests` that round-trips each account through Borsh and asserts `LEN == 8 + body.len()`, plus asserts `RentalStatus` serializes to 1 byte for every variant (port from the old `state.rs` tests).
19. Add `mod constants; mod errors; mod events; mod state; mod instructions;` plus `pub use` globs to `lib.rs`; run `anchor build`.

### 1.4 Errors (`errors.rs`)
20. Add `use anchor_lang::prelude::*;`.
21. Create `#[error_code] pub enum RentalError` with `#[msg(...)]` on each variant: `InvalidPrice`, `InvalidDeposit`, `InvalidDuration`, `InvalidCategory`, `ListingNotActive`, `PlatformPaused`, `RenterIsOwner`, `StartInPast`, `ListingBusy`, `RentalIdReused`, `NotListingOwner`, `NotRentalParty`, `InvalidStatus`, `CancelTooLate`, `FeeTooHigh`, `TimeOverflow`, `InvalidPda`, `TreasuryMismatch`, `AmountOverflow`, `DisputeInProgress`, `Unauthorized`, `ListingRentalOpen`.
22. Run `anchor build`.

## Point 2 — Instructions

### 2.1 Config (`config.rs`)
23. Write `#[derive(Accounts)] pub struct InitializeConfig<'info>`: `admin: Signer<'info>` (mut), `config: Account<'info, PlatformConfig>` (`init`, payer = admin, seeds `[b"config"]`, bump, space = `PlatformConfig::LEN`), `treasury: UncheckedAccount<'info>`, `system_program`.
24. Write `initialize_config_handler(ctx, treasury: Pubkey, fee_bps: u16)`: `require!(fee_bps <= MAX_FEE_BPS, FeeTooHigh)`; populate all fields; `paused = false`.
25. Write `SetConfig<'info>`: `admin: Signer<'info>`, `config: Account<PlatformConfig>` (mut, `has_one = admin`, seeds re-derived with stored bump).
26. Write `set_config_handler(ctx, treasury: Option<Pubkey>, fee_bps: Option<u16>, paused: Option<bool>)`: apply `Some` values only; re-check fee cap; touch nothing else.
27. Register both in `lib.rs`; build.

### 2.2 Listing (`listing.rs`)
28. Write `RegisterAsset<'info>`: `owner: Signer<'info>` (mut), `listing: Account<AssetListing>` (`init`, payer = owner, seeds `[b"asset", owner.key(), asset_id]`, bump, space = `AssetListing::LEN`), `system_program`.
29. Write `register_asset_handler(ctx, asset_id, category, price_per_day, deposit_lamports, max_days, metadata_hash)`: require `price_per_day > 0 @ InvalidPrice`, `max_days >= 1 && max_days <= MAX_DAYS @ InvalidDuration`; set `active = true`, `current_rental = Pubkey::default()`, `busy_until = 0`, `total_rentals = 0`, `created_at = Clock::get()?.unix_timestamp`.
30. Write `UpdateAsset<'info>`: `owner: Signer<'info>`, `listing` (mut, `has_one = owner`, seeds re-derived with stored bump).
31. Write `update_asset_handler(...)`: if price/deposit/max_days change, require `listing.current_rental == Pubkey::default() @ ListingRentalOpen`; re-validate bounds; always allow metadata/category updates.
32. Write `SetListingStatus<'info>`: same accounts as `UpdateAsset`; handler flips `active`.
33. Write `CloseListing<'info>`: `owner: Signer<'info>`, `listing` (`close`, `has_one = owner`, seeds re-derived); handler requires `current_rental == Pubkey::default() @ ListingRentalOpen` (the `close` attribute returns rent to `owner`).
34. Register in `lib.rs`; build.

### 2.3 Rental (`rental.rs`) — the core
35. Write `CreateRental<'info>`: `renter: Signer<'info>` (mut), `config: Account<PlatformConfig>` (seeds `[b"config"]`, constraint `!config.paused @ PlatformPaused`), `listing: Account<AssetListing>` (mut, seeds re-derived with stored bump, constraint `listing.active @ ListingNotActive`), `rental: Account<RentalAgreement>` (**`init`**, payer = renter, seeds `[b"rental", listing.key(), rental_id]`, bump, space = `RentalAgreement::LEN`), `system_program`.
36. Write `create_rental_handler(ctx, rental_id, start_ts, days)`: require `ctx.accounts.renter.key() != listing.owner @ RenterIsOwner`; require `days >= 1 && days <= listing.max_days @ InvalidDuration`; `now = Clock::get()?.unix_timestamp`; require `start_ts >= now @ StartInPast` and `start_ts >= listing.busy_until @ ListingBusy`; compute `price_total = listing.price_per_day.checked_mul(days as u64).ok_or(AmountOverflow)?`; `day_span = (days as i64).checked_mul(SECONDS_PER_DAY).ok_or(TimeOverflow)?`; `end_ts = start_ts.checked_add(day_span).ok_or(TimeOverflow)?`.
37. In the same handler, `system_program::transfer(CpiContext::new(...), price_total + deposit_lamports)` from renter into the rental PDA; set `escrow_lamports = price_total + deposit_lamports`; populate all rental fields with `status = RentalStatus::Reserved`; set `listing.current_rental = rental.key()` and `listing.busy_until = end_ts`; `emit!(RentalCreated {..})`.
38. Write `SettleRental<'info>`: `caller: Signer<'info>`, `config` (seeds `[b"config"]`, constraint `config.treasury == platform_treasury.key() @ TreasuryMismatch`), `listing` (mut, seeds re-derived), `rental` (mut, `has_one = listing`, seeds re-derived with stored bump, constraint `rental.status == Reserved || rental.status == Active @ InvalidStatus`), `owner_wallet: UncheckedAccount<'info>` (mut), `platform_treasury: UncheckedAccount<'info>` (mut), `renter_wallet: UncheckedAccount<'info>` (mut), `system_program`.
39. Write `settle_rental_handler(ctx)`: compute gate — `is_owner = caller.key() == rental.owner`; require `(is_owner && now >= rental.start_ts) || now >= rental.end_ts + GRACE_SECONDS @ InvalidStatus` (document the two gates in a comment); compute `fee = rental.price_total.checked_mul(config.fee_bps as u64).ok_or(AmountOverflow)?.checked_div(BASIS_POINTS_DENOMINATOR).ok_or(AmountOverflow)?`; `owner_amount = rental.price_total - fee`.
40. In the same handler, transfer from the rental PDA via `system_program::transfer(CpiContext::new_with_signer(system_program, Transfer { from: rental.to_account_info(), to: ... }, &[&[b"rental", listing.key().as_ref(), rental.rental_id.as_ref(), &[rental.bump]]])), ...)` three times: `owner_amount` → `owner_wallet`, `fee` → `platform_treasury`, `rental.deposit_lamports` → `renter_wallet`; set `rental.escrow_lamports = 0`, `status = Completed`; clear `listing.current_rental` and `listing.busy_until`, increment `listing.total_rentals`; `emit!(RentalSettled {..})`.
41. Write `CancelRental<'info>`: `party: Signer<'info>`, `listing` (mut, seeds re-derived), `rental` (mut, `has_one = listing`, seeds re-derived, constraint `status == Reserved @ InvalidStatus`), `renter_wallet: UncheckedAccount<'info>` (mut), `system_program`; constraint `party.key() == rental.owner || party.key() == rental.renter @ NotRentalParty`.
42. Write `cancel_rental_handler(ctx)`: require `now < rental.start_ts @ CancelTooLate`; PDA-signed transfer of full `escrow_lamports` to `renter_wallet`; set `status = Cancelled`, `escrow_lamports = 0`; clear listing pointer (do not increment `total_rentals`); `emit!(RentalCancelled {..})`.
43. Write `RaiseDispute<'info>`: same accounts and party constraint as `CancelRental` minus the treasury; constraint `status == Reserved || status == Active @ InvalidStatus`.
44. Write `raise_dispute_handler(ctx)`: set `status = Disputed`; `emit!(RentalDisputed {..})`.
45. Write `ResolveDispute<'info>`: `admin: Signer<'info>`, `config` (`has_one = admin`), `listing` (mut, seeds re-derived), `rental` (mut, `has_one = listing`, seeds re-derived, constraint `status == Disputed @ InvalidStatus`), `owner_wallet: UncheckedAccount<'info>` (mut), `renter_wallet: UncheckedAccount<'info>` (mut), `system_program`.
46. Write `resolve_dispute_handler(ctx, owner_share_bps: u16)`: require `owner_share_bps <= BASIS_POINTS_DENOMINATOR as u16 @ FeeTooHigh`; `owner_amount = escrow * owner_share_bps / 10_000` (checked), `renter_amount = escrow - owner_amount`; PDA-signed transfers; `status = Resolved`, `escrow_lamports = 0`; clear pointer; `emit!(RentalResolved {..})`.
47. Write `CloseRental<'info>`: `rental` (`close` with `close = renter_wallet`, seeds re-derived), `renter_wallet: UncheckedAccount<'info>` (mut); constraint `status` is terminal (`Completed | Cancelled | Resolved`).
48. Register all rental instructions in `lib.rs`; run `anchor build`.

### 2.4 Events (`events.rs`)
49. Write `#[event] pub struct RentalCreated { listing: Pubkey, rental: Pubkey, owner: Pubkey, renter: Pubkey, start_ts: i64, end_ts: i64, price_total: u64, deposit_lamports: u64 }`.
50. Write `#[event] pub struct RentalSettled { rental: Pubkey, owner_amount: u64, fee: u64, deposit_refund: u64 }`.
51. Write `#[event] pub struct RentalCancelled { rental: Pubkey, refund: u64 }`.
52. Write `#[event] pub struct RentalDisputed { rental: Pubkey, by: Pubkey }`.
53. Write `#[event] pub struct RentalResolved { rental: Pubkey, owner_amount: u64, renter_amount: u64 }`.
54. Emit each at its transition (already wired in steps 37/40/42/44/46); build.

## Point 3 — Validation pass
55. Re-read every instruction and confirm the platform treasury comes from `config.treasury` only — no client-passed override. Fix if not.
56. Confirm escrow moves only in `settle_rental`, `cancel_rental`, and `resolve_dispute`; each re-derives the rental PDA and checks status; there is no admin sweep.
57. Confirm duplicate `rental_id` rejection is enforced only by `init` on the rental PDA. Add a doc comment noting this is the atomic duplicate-charge/replay guard, and that the runtime surfaces it as an account-already-in-use error rather than `RentalError::RentalIdReused` (reserved alias).
58. Confirm the overlap guard (`start_ts >= busy_until`) and pointer clearing on every terminal transition (Completed, Cancelled, Resolved — not Disputed).
59. Confirm `paused` blocks only `create_rental`; settle/cancel/dispute still work while paused.
60. Confirm every time/lamport computation uses `checked_*` and `overflow-checks = true` is set.
61. Confirm listing price/deposit/max_days are immutable while `current_rental` is set.
62. Run `anchor build` clean (zero warnings) and `cargo test` (LEN/Borsh tests green).

## Point 4 — Publish the Shared Contract
63. Run `anchor build`; copy `target/idl/asset_rental.json` and `target/types/asset_rental.ts` into `clients/idl/` and `clients/types/` via a ported `scripts/export-clients.sh`.
64. Create `clients/ts/constants.ts`: `PROGRAM_ID`, `CLUSTER`, `RPC_URL`, seed prefixes (`config`/`asset`/`rental`), `ACCOUNT_LEN` table, `RENTAL_STATUS` discriminants, `RENTAL_ERRORS` code table (base 6000, append-only), `GRACE_SECONDS`, `MAX_FEE_BPS`, `SECONDS_PER_DAY`.
65. Create `clients/ts/pda.ts`: `configPda()`, `listingPda(owner, assetId)`, `rentalPda(listing, rentalId)` with `toBytes32` length checks; byte-for-byte identical to `state.rs` seeds.
66. Create `clients/ts/instructions.ts`: `newAssetId()` and `newRentalId()` (32 random bytes via `crypto.randomBytes`, persist-before-submit) and builders for all 12 instructions, deriving every PDA internally (mirror the old file's structure).
67. Create `clients/ts/index.ts` barrel export.
68. Write `docs/CONTRACT.md`: program ID, cluster, byte-offset tables per account, seed byte tables, instruction table with discriminators and account lists, error table, read-side rules for the backend mirror, and a deliberate-deviations table.
69. Write `docs/EXAMPLES.md`: one worked example per instruction with ordered account lists.
70. Port the fixture-dump convention from the old test suite (`scenario()` + `recordFixture()` into `fixtures/<scenario>.json`).

## Point 5 — Deploy & Wallet Setup
71. Set `Anchor.toml`: `[programs.devnet] asset_rental = "<program-id>"`, `provider.cluster = "devnet"`, `provider.wallet = ".keys/admin.json"`, and the `test` script pointing at `tests/asset-rental.ts`.
72. Reuse `.keys/`: keep `treasury.json`; add `admin.json`, `owner_a.json`, `owner_b.json`, `renter.json`, `program.json` (via `scripts/gen-keypairs.py` or `solana-keygen`).
73. Airdrop 2 SOL each to admin, owner_a, owner_b, renter; treasury receives only.
74. `mkdir -p target/deploy && cp .keys/program.json target/deploy/asset_rental-keypair.json && anchor keys sync`; then set `PROGRAM_ID` in `clients/ts/constants.ts` to the same value (the three-place rule: `declare_id!`, `Anchor.toml`, `constants.ts`).
75. Run `anchor deploy --provider.cluster devnet`; verify with `solana program show <id> --url devnet`.
76. Implement `migrations/deploy.ts`: call `initialize_config(treasury, 250)` signed by the admin wallet.
77. Write `docs/SETUP.md`: toolchain, wallet roles table, the three-place program-ID rule, deploy steps, and one real `register_asset` + `create_rental` + `settle_rental` on devnet with recorded signatures into `fixtures/`.

## Point 6 — Tests (`tests/asset-rental.ts`)
78. Port the harness from the old suite: `fund()` from the deploy wallet (no faucet dependence), `scenario()` with pre/post fixture dump, `expectError(code)` matching `AnchorError`, `expectFailure()`.
79. Before-hook: initialize config (fee 250 bps); register L1 (price 10_000_000/day, deposit 50_000_000, max_days 30) and L2 (price 5_000_000/day, deposit 0, max_days 5); fund owner_a, owner_b, renter.
80. **Register test:** listing fields exact; `active = true`, `busy_until = 0`, `current_rental = default`.
81. **Update auth test:** non-owner `update_asset` → `NotListingOwner`; price change while a rental is open → `ListingRentalOpen`.
82. **Create test:** rental PDA balance == `price_total + deposit + rent_min`; `escrow_lamports` correct; `busy_until == end_ts`; pointer set; event emitted.
83. **Overlap test:** second `create_rental` with `start_ts < busy_until` → `ListingBusy`; assert all balances and state unchanged.
84. **Replay test:** reuse the same `rental_id` → runtime init failure (alias `RentalIdReused`); assert no second charge reached any account.
85. **Rejection matrix (each leaves balances + state unchanged):** renter == owner (`RenterIsOwner`); `start_ts` in past (`StartInPast`); `days = 0` and `days > max_days` (`InvalidDuration`); `price_per_day = 0` at register (`InvalidPrice`); paused platform (`PlatformPaused`); substituted platform treasury (`TreasuryMismatch`); non-owner `settle_rental` before `start_ts` (gate fail); insufficient renter funds (generic failure, no escrow, no pointer).
86. **Cancel test:** pre-start cancel by renter and by owner → full refund to renter, pointer cleared, `Cancelled`; post-start cancel → `CancelTooLate`.
87. **Settle (owner path) test:** to-the-lamport split — owner gets `price_total - fee`, treasury gets `fee`, renter gets deposit; `escrow_lamports = 0`; pointer cleared; `total_rentals == 1`; settle again → `InvalidStatus`.
88. **Settle (timeout gate) test:** assert permissionless settle before `end_ts + GRACE_SECONDS` fails and owner settle before `start_ts` fails (document the after-grace happy path as a localnet-only scenario or via the dispute/cancel coverage on devnet).
89. **Dispute tests:** raise by owner and by renter; while `Disputed`, `settle_rental` → `InvalidStatus` and `cancel_rental` → `InvalidStatus`; non-admin `resolve_dispute` → `Unauthorized`; admin `resolve_dispute(5000)` → exact 50/50 split; pointer cleared.
90. **Pause test:** `set_config(paused = true)` blocks `create_rental`; an existing rental still settles; unpause.
91. **Close tests:** `close_listing` with an open rental fails; `close_rental` on a terminal rental returns rent to the renter.
92. **Invariant fuzz:** 20 randomized create/settle/cancel/dispute sequences across two listings; assert per-rental `Σ(out) == escrow_in` and that no two open rentals ever share a listing.
93. Run `anchor test --provider.cluster localnet` — all green; then `--provider.cluster devnet` — all green.
94. Commit regenerated `clients/idl`, `clients/types`, and `fixtures/`; record program ID, deployment tx, and config-init tx in `docs/SETUP.md`.

---

**Sequencing note:** Points 1–3 are strictly serial. Point 4 can start once Point 2 compiles. Point 5 depends on Point 3. Point 6 depends on Point 4 (uses the TS helpers and constants).
