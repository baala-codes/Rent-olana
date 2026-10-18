import type { Program } from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, type TransactionSignature } from "@solana/web3.js";
import { randomBytes } from "crypto";

import { configPda, listingPda, rentalPda, toBytes32, type Bytes32 } from "./pda";
import { toProgramError } from "./wire";

/**
 * Instruction builders for the asset-rental program.
 *
 * Every builder derives the program-owned PDAs itself, so a caller never has to
 * hand-encode a seed, and returns them alongside the transaction signature so
 * the caller can immediately fetch or dump the touched accounts.
 *
 * The `program` argument is intentionally loose (`Program`) so these builders
 * work both with generated `target/types/asset_rental.ts` types and with a plain
 * `new Program(idl, provider)` handle.
 */

/** A generated keypair, a wallet-backed keypair, or any signer with a public key. */
export interface Signer {
  publicKey: PublicKey;
}

export type RentalProgram = Program;

/** Program method table, untyped so this file compiles without generated types. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const methods = (program: RentalProgram): any => program.methods as any;

/**
 * Send a builder and rethrow failures with the program's own code, message and
 * logs.
 *
 * Anchor 0.30 constructs `new SendTransactionError(message, logs)`, but
 * web3.js >= 1.95 expects `{ action, signature, transactionMessage, logs }`.
 * The destructured `action` is therefore `undefined` and both the logs and the
 * signature are discarded, leaving only `Unknown action 'undefined'`.
 *
 * When that happens we re-simulate the same builder. Simulation needs neither a
 * signature nor a blockhash (`replaceRecentBlockhash`), so it reproduces the
 * program logs without moving any funds or requiring a second approval.
 */
async function send(program: RentalProgram, builder: any): Promise<TransactionSignature> {
  try {
    return (await builder.rpc()) as TransactionSignature;
  } catch (cause) {
    const recovered = await recoverSimulationLogs(program, builder);
    throw toProgramError(recovered ?? cause);
  }
}

async function recoverSimulationLogs(
  program: RentalProgram,
  builder: any
): Promise<{ message: string; logs: string[] } | null> {
  try {
    const transaction = await builder.transaction();
    const simulation = await program.provider.connection.simulateTransaction(transaction, {
      replaceRecentBlockhash: true,
      sigVerify: false,
    });
    const logs = simulation.value.logs ?? [];
    return logs.length > 0 ? { message: simulation.value.err?.toString() ?? "simulation failed", logs } : null;
  } catch {
    // Simulation is best-effort diagnostics; fall back to the original error.
    return null;
  }
}

/** Attach any extra signers (owner/renter keypairs) to a builder. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withSigners(builder: any, signers?: (Keypair | Signer)[]): any {
  return signers && signers.length > 0 ? builder.signers(signers) : builder;
}

/** Optional argument helpers: omit -> the Rust `Option::None`. */
const opt = <T>(value: T | undefined | null): T | null => value ?? null;

/**
 * A fresh, unique 32-byte rental ID.
 *
 * Persist this value *before* submitting the transaction. If confirmation is
 * uncertain, re-read the rental PDA with the same ID — never generate a new one,
 * or the retry can double-charge.
 */
export function newRentalId(): Buffer {
  return randomBytes(32);
}

/** A fresh, unique 32-byte asset ID for a new listing. */
export function newAssetId(): Buffer {
  return randomBytes(32);
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface InitializeConfigArgs {
  admin: PublicKey;
  treasury: PublicKey;
  feeBps: number;
  signers?: Keypair[];
}

/** `initialize_config`: create the singleton `PlatformConfig`. Callable once. */
export async function initializeConfig(program: RentalProgram, args: InitializeConfigArgs) {
  const [config] = configPda();

  const builder = withSigners(
    methods(program)
      .initializeConfig(args.treasury, args.feeBps)
      .accounts({
        admin: args.admin,
        config,
        systemProgram: SystemProgram.programId,
      }),
    args.signers
  );

  return { signature: await send(program, builder), config };
}

export interface SetConfigArgs {
  admin: PublicKey;
  treasury?: PublicKey;
  feeBps?: number;
  paused?: boolean;
  signers?: Keypair[];
}

/** `set_config`: admin updates treasury, fee, and/or the pause switch. */
export async function setConfig(program: RentalProgram, args: SetConfigArgs) {
  const [config] = configPda();

  const builder = withSigners(
    methods(program)
      .setConfig(opt(args.treasury), opt(args.feeBps), opt(args.paused))
      .accounts({ admin: args.admin, config }),
    args.signers
  );

  return { signature: await send(program, builder), config };
}

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------

export interface RegisterAssetArgs {
  owner: PublicKey;
  assetId: Bytes32;
  category: number;
  pricePerDay: number | BN | bigint;
  deposit: number | BN | bigint;
  maxDays: number;
  metadataHash: Bytes32;
  signers?: Keypair[];
}

/** `register_asset`: create a listing and its terms. */
export async function registerAsset(program: RentalProgram, args: RegisterAssetArgs) {
  const assetId = toBytes32(args.assetId, "assetId");
  const metadataHash = toBytes32(args.metadataHash, "metadataHash");
  const [listing] = listingPda(args.owner, assetId);

  const builder = withSigners(
    methods(program)
      .registerAsset(
        Array.from(assetId),
        args.category,
        new BN(args.pricePerDay.toString()),
        new BN(args.deposit.toString()),
        args.maxDays,
        Array.from(metadataHash)
      )
      .accounts({
        owner: args.owner,
        listing,
        systemProgram: SystemProgram.programId,
      }),
    args.signers
  );

  return { signature: await send(program, builder), listing, assetId };
}

export interface UpdateAssetArgs {
  owner: PublicKey;
  listing: PublicKey;
  pricePerDay?: number | BN | bigint;
  deposit?: number | BN | bigint;
  maxDays?: number;
  category?: number;
  metadataHash?: Bytes32;
  signers?: Keypair[];
}

/**
 * `update_asset`: owner edits listing terms. Price, deposit, and max days are
 * rejected on-chain while a rental holds the listing.
 */
export async function updateAsset(program: RentalProgram, args: UpdateAssetArgs) {
  const builder = withSigners(
    methods(program)
      .updateAsset(
        args.pricePerDay === undefined ? null : new BN(args.pricePerDay.toString()),
        args.deposit === undefined ? null : new BN(args.deposit.toString()),
        opt(args.maxDays),
        opt(args.category),
        args.metadataHash === undefined ? null : Array.from(toBytes32(args.metadataHash, "metadataHash"))
      )
      .accounts({ owner: args.owner, listing: args.listing }),
    args.signers
  );

  return { signature: await send(program, builder) };
}

export interface SetListingStatusArgs {
  owner: PublicKey;
  listing: PublicKey;
  active: boolean;
  signers?: Keypair[];
}

/** `set_listing_status`: activate or deactivate a listing for new bookings. */
export async function setListingStatus(program: RentalProgram, args: SetListingStatusArgs) {
  const builder = withSigners(
    methods(program)
      .setListingStatus(args.active)
      .accounts({ owner: args.owner, listing: args.listing }),
    args.signers
  );

  return { signature: await send(program, builder) };
}

export interface CloseListingArgs {
  owner: PublicKey;
  listing: PublicKey;
  signers?: Keypair[];
}

/** `close_listing`: reclaim a listing's rent once it has no open rental. */
export async function closeListing(program: RentalProgram, args: CloseListingArgs) {
  const builder = withSigners(
    methods(program)
      .closeListing()
      .accounts({ owner: args.owner, listing: args.listing }),
    args.signers
  );

  return { signature: await send(program, builder) };
}

// ---------------------------------------------------------------------------
// Rentals
// ---------------------------------------------------------------------------

export interface CreateRentalArgs {
  renter: PublicKey;
  listing: PublicKey;
  /** Unique 32-byte ID. Persist before submitting. */
  rentalId: Bytes32;
  /** Unix timestamp the rental starts (inclusive). */
  startTs: number | BN | bigint;
  days: number;
  signers?: Keypair[];
}

/** `create_rental`: book a listing and escrow `price_per_day * days + deposit`. */
export async function createRental(program: RentalProgram, args: CreateRentalArgs) {
  const rentalId = toBytes32(args.rentalId, "rentalId");
  const [config] = configPda();
  const [rental] = rentalPda(args.listing, rentalId);

  const builder = withSigners(
    methods(program)
      .createRental(Array.from(rentalId), new BN(args.startTs.toString()), args.days)
      .accounts({
        renter: args.renter,
        config,
        listing: args.listing,
        rental,
        systemProgram: SystemProgram.programId,
      }),
    args.signers
  );

  return { signature: await send(program, builder), rental, rentalId };
}

export interface SettleRentalArgs {
  /** The listing owner (early path) or any wallet (timeout path). */
  caller: PublicKey;
  listing: PublicKey;
  rental: PublicKey;
  ownerWallet: PublicKey;
  platformTreasury: PublicKey;
  renterWallet: PublicKey;
  signers?: Keypair[];
}

/** `settle_rental`: release escrow to owner, treasury, and renter. */
export async function settleRental(program: RentalProgram, args: SettleRentalArgs) {
  const [config] = configPda();

  const builder = withSigners(
    methods(program)
      .settleRental()
      .accounts({
        caller: args.caller,
        config,
        listing: args.listing,
        rental: args.rental,
        ownerWallet: args.ownerWallet,
        platformTreasury: args.platformTreasury,
        renterWallet: args.renterWallet,
        systemProgram: SystemProgram.programId,
      }),
    args.signers
  );

  return { signature: await send(program, builder) };
}

export interface CancelRentalArgs {
  /** Owner or renter. */
  party: PublicKey;
  listing: PublicKey;
  rental: PublicKey;
  renterWallet: PublicKey;
  signers?: Keypair[];
}

/** `cancel_rental`: either party cancels before start; the renter is refunded. */
export async function cancelRental(program: RentalProgram, args: CancelRentalArgs) {
  const builder = withSigners(
    methods(program)
      .cancelRental()
      .accounts({
        party: args.party,
        listing: args.listing,
        rental: args.rental,
        renterWallet: args.renterWallet,
        systemProgram: SystemProgram.programId,
      }),
    args.signers
  );

  return { signature: await send(program, builder) };
}

export interface RaiseDisputeArgs {
  /** Owner or renter. */
  party: PublicKey;
  listing: PublicKey;
  rental: PublicKey;
  signers?: Keypair[];
}

/** `raise_dispute`: freeze an open rental until the admin resolves it. */
export async function raiseDispute(program: RentalProgram, args: RaiseDisputeArgs) {
  const builder = withSigners(
    methods(program)
      .raiseDispute()
      .accounts({ party: args.party, listing: args.listing, rental: args.rental }),
    args.signers
  );

  return { signature: await send(program, builder) };
}

export interface ResolveDisputeArgs {
  admin: PublicKey;
  listing: PublicKey;
  rental: PublicKey;
  ownerWallet: PublicKey;
  renterWallet: PublicKey;
  /** 0 = full refund to the renter, 10_000 = full award to the owner. */
  ownerShareBps: number;
  signers?: Keypair[];
}

/** `resolve_dispute`: admin splits frozen escrow by `owner_share_bps`. */
export async function resolveDispute(program: RentalProgram, args: ResolveDisputeArgs) {
  const [config] = configPda();

  const builder = withSigners(
    methods(program)
      .resolveDispute(args.ownerShareBps)
      .accounts({
        admin: args.admin,
        config,
        listing: args.listing,
        rental: args.rental,
        ownerWallet: args.ownerWallet,
        renterWallet: args.renterWallet,
        systemProgram: SystemProgram.programId,
      }),
    args.signers
  );

  return { signature: await send(program, builder) };
}

export interface CloseRentalArgs {
  rental: PublicKey;
  renterWallet: PublicKey;
}

/** `close_rental`: reclaim a terminated rental's rent to the renter. Permissionless. */
export async function closeRental(program: RentalProgram, args: CloseRentalArgs) {
  const builder = methods(program)
    .closeRental()
    .accounts({ rental: args.rental, renterWallet: args.renterWallet });

  return { signature: await send(program, builder) };
}
