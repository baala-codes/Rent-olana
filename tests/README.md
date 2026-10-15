# Integration tests

Cross-component and end-to-end tests for the asset-rental marketplace. Keep
component-level tests beside each implementation (Rust unit tests in
`programs/asset-rental/src/`); the acceptance suite lives here.

The suite is `tests/asset-rental.ts`, run by Anchor:

```bash
anchor test --provider.cluster localnet   # isolated, throwaway validator
anchor test --provider.cluster devnet     # against the funded deployment
```

## Harness

- `fund()` — airdrop-free funding from the deploy wallet.
- `scenario()` — wraps a case and dumps a pre/post fixture into
  [`../fixtures/`](../fixtures/) (see that folder's README).
- `expectError(code)` — matches an Anchor error; `expectFailure()` for generic
  failures.

Before hook: initialize config (fee 250 bps) and register two listings
(`L1`: price 10_000_000/day, deposit 50_000_000, max_days 30; `L2`: price
5_000_000/day, deposit 0, max_days 5).

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

