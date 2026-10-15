import { Buffer } from "buffer";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  type AccountMeta,
} from "@solana/web3.js";

import { IX_DISC, PROGRAM_ID, type InstructionName } from "./constants";
import { Writer, concatBytes, hexToBytes } from "./codec";
import { configPda, listingPda, rentalPda, toBytes, type Bytes32 } from "./pda";

/**
 * Instruction builders.
 *
 * There is no generated IDL in the browser bundle, so each builder writes the
 * Anchor discriminator followed by Borsh-encoded arguments and lists accounts
 * in the exact declaration order of the `#[derive(Accounts)]` struct. The
 * account order and writability flags match `docs/EXAMPLES.md`.
 */

function programInstruction(
  name: InstructionName,
  keys: AccountMeta[],
  data: Uint8Array
): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data: Buffer.from(concatBytes(hexToBytes(IX_DISC[name]), data)),
  });
}

const meta = (
  pubkey: PublicKey,
  isSigner = false,
  isWritable = false
): AccountMeta => ({ pubkey, isSigner, isWritable });

const system = (): AccountMeta => meta(SystemProgram.programId, false, false);

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** `initialize_config(treasury, fee_bps)` — admin only, once. */
export function ixInitializeConfig(
  admin: PublicKey,
  treasury: PublicKey,
  feeBps: number
): TransactionInstruction {
  const data = new Writer().pubkey(treasury).u16(feeBps).build();
  return programInstruction(
    "initialize_config",
    [meta(admin, true, true), meta(configPda(), false, true), system()],
    data
  );
}

/** `set_config(treasury?, fee_bps?, paused?)` — admin only. */
export function ixSetConfig(
  admin: PublicKey,
  changes: { treasury?: PublicKey; feeBps?: number; paused?: boolean }
): TransactionInstruction {
  const writer = new Writer()
    .option("pubkey", changes.treasury)
    .option("u16", changes.feeBps);
  if (changes.paused === undefined) {
    writer.u8(0);
  } else {
    writer.u8(1).bool(changes.paused);
  }
  return programInstruction(
    "set_config",
    [meta(admin, true), meta(configPda(), false, true)],
    writer.build()
  );
}

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------

export interface RegisterAssetArgs {
  assetId: Bytes32;
  category: number;
  pricePerDay: bigint | number;
  deposit: bigint | number;
  maxDays: number;
  metadataHash: Bytes32;
}

/** `register_asset(...)` — owner only. */
export function ixRegisterAsset(
  owner: PublicKey,
  args: RegisterAssetArgs
): TransactionInstruction {
  const assetId = toBytes(args.assetId, "assetId");
  const metadataHash = toBytes(args.metadataHash, "metadataHash");
  const data = new Writer()
    .bytes(assetId)
    .u16(args.category)
    .u64(args.pricePerDay)
    .u64(args.deposit)
    .u16(args.maxDays)
    .bytes(metadataHash)
    .build();
  return programInstruction(
    "register_asset",
    [meta(owner, true, true), meta(listingPda(owner, assetId), false, true), system()],
    data
  );
}

export interface UpdateAssetArgs {
  pricePerDay?: bigint | number;
  deposit?: bigint | number;
  maxDays?: number;
  category?: number;
  metadataHash?: Bytes32;
}

/** `update_asset(...)` — owner only; economic terms frozen while rented. */
export function ixUpdateAsset(
  owner: PublicKey,
  listing: PublicKey,
  args: UpdateAssetArgs
): TransactionInstruction {
  const data = new Writer()
    .option("u64", args.pricePerDay)
    .option("u64", args.deposit)
    .option("u16", args.maxDays)
    .option("u16", args.category)
    .option(
      "bytes",
      args.metadataHash === undefined ? undefined : toBytes(args.metadataHash, "metadataHash")
    )
    .build();
  return programInstruction(
    "update_asset",
    [meta(owner, true), meta(listing, false, true)],
    data
  );
}

/** `set_listing_status(active)` — owner only. */
export function ixSetListingStatus(
  owner: PublicKey,
  listing: PublicKey,
  active: boolean
): TransactionInstruction {
  const data = new Writer().bool(active).build();
  return programInstruction(
    "set_listing_status",
    [meta(owner, true), meta(listing, false, true)],
    data
  );
}

/** `close_listing()` — owner only; reclaims rent when no rental is open. */
export function ixCloseListing(owner: PublicKey, listing: PublicKey): TransactionInstruction {
  return programInstruction(
    "close_listing",
    [meta(owner, true, true), meta(listing, false, true)],
    new Uint8Array()
  );
}

// ---------------------------------------------------------------------------
// Rentals
// ---------------------------------------------------------------------------

export interface CreateRentalArgs {
  rentalId: Bytes32;
  startTs: bigint | number;
  days: number;
}

/** `create_rental(rental_id, start_ts, days)` — renter only; escrows in-tx. */
export function ixCreateRental(
  renter: PublicKey,
  listing: PublicKey,
  args: CreateRentalArgs
): TransactionInstruction {
  const rentalId = toBytes(args.rentalId, "rentalId");
  const data = new Writer().bytes(rentalId).i64(args.startTs).u16(args.days).build();
  return programInstruction(
    "create_rental",
    [
      meta(renter, true, true),
      meta(configPda(), false),
      meta(listing, false, true),
      meta(rentalPda(listing, rentalId), false, true),
      system(),
    ],
    data
  );
}

export interface SettleRentalArgs {
  listing: PublicKey;
  rental: PublicKey;
  ownerWallet: PublicKey;
  platformTreasury: PublicKey;
  renterWallet: PublicKey;
}

/** `settle_rental()` — owner gate or permissionless timeout gate. */
export function ixSettleRental(
  caller: PublicKey,
  args: SettleRentalArgs
): TransactionInstruction {
  return programInstruction(
    "settle_rental",
    [
      meta(caller, true),
      meta(configPda(), false),
      meta(args.listing, false, true),
      meta(args.rental, false, true),
      meta(args.ownerWallet, false, true),
      meta(args.platformTreasury, false, true),
      meta(args.renterWallet, false, true),
      system(),
    ],
    new Uint8Array()
  );
}

/** `cancel_rental()` — either party, before start; full refund to the renter. */
export function ixCancelRental(
  party: PublicKey,
  args: { listing: PublicKey; rental: PublicKey; renterWallet: PublicKey }
): TransactionInstruction {
  return programInstruction(
    "cancel_rental",
    [
      meta(party, true),
      meta(args.listing, false, true),
      meta(args.rental, false, true),
      meta(args.renterWallet, false, true),
      system(),
    ],
    new Uint8Array()
  );
}

/** `raise_dispute()` — either party; freezes the escrow. */
export function ixRaiseDispute(
  party: PublicKey,
  args: { listing: PublicKey; rental: PublicKey }
): TransactionInstruction {
  return programInstruction(
    "raise_dispute",
    [meta(party, true), meta(args.listing, false), meta(args.rental, false, true)],
    new Uint8Array()
  );
}

export interface ResolveDisputeArgs {
  listing: PublicKey;
  rental: PublicKey;
  ownerWallet: PublicKey;
  renterWallet: PublicKey;
  ownerShareBps: number;
}

/** `resolve_dispute(owner_share_bps)` — admin only. */
export function ixResolveDispute(
  admin: PublicKey,
  args: ResolveDisputeArgs
): TransactionInstruction {
  const data = new Writer().u16(args.ownerShareBps).build();
  return programInstruction(
    "resolve_dispute",
    [
      meta(admin, true),
      meta(configPda(), false),
      meta(args.listing, false, true),
      meta(args.rental, false, true),
      meta(args.ownerWallet, false, true),
      meta(args.renterWallet, false, true),
      system(),
    ],
    data
  );
}

/** `close_rental()` — permissionless; rent returns to the renter. */
export function ixCloseRental(args: {
  rental: PublicKey;
  renterWallet: PublicKey;
}): TransactionInstruction {
  return programInstruction(
    "close_rental",
    [meta(args.rental, false, true), meta(args.renterWallet, false, true)],
    new Uint8Array()
  );
}
