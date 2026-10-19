# Transaction examples

**Companion to [`docs/CONTRACT.md`](CONTRACT.md)**

One worked example per instruction: the arguments, the exact account list in
declaration order, and what changes on chain. Examples use the helpers in
[`clients/ts/`](../clients/ts/), which derive every PDA for you.

Program ID used below: `Ge4Z9acYsYxSj8UsVo1W3yMroEbonZBUshUW2wGgNaCg` (devnet).
`admin`, `owner`, and `renter` are wallets; `treasury` only receives.

## 0. Setup shared by every example

```ts
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  PROGRAM_ID,
  RPC_URL,
  configPda,
  listingPda,
  rentalPda,
  newAssetId,
  newRentalId,
  initializeConfig,
  setConfig,
  registerAsset,
  updateAsset,
  setListingStatus,
  closeListing,
  createRental,
  settleRental,
  cancelRental,
  raiseDispute,
  resolveDispute,
  closeRental,
} from "../clients/ts";

const connection = new Connection(RPC_URL, "finalized");
const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "finalized" });
anchor.setProvider(provider);
const program = new anchor.Program(
  require("../target/idl/asset_rental.json"),
  provider
);
```

The `asset_id` is a stable, random 32-byte value chosen at registration; the
`rental_id` is a fresh 32-byte value **persisted before signing**:

```ts
const assetId = newAssetId(); // persist with the off-chain listing document
const rentalId = newRentalId(); // persist before create_rental
```

## 1. `initialize_config` — admin creates the platform config

```ts
const { config, signature } = await initializeConfig(program, {
  admin: admin.publicKey,
  treasury: treasury.publicKey,
  feeBps: 250, // 2.5%
  signers: [admin],
});
```

| # | Account | Signer | Writable | Address |
| --- | --- | --- | --- | --- |
| 0 | `admin` | yes | yes | admin wallet |
| 1 | `config` | no | yes | `configPda()` (`init`) |
| 2 | `system_program` | no | no | `11111111111111111111111111111111` |

Result: `PlatformConfig` created with `fee_bps = 250`, `paused = false`.
Callable once. `fee_bps > 1000` fails with `FeeTooHigh`; the default treasury
fails with `InvalidTreasury`.

## 2. `set_config` — admin updates treasury, fee, and/or pause

```ts
await setConfig(program, {
  admin: admin.publicKey,
  feeBps: 300,
  paused: true,
  signers: [admin],
});
```

| # | Account | Signer | Writable | Address |
| --- | --- | --- | --- | --- |
| 0 | `admin` | yes | no | must equal `PlatformConfig.admin` |
| 1 | `config` | no | yes | `configPda()` |

Only the fields you pass change. `paused` blocks `create_rental`; it never blocks
settlement, cancellation, or dispute resolution.

## 3. `register_asset` — owner lists an asset

```ts
const metadataHash = computeMetadataHash(listingDocument); // 32 bytes
const { listing, signature } = await registerAsset(program, {
  owner: owner.publicKey,
  assetId,
  category: 1,
  pricePerDay: new BN(5_000_000),  // 0.005 SOL/day
  deposit: new BN(10_000_000),     // 0.01 SOL
  maxDays: 30,
  metadataHash,
  signers: [owner],
});
```

| # | Account | Signer | Writable | Address |
| --- | --- | --- | --- | --- |
| 0 | `owner` | yes | yes | owner wallet |
| 1 | `listing` | no | yes | `listingPda(owner, assetId)` (`init`) |
| 2 | `system_program` | no | no | `11111111111111111111111111111111` |

Result: `AssetListing` created with `active = true`, `current_rental = default`,
`busy_until = 0`, `total_rentals = 0`. `price_per_day = 0` fails with
`InvalidPrice`; `max_days` outside `[1, 36500]` fails with `InvalidDuration`.

## 4. `update_asset` — owner edits terms

```ts
await updateAsset(program, {
  owner: owner.publicKey,
  listing,
  pricePerDay: new BN(12_000_000),
  signers: [owner],
});
```

| # | Account | Signer | Writable | Address |
| --- | --- | --- | --- | --- |
| 0 | `owner` | yes | no | must equal `AssetListing.owner` |
| 1 | `listing` | no | yes | `listingPda(owner, assetId)` |

Only the fields you pass change. Price, deposit, and max days are rejected while
a rental holds the listing (`InvalidStatus`); `category` and `metadata_hash`
always change.

## 5. `set_listing_status` — owner activates/deactivates a listing

```ts
await setListingStatus(program, { owner: owner.publicKey, listing, active: false, signers: [owner] });
```

| # | Account | Signer | Writable | Address |
| --- | --- | --- | --- | --- |
| 0 | `owner` | yes | no | must equal `AssetListing.owner` |
| 1 | `listing` | no | yes | `listingPda(owner, assetId)` |

Deactivating blocks new bookings; open rentals are unaffected.

## 6. `close_listing` — owner reclaims an unrented listing

```ts
await closeListing(program, { owner: owner.publicKey, listing, signers: [owner] });
```

| # | Account | Signer | Writable | Address |
| --- | --- | --- | --- | --- |
| 0 | `owner` | yes | yes | receives the reclaimed rent |
| 1 | `listing` | no | yes | `listingPda(owner, assetId)` (`close`) |

Fails with `InvalidStatus` while a rental (including a disputed one) holds the
listing.

## 7. `create_rental` — renter books and escrows

```ts
const startTs = new BN(Math.floor(Date.now() / 1000) + 3600);
const { rental, signature } = await createRental(program, {
  renter: renter.publicKey,
  listing,
  rentalId,
  startTs,
  days: 3,
  signers: [renter],
});
```

| # | Account | Signer | Writable | Address |
| --- | --- | --- | --- | --- |
| 0 | `renter` | yes | yes | renter wallet (pays escrow + rent) |
| 1 | `config` | no | no | `configPda()`; must not be paused |
| 2 | `listing` | no | yes | `listingPda(owner, assetId)`; must be active |
| 3 | `rental` | no | yes | `rentalPda(listing, rentalId)` (`init`) |
| 4 | `system_program` | no | no | `11111111111111111111111111111111` |

Result: `price_total = price_per_day * days`, `end_ts = start_ts + days * 86400`,
and `escrow = price_total + deposit` moves from the renter into the rental PDA in
the same transaction. `escrow_lamports == escrow`, `status = Reserved`, and the
listing records `current_rental = rental`, `busy_until = end_ts`. Rejections:
paused (`PlatformPaused`), inactive listing (`ListingNotActive`), self-rental
(`RenterIsOwner`), bad duration (`InvalidDuration`), past start (`StartInPast`),
overlap (`ListingBusy`).

A second `create_rental` reusing the same `rentalId` fails at account creation
and rolls back — see `docs/CONTRACT.md` §5.

## 8. `settle_rental` — release escrow

```ts
await settleRental(program, {
  caller: owner.publicKey,          // owner gate, or any wallet after end + grace
  listing,
  rental,
  ownerWallet: owner.publicKey,
  platformTreasury: treasury.publicKey,
  renterWallet: renter.publicKey,
  signers: [owner],
});
```

| # | Account | Signer | Writable | Address |
| --- | --- | --- | --- | --- |
| 0 | `caller` | yes | no | owner (`now >= start_ts`) or anyone (`now >= end_ts + GRACE_SECONDS`) |
| 1 | `config` | no | no | `configPda()` |
| 2 | `listing` | no | yes | `listingPda(owner, assetId)` |
| 3 | `rental` | no | yes | `rentalPda(listing, rentalId)`; status open |
| 4 | `owner_wallet` | no | yes | bound to `rental.owner` |
| 5 | `platform_treasury` | no | yes | bound to `config.treasury` |
| 6 | `renter_wallet` | no | yes | bound to `rental.renter` |
| 7 | `system_program` | no | no | `11111111111111111111111111111111` |

Result: `price_total - fee` → owner, `fee` → treasury, `deposit` → renter;
`escrow_lamports = 0`, `status = Completed`; the listing pointer is cleared and
`total_rentals` incremented. A substituted treasury fails with `TreasuryMismatch`
before any split.

## 9. `cancel_rental` — either party refunds before start

```ts
await cancelRental(program, {
  party: renter.publicKey,   // or the owner
  listing,
  rental,
  renterWallet: renter.publicKey,
  signers: [renter],
});
```

| # | Account | Signer | Writable | Address |
| --- | --- | --- | --- | --- |
| 0 | `party` | yes | no | must be `rental.owner` or `rental.renter` |
| 1 | `listing` | no | yes | `listingPda(owner, assetId)` |
| 2 | `rental` | no | yes | `rentalPda(listing, rentalId)`; status `Reserved` |
| 3 | `renter_wallet` | no | yes | bound to `rental.renter` |
| 4 | `system_program` | no | no | `11111111111111111111111111111111` |

Result: the full escrow is refunded to the renter, `status = Cancelled`, and the
listing pointer is cleared. Post-start cancellation fails with `CancelTooLate`.

## 10. `raise_dispute` — either party freezes escrow

```ts
await raiseDispute(program, { party: renter.publicKey, listing, rental, signers: [renter] });
```

| # | Account | Signer | Writable | Address |
| --- | --- | --- | --- | --- |
| 0 | `party` | yes | no | must be `rental.owner` or `rental.renter` |
| 1 | `listing` | no | no | `listingPda(owner, assetId)` |
| 2 | `rental` | no | yes | `rentalPda(listing, rentalId)`; status open |

Result: `status = Disputed`. `settle_rental` and `cancel_rental` now fail with
`InvalidStatus` until the admin resolves.

## 11. `resolve_dispute` — admin splits the frozen escrow

```ts
await resolveDispute(program, {
  admin: admin.publicKey,
  listing,
  rental,
  ownerWallet: owner.publicKey,
  renterWallet: renter.publicKey,
  ownerShareBps: 5_000, // 50/50
  signers: [admin],
});
```

| # | Account | Signer | Writable | Address |
| --- | --- | --- | --- | --- |
| 0 | `admin` | yes | no | must equal `PlatformConfig.admin` |
| 1 | `config` | no | no | `configPda()` |
| 2 | `listing` | no | yes | `listingPda(owner, assetId)` |
| 3 | `rental` | no | yes | `rentalPda(listing, rentalId)`; status `Disputed` |
| 4 | `owner_wallet` | no | yes | bound to `rental.owner` |
| 5 | `renter_wallet` | no | yes | bound to `rental.renter` |
| 6 | `system_program` | no | no | `11111111111111111111111111111111` |

Result: `escrow * owner_share_bps / 10_000` → owner, the remainder → renter;
`status = Resolved`, `escrow_lamports = 0`, listing pointer cleared. A non-admin
signer fails with `Unauthorized`; `owner_share_bps > 10000` fails with
`InvalidShare`.

## 12. `close_rental` — reclaim a terminated rental's rent

```ts
await closeRental(program, { rental, renterWallet: renter.publicKey });
```

| # | Account | Signer | Writable | Address |
| --- | --- | --- | --- | --- |
| 0 | `rental` | no | yes | `rentalPda(listing, rentalId)` (`close`); terminal status |
| 1 | `renter_wallet` | no | yes | bound to `rental.renter`; receives the rent |

Permissionless: the destination is fixed to the renter, so any caller is safe.
Fails with `InvalidStatus` while the rental is open or disputed.
