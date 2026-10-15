import { Connection, PublicKey } from "@solana/web3.js";

import {
  ACCOUNT_DISC,
  ACCOUNT_LEN,
  PROGRAM_ID,
  RENTAL_STATUS,
  type RentalStatusName,
} from "./constants";
import { Reader, bytesEqual, hexToBytes } from "./codec";
import { configPda } from "./pda";

/**
 * Read-side of the contract: fetch program-owned accounts and decode them into
 * typed objects.
 *
 * Decoding is sequential and mirrors the field order in
 * `programs/asset-rental/src/state.rs` (see `docs/CONTRACT.md` §1 for the
 * absolute byte-offset tables). The discriminator is verified before trusting
 * any field, so a same-sized account owned by the program can never masquerade
 * as a listing.
 */

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

function checkDiscriminator(data: Uint8Array, hex: string): void {
  if (!bytesEqual(data.subarray(0, 8), hexToBytes(hex))) {
    throw new Error("account discriminator does not match the expected type");
  }
}

export function decodeListing(address: PublicKey, data: Uint8Array): Listing {
  checkDiscriminator(data, ACCOUNT_DISC.AssetListing);
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

export function decodeRental(address: PublicKey, data: Uint8Array): Rental {
  checkDiscriminator(data, ACCOUNT_DISC.RentalAgreement);
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
    status: RENTAL_STATUS[statusByte] ?? "Reserved",
    createdAt,
  };
}

export function decodeConfig(address: PublicKey, data: Uint8Array): ConfigAccount {
  checkDiscriminator(data, ACCOUNT_DISC.PlatformConfig);
  const r = new Reader(new DataView(data.buffer, data.byteOffset, data.byteLength), 8);
  return {
    address,
    admin: r.pubkey(),
    treasury: r.pubkey(),
    feeBps: r.u16(),
    paused: r.bool(),
  };
}

/** True once the listing is free (no live rental holds it). */
export const isListingFree = (listing: Listing): boolean =>
  listing.currentRental.equals(EMPTY_PUBKEY);

/** All `AssetListing` accounts owned by the program. */
export async function fetchListings(connection: Connection): Promise<Listing[]> {
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [{ dataSize: ACCOUNT_LEN.AssetListing }],
  });
  return accounts.map(({ pubkey, account }) =>
    decodeListing(pubkey, new Uint8Array(account.data))
  );
}

/** All `RentalAgreement` accounts owned by the program. */
export async function fetchRentals(connection: Connection): Promise<Rental[]> {
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [{ dataSize: ACCOUNT_LEN.RentalAgreement }],
  });
  return accounts.map(({ pubkey, account }) =>
    decodeRental(pubkey, new Uint8Array(account.data))
  );
}

/** The singleton `PlatformConfig`, or `null` before `initialize_config`. */
export async function fetchConfig(connection: Connection): Promise<ConfigAccount | null> {
  const address = configPda();
  const info = await connection.getAccountInfo(address, "confirmed");
  if (!info) return null;
  return decodeConfig(address, new Uint8Array(info.data));
}
