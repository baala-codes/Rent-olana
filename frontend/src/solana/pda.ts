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
 * PDA derivation. Byte-for-byte identical to the seeds in
 * `programs/asset-rental/src/state.rs` and to `clients/ts/pda.ts`.
 */

export type Bytes32 = Uint8Array | number[];

/** Normalise and length-check a 32-byte seed value. */
export function toBytes(value: Bytes32, name: string, len = 32): Uint8Array {
  const bytes = value instanceof Uint8Array ? value : Uint8Array.from(value);
  if (bytes.length !== len) {
    throw new Error(`${name} must be exactly ${len} bytes, received ${bytes.length}`);
  }
  return bytes;
}

/** `[b"config"]` */
export function configPda(): PublicKey {
  return PublicKey.findProgramAddressSync([SEED_CONFIG], PROGRAM_ID)[0];
}

/** `[b"asset", owner, asset_id]` */
export function listingPda(owner: PublicKey, assetId: Bytes32): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEED_ASSET, owner.toBytes(), toBytes(assetId, "assetId", ASSET_ID_LEN)],
    PROGRAM_ID
  )[0];
}

/** `[b"rental", listing, rental_id]` */
export function rentalPda(listing: PublicKey, rentalId: Bytes32): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEED_RENTAL, listing.toBytes(), toBytes(rentalId, "rentalId", RENTAL_ID_LEN)],
    PROGRAM_ID
  )[0];
}
