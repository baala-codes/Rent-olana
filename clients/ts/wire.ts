import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  type AccountMeta,
} from "@solana/web3.js";

import {
  ACCOUNT_DISC,
  ACCOUNT_LEN,
  ASSET_ID_LEN,
  IX_DISC,
  METADATA_HASH_LEN,
  PROGRAM_ID,
  RENTAL_ERRORS,
  RENTAL_STATUS,
  RENTAL_STATUS_NAME,
  SEED_ASSET,
  SEED_CONFIG,
  SEED_RENTAL,
  type InstructionName,
  type RentalStatusName,
} from "./contract";

/**
 * The on-chain wire format, written once.
 *
 * Every byte this client puts on the wire — instruction discriminators, Borsh
 * arguments, account order and writability, PDA seeds, account layouts — lives
 * in this module. The browser portal, the Node client, the backend and the
 * acceptance tests all import it, so there is no second hand-written encoding
 * to drift. Discriminators come from the IDL (see `contract.ts`); this file
 * never hard-codes a hex constant.
 *
 * It imports only `@solana/web3.js`, so it is safe to bundle for the browser.
 */

// ---------------------------------------------------------------------------
// Bytes
// ---------------------------------------------------------------------------

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error(`hex string must be even length: ${hex}`);
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Accepts a Buffer, Uint8Array, or number array and normalises it. */
export type Bytes32 = Uint8Array | number[];

/** Normalise and length-check a fixed-size seed/identifier value. */
export function toBytes32(value: Bytes32, name: string, len = 32): Uint8Array {
  const bytes = value instanceof Uint8Array ? value : Uint8Array.from(value);
  if (bytes.length !== len) {
    throw new Error(`${name} must be exactly ${len} bytes, received ${bytes.length}`);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Borsh
// ---------------------------------------------------------------------------

/** Growable little-endian Borsh writer for instruction arguments. */
export class Writer {
  private readonly buf: number[] = [];

  private push(bytes: Uint8Array): this {
    for (const byte of bytes) this.buf.push(byte);
    return this;
  }

  u8(value: number): this {
    this.buf.push(value & 0xff);
    return this;
  }

  bool(value: boolean): this {
    return this.u8(value ? 1 : 0);
  }

  u16(value: number): this {
    return this.u8(value).u8(value >>> 8);
  }

  private u64Bytes(value: bigint, signed: boolean): Uint8Array {
    const view = new DataView(new ArrayBuffer(8));
    if (signed) view.setBigInt64(0, value, true);
    else view.setBigUint64(0, value, true);
    return new Uint8Array(view.buffer);
  }

  u64(value: bigint | number): this {
    return this.push(this.u64Bytes(BigInt(value), false));
  }

  i64(value: bigint | number): this {
    return this.push(this.u64Bytes(BigInt(value), true));
  }

  bytes(value: Uint8Array | number[]): this {
    return this.push(value instanceof Uint8Array ? value : Uint8Array.from(value));
  }

  pubkey(value: PublicKey): this {
    return this.bytes(value.toBytes());
  }

  /** Borsh `Option`: `0x00` for none, `0x01` followed by the inner value. */
  option<T extends keyof WriterValues>(inner: T, value: WriterValues[T] | undefined | null): this {
    if (value === undefined || value === null) return this.u8(0);
    this.u8(1);
    (this[inner] as (value: WriterValues[T]) => this).call(this, value);
    return this;
  }

  build(): Uint8Array {
    return Uint8Array.from(this.buf);
  }
}

/** Value types `option` can dispatch to (method name -> its argument type). */
interface WriterValues {
  u16: number;
  u64: bigint | number;
  i64: bigint | number;
  pubkey: PublicKey;
  bytes: Uint8Array | number[];
}

/** Sequential reader over account data. */
export class Reader {
  private readonly view: DataView;
  private offset: number;

  constructor(view: DataView, start = 0) {
    this.view = view;
    this.offset = start;
  }

  get position(): number {
    return this.offset;
  }

  u8(): number {
    return this.view.getUint8(this.offset++);
  }

  bool(): boolean {
    return this.u8() !== 0;
  }

  u16(): number {
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  u64(): bigint {
    const value = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    return value;
  }

  i64(): bigint {
    const value = this.view.getBigInt64(this.offset, true);
    this.offset += 8;
    return value;
  }

  bytes(length: number): Uint8Array {
    const out = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, length);
    this.offset += length;
    return out;
  }

  pubkey(): PublicKey {
    return new PublicKey(this.bytes(32));
  }
}

// ---------------------------------------------------------------------------
// PDAs
// ---------------------------------------------------------------------------

/** `[b"config"]` */
export function configPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEED_CONFIG], PROGRAM_ID);
}

/** `[b"asset", owner, asset_id]` */
export function listingPda(owner: PublicKey, assetId: Bytes32): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_ASSET, owner.toBytes(), toBytes32(assetId, "assetId", ASSET_ID_LEN)],
    PROGRAM_ID
  );
}

/** `[b"rental", listing, rental_id]` */
export function rentalPda(listing: PublicKey, rentalId: Bytes32): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_RENTAL, listing.toBytes(), toBytes32(rentalId, "rentalId")],
    PROGRAM_ID
  );
}

/** Address-only conveniences (the portal never needs the bump). */
export const configAddress = (): PublicKey => configPda()[0];
export const listingAddress = (owner: PublicKey, assetId: Bytes32): PublicKey =>
  listingPda(owner, assetId)[0];
export const rentalAddress = (listing: PublicKey, rentalId: Bytes32): PublicKey =>
  rentalPda(listing, rentalId)[0];

// ---------------------------------------------------------------------------
// Instructions
// ---------------------------------------------------------------------------

function programInstruction(
  name: InstructionName,
  keys: AccountMeta[],
  data: Uint8Array
): TransactionInstruction {
  // web3.js types `data` as Buffer but accepts any Uint8Array at runtime. Do not
  // reference the `Buffer` global: this module is bundled for the browser.
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data: concatBytes(hexToBytes(IX_DISC[name]), data) as unknown as Buffer,
  });
}

const meta = (pubkey: PublicKey, isSigner = false, isWritable = false): AccountMeta => ({
  pubkey,
  isSigner,
  isWritable,
});

const system = (): AccountMeta => meta(SystemProgram.programId, false, false);

/** `initialize_config(treasury, fee_bps)` — admin only, once. */
export function ixInitializeConfig(
  admin: PublicKey,
  treasury: PublicKey,
  feeBps: number
): TransactionInstruction {
  return programInstruction(
    "initialize_config",
    [meta(admin, true, true), meta(configAddress(), false, true), system()],
    new Writer().pubkey(treasury).u16(feeBps).build()
  );
}

/** `set_config(treasury?, fee_bps?, paused?)` — admin only. */
export function ixSetConfig(
  admin: PublicKey,
  changes: { treasury?: PublicKey; feeBps?: number; paused?: boolean }
): TransactionInstruction {
  const writer = new Writer().option("pubkey", changes.treasury).option("u16", changes.feeBps);
  if (changes.paused === undefined) writer.u8(0);
  else writer.u8(1).bool(changes.paused);

  return programInstruction(
    "set_config",
    [meta(admin, true), meta(configAddress(), false, true)],
    writer.build()
  );
}

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
  const assetId = toBytes32(args.assetId, "assetId");
  const metadataHash = toBytes32(args.metadataHash, "metadataHash", METADATA_HASH_LEN);
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
    [meta(owner, true, true), meta(listingAddress(owner, assetId), false, true), system()],
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
      args.metadataHash === undefined
        ? undefined
        : toBytes32(args.metadataHash, "metadataHash", METADATA_HASH_LEN)
    )
    .build();

  return programInstruction("update_asset", [meta(owner, true), meta(listing, false, true)], data);
}

/** `set_listing_status(active)` — owner only. */
export function ixSetListingStatus(
  owner: PublicKey,
  listing: PublicKey,
  active: boolean
): TransactionInstruction {
  return programInstruction(
    "set_listing_status",
    [meta(owner, true), meta(listing, false, true)],
    new Writer().bool(active).build()
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
  const rentalId = toBytes32(args.rentalId, "rentalId");
  return programInstruction(
    "create_rental",
    [
      meta(renter, true, true),
      meta(configAddress(), false),
      meta(listing, false, true),
      meta(rentalAddress(listing, rentalId), false, true),
      system(),
    ],
    new Writer().bytes(rentalId).i64(args.startTs).u16(args.days).build()
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
      meta(configAddress(), false),
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
  return programInstruction(
    "resolve_dispute",
    [
      meta(admin, true),
      meta(configAddress(), false),
      meta(args.listing, false, true),
      meta(args.rental, false, true),
      meta(args.ownerWallet, false, true),
      meta(args.renterWallet, false, true),
      system(),
    ],
    new Writer().u16(args.ownerShareBps).build()
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

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export interface Listing {
  address: PublicKey;
  owner: PublicKey;
  assetId: Uint8Array;
  category: number;
  pricePerDay: bigint;
  deposit: bigint;
  maxDays: number;
  metadataHash: Uint8Array;
  active: boolean;
  currentRental: PublicKey;
  busyUntil: bigint;
  totalRentals: bigint;
  createdAt: bigint;
}

export interface Rental {
  address: PublicKey;
  listing: PublicKey;
  owner: PublicKey;
  renter: PublicKey;
  rentalId: Uint8Array;
  startTs: bigint;
  endTs: bigint;
  days: number;
  priceTotal: bigint;
  deposit: bigint;
  escrow: bigint;
  status: RentalStatusName;
  createdAt: bigint;
}

export interface ConfigAccount {
  address: PublicKey;
  admin: PublicKey;
  treasury: PublicKey;
  feeBps: number;
  paused: boolean;
}

const EMPTY_PUBKEY = PublicKey.default;

function checkDiscriminator(data: Uint8Array, expectedHex: string, name: string): void {
  if (!bytesEqual(data.subarray(0, 8), hexToBytes(expectedHex))) {
    throw new Error(`${name} account discriminator does not match the expected type`);
  }
}

export function decodeAssetListing(address: PublicKey, data: Uint8Array): Listing {
  checkDiscriminator(data, ACCOUNT_DISC.AssetListing, "AssetListing");
  const r = new Reader(new DataView(data.buffer, data.byteOffset, data.byteLength), 8);
  return {
    address,
    owner: r.pubkey(),
    assetId: r.bytes(32),
    category: r.u16(),
    pricePerDay: r.u64(),
    deposit: r.u64(),
    maxDays: r.u16(),
    metadataHash: r.bytes(32),
    active: r.bool(),
    currentRental: r.pubkey(),
    busyUntil: r.i64(),
    totalRentals: r.u64(),
    createdAt: r.i64(),
  };
}

export function decodeRentalAgreement(address: PublicKey, data: Uint8Array): Rental {
  checkDiscriminator(data, ACCOUNT_DISC.RentalAgreement, "RentalAgreement");
  const r = new Reader(new DataView(data.buffer, data.byteOffset, data.byteLength), 8);
  const listing = r.pubkey();
  const owner = r.pubkey();
  const renter = r.pubkey();
  const rentalId = r.bytes(32);
  const startTs = r.i64();
  const endTs = r.i64();
  const days = r.u16();
  const priceTotal = r.u64();
  const deposit = r.u64();
  const escrow = r.u64();
  const statusByte = r.u8();
  const createdAt = r.i64();
  return {
    address,
    listing,
    owner,
    renter,
    rentalId,
    startTs,
    endTs,
    days,
    priceTotal,
    deposit,
    escrow,
    status: RENTAL_STATUS_NAME[statusByte] ?? "Reserved",
    createdAt,
  };
}

export function decodePlatformConfig(address: PublicKey, data: Uint8Array): ConfigAccount {
  checkDiscriminator(data, ACCOUNT_DISC.PlatformConfig, "PlatformConfig");
  const r = new Reader(new DataView(data.buffer, data.byteOffset, data.byteLength), 8);
  return {
    address,
    admin: r.pubkey(),
    treasury: r.pubkey(),
    feeBps: r.u16(),
    paused: r.bool(),
  };
}

/** Short aliases: the account type names match the IDL. */
export const decodeListing = decodeAssetListing;
export const decodeRental = decodeRentalAgreement;
export const decodeConfig = decodePlatformConfig;

/** True once the listing is free (no live rental holds it). */
export const isListingFree = (listing: Listing): boolean =>
  listing.currentRental.equals(EMPTY_PUBKEY);

/** All `AssetListing` accounts owned by the program. */
export async function fetchListings(connection: Connection): Promise<Listing[]> {
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [{ dataSize: ACCOUNT_LEN.AssetListing }],
  });
  return accounts.map(({ pubkey, account }) =>
    decodeAssetListing(pubkey, new Uint8Array(account.data))
  );
}

/** All `RentalAgreement` accounts owned by the program. */
export async function fetchRentals(connection: Connection): Promise<Rental[]> {
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [{ dataSize: ACCOUNT_LEN.RentalAgreement }],
  });
  return accounts.map(({ pubkey, account }) =>
    decodeRentalAgreement(pubkey, new Uint8Array(account.data))
  );
}

/** The singleton `PlatformConfig`, or `null` before `initialize_config`. */
export async function fetchConfig(connection: Connection): Promise<ConfigAccount | null> {
  const address = configAddress();
  const info = await connection.getAccountInfo(address, "confirmed");
  if (!info) return null;
  return decodePlatformConfig(address, new Uint8Array(info.data));
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * A decoded program failure.
 *
 * Anchor 0.30 wraps a failed transaction with the legacy
 * `new SendTransactionError(message, logs)` signature while web3.js >= 1.95
 * expects an object, so `error.action` becomes `undefined` and the useful
 * message is lost. Everything downstream should call `parseProgramError`
 * instead of reading `err.message`: it recovers the code and the program logs
 * from whichever shape arrived.
 */
export interface ProgramFailure {
  code?: number;
  name?: string;
  message: string;
  logs: string[];
}

function collectLogs(value: unknown, depth = 0, seen = new Set<unknown>()): string[] {
  if (!value || depth > 4 || seen.has(value)) return [];
  seen.add(value);

  const record = value as Record<string, unknown>;
  for (const key of ["logs", "transactionLogs"]) {
    const candidate = record[key];
    if (Array.isArray(candidate) && candidate.every((line) => typeof line === "string")) {
      return candidate as string[];
    }
  }
  for (const key of ["error", "cause", "transactionError"]) {
    const nested = collectLogs(record[key], depth + 1, seen);
    if (nested.length > 0) return nested;
  }
  return [];
}

function codeFromText(text: string): number | undefined {
  if (!text) return undefined;

  // Anchor's structured log: "Error Code: StartInPast. Error Number: 6007."
  const anchor = text.match(/Error Number:\s*(\d+)/);
  if (anchor) return Number(anchor[1]);

  // RPC's InstructionError: "custom program error: 0x1777" (hex!).
  const hex = text.match(/custom program error: 0x([0-9a-fA-F]+)/);
  if (hex) {
    const value = parseInt(hex[1], 16);
    if (value >= 6000) return value;
  }

  // JSON form: {"Custom":6007}. Do not confuse the two: 0x1777 is 6007, and a
  // hex string can be all digits, so each match keeps its own base.
  const json = text.match(/"Custom"\s*:\s*(\d+)/);
  if (json) {
    const value = Number(json[1]);
    if (value >= 6000) return value;
  }
  return undefined;
}

/** Decode an Anchor/web3.js failure, recovering logs whenever they survived. */
export function parseProgramError(error: unknown): ProgramFailure {
  const record = (error ?? {}) as Record<string, any>;
  const logs = collectLogs(error);

  const structured =
    record?.error?.errorCode?.number ??
    record?.error?.errorCode?.code ??
    record?.errorCode?.number ??
    record?.code;

  const messageText =
    typeof record?.message === "string"
      ? record.message
      : typeof record?.error?.message === "string"
        ? record.error.message
        : "";

  const code =
    typeof structured === "number" && structured >= 6000
      ? structured
      : (codeFromText(logs.join("\n")) ?? codeFromText(messageText));

  const errors = RENTAL_ERRORS as Record<number, readonly [string, string]>;
  const entry = code !== undefined ? errors[code] : undefined;
  const name = entry?.[0];

  if (entry) {
    return { code, name, message: `${entry[0]}: ${entry[1]}`, logs };
  }

  const programLog = [...logs].reverse().find((line) => line.startsWith("Program log: "));
  const fallback =
    (typeof record?.message === "string" && record.message) ||
    (typeof record?.error?.message === "string" && record.error.message) ||
    programLog?.replace("Program log: ", "") ||
    String(error);

  // Never let the masked web3.js message stand when logs were available.
  const masked = /Unknown action 'undefined'/i.test(fallback);
  return {
    code,
    name,
    message: masked && programLog ? programLog.replace("Program log: ", "") : fallback,
    logs,
  };
}

/**
 * A decoded program failure thrown as an `Error`, so callers see the real
 * program message and logs even when the SDK wrapper masked them.
 */
export class ProgramInvocationError extends Error {
  readonly code?: number;
  readonly programName?: string;
  readonly logs: string[];

  constructor(failure: ProgramFailure) {
    super(failure.message);
    this.name = "ProgramInvocationError";
    this.code = failure.code;
    this.programName = failure.name;
    this.logs = failure.logs;
  }
}

/** Normalise any thrown value into a `ProgramInvocationError`. */
export function toProgramError(error: unknown): ProgramInvocationError {
  return error instanceof ProgramInvocationError
    ? error
    : new ProgramInvocationError(parseProgramError(error));
}

/** The program error code from any failure shape, if one can be recovered. */
export function programErrorCode(error: unknown): number | undefined {
  return parseProgramError(error).code;
}

/** True when `error` is the given named program error. */
export function isProgramError(error: unknown, name: string): boolean {
  return parseProgramError(error).name === name;
}

/** Rental status code -> name (single place; the enum is append-only). */
export const rentalStatusName = (code: number): RentalStatusName =>
  RENTAL_STATUS_NAME[code] ?? "Reserved";

/** Name -> status code. */
export const rentalStatusCode = (name: RentalStatusName): number => RENTAL_STATUS[name];
