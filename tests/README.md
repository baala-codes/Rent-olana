# Integration tests

Cross-component and end-to-end tests for the asset-rental marketplace. Keep
component-level tests beside each implementation (Rust unit tests in
`programs/asset-rental/src/`); the acceptance suite lives here.

Two suites live here:

- `tests/asset-rental.ts` — the Anchor acceptance suite (validator required).
- `tests/contract.test.ts` — encoding, decoder, and error-parsing tests that run
  without a validator (`npm run test:client`).

```bash
anchor test --provider.cluster localnet   # isolated, throwaway validator
anchor test --provider.cluster devnet     # against the funded deployment
npm run test:client                       # no validator, no network
```

Use Node 22 LTS for the Anchor suite: `ts-mocha` does not run on Node 26. The
validator-free suite uses `tsx` and works on both.

## Harness

- `fund()` — airdrop-free funding from the deploy wallet.
- `scenario()` — wraps a case and dumps a pre/post fixture into
  [`../fixtures/`](../fixtures/) (see that folder's README).
- `expectError(code)` — decodes the program error through
  `parseProgramError` (never `error.message`, which Anchor/web3.js can mask as
  `Unknown action 'undefined'`) and fails with the program logs attached;
  `expectFailure()` for generic failures.
- `bookStartingSoon()` — books a near-future start and retries only on
  `StartInPast`, reusing the same `rental_id`; there is no fixed start margin.

Before hook: initialize config (fee 250 bps), fund each role wallet with **0.05
SOL**, and register two demo listings (`L1`: price 5_000_000/day = 0.005 SOL,
deposit 10_000_000 = 0.01 SOL, max_days 30; `L2`: price 2_500_000/day = 0.0025
SOL, deposit 0, max_days 5). L1's most expensive case, a 3-day booking, escrows
0.025 SOL — comfortably inside the 0.05 SOL per-wallet budget. After each case
(and inside the fuzz loop) the harness closes terminal rentals, returning their
rent-exempt lamports to the renter so the same budget is reused.

## Coverage

- **Register / update / close:** exact listing fields; non-owner updates
  rejected; terms frozen while a rental is open.
- **Booking:** the escrow PDA holds exactly `price_total + deposit`;
  `busy_until == end_ts`; pointer set.
- **Overlap and replay:** a second booking inside the window is rejected with
  `ListingBusy`; a reused `rental_id` fails account creation with no double
  charge.
- **Rejection matrix:** each adversarial case asserts state and balances are
  unchanged (`RenterIsOwner`, `StartInPast`, `InvalidDuration`, `InvalidPrice`,
  `PlatformPaused`, `TreasuryMismatch`, non-owner early settle, insufficient
  funds).
- **Settlement:** to-the-lamport three-way split (owner `price_total - fee`,
  treasury `fee`, renter deposit); the owner gate and the permissionless
  `end + grace` gate both work; settling twice fails.
- **Cancellation:** pre-start full refund by either party; post-start cancel
  denied.
- **Dispute:** freeze blocks settle and cancel; non-admin resolution denied; the
  admin split is exact; pointer cleared.
- **Config:** non-admin `set_config` rejected; fee above `MAX_FEE_BPS`
  rejected without changing the stored config.
- **Pause:** new rentals blocked while paused; existing rentals still settle and
  refund.
- **Close:** `close_listing` with an open rental fails; `close_rental` returns
  rent to the renter.
- **Invariant fuzz:** randomized create/settle/cancel/dispute sequences across
  two listings assert per-rental `Σ(out) == escrow_in` and single occupancy.

## Records

Record the cluster, program ID, transaction signatures, and rental/listing IDs,
and the expected vs actual outcome per run. Use shared non-secret fixtures from
[../fixtures/](../fixtures/) and [../shared/](../shared/).

See [`new_architecture.md`](../new_architecture.md) §11 (testing)
and §12 (acceptance scenarios).

