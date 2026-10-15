import { PublicKey } from "@solana/web3.js";

import {
  ASSET_ID_LEN,
  PROGRAM_ID,
  RENTAL_ID_LEN,
  SEED_ASSET,
  SEED_CONFIG,
  SEED_RENTAL,
} from "./constants";

/**
 * PDA derivation helpers.
 *
 * These encodings are the shared contract with the program. They must stay
 * byte-for-byte identical to the seeds in
 * `programs/asset-rental/src/state.rs`; see `docs/CONTRACT.md` for the seed byte
 * tables. Every function returns `[address, bump]`, matching
 * `PublicKey.findProgramAddressSync`.
 */

/** Accepts a Buffer, Uint8Array, or number array and normalises it to a Buffer. */
export type Bytes32 = Buffer | Uint8Array | number[];

/** Normalise and length-check a 32-byte seed value. */
export function toBytes32(value: Bytes32, name: string, len = 32): Buffer {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  if (buffer.length !== len) {
    throw new Error(`${name} must be exactly ${len} bytes, received ${buffer.length}`);
  }
  return buffer;
}

/** `[b"config"]` */
export function configPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEED_CONFIG], PROGRAM_ID);
}

/** `[b"asset", owner, asset_id]` */
export function listingPda(owner: PublicKey, assetId: Bytes32): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_ASSET, owner.toBuffer(), toBytes32(assetId, "assetId", ASSET_ID_LEN)],
    PROGRAM_ID
  );
}

/** `[b"rental", listing, rental_id]` */
export function rentalPda(listing: PublicKey, rentalId: Bytes32): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_RENTAL, listing.toBuffer(), toBytes32(rentalId, "rentalId", RENTAL_ID_LEN)],
    PROGRAM_ID
  );
}

/** Convenience: address only, discarding the bump. */
export const configAddress = (): PublicKey => configPda()[0];
export const listingAddress = (owner: PublicKey, assetId: Bytes32): PublicKey =>
  listingPda(owner, assetId)[0];
export const rentalAddress = (listing: PublicKey, rentalId: Bytes32): PublicKey =>
  rentalPda(listing, rentalId)[0];

export { ASSET_ID_LEN, RENTAL_ID_LEN };
