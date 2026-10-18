/**
 * Finalized chain reads.
 *
 * Only finalized data is mirrored. A failed or unavailable RPC call is an error,
 * never an empty result: treating "unknown" as "nothing there" is how a mirror
 * deletes real listings or shows a settled rental as open.
 */

import { Connection, PublicKey } from "@solana/web3.js";

import { PROGRAM_ID } from "../../clients/ts/contract.ts";
import {
  configAddress,
  decodeAssetListing,
  decodePlatformConfig,
  decodeRentalAgreement,
  fetchConfig,
  fetchListings,
  fetchRentals,
  type ConfigAccount,
  type Listing,
  type Rental,
} from "../../clients/ts/wire.ts";

export interface ChainSnapshot {
  config: ConfigAccount | null;
  listings: Listing[];
  rentals: Rental[];
}

export interface ChainReader {
  snapshot(): Promise<ChainSnapshot>;
  listing(address: string): Promise<Listing | null>;
  rental(address: string): Promise<Rental | null>;
  config(): Promise<ConfigAccount | null>;
}

export class SolanaChainReader implements ChainReader {
  private readonly connection: Connection;

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, "finalized");
  }

  async snapshot(): Promise<ChainSnapshot> {
    const [config, listings, rentals] = await Promise.all([
      fetchConfig(this.connection),
      fetchListings(this.connection),
      fetchRentals(this.connection),
    ]);
    return { config, listings, rentals };
  }

  async listing(address: string): Promise<Listing | null> {
    const info = await this.connection.getAccountInfo(new PublicKey(address), "finalized");
    if (!info) return null;
    if (!info.owner.equals(PROGRAM_ID)) {
      throw new Error(`account ${address} is not owned by ${PROGRAM_ID.toBase58()}`);
    }
    return decodeAssetListing(new PublicKey(address), new Uint8Array(info.data));
  }

  async rental(address: string): Promise<Rental | null> {
    const info = await this.connection.getAccountInfo(new PublicKey(address), "finalized");
    if (!info) return null;
    if (!info.owner.equals(PROGRAM_ID)) {
      throw new Error(`account ${address} is not owned by ${PROGRAM_ID.toBase58()}`);
    }
    return decodeRentalAgreement(new PublicKey(address), new Uint8Array(info.data));
  }

  async config(): Promise<ConfigAccount | null> {
    const info = await this.connection.getAccountInfo(configAddress(), "finalized");
    if (!info) return null;
    if (!info.owner.equals(PROGRAM_ID)) {
      throw new Error("config account is not owned by the program");
    }
    return decodePlatformConfig(configAddress(), new Uint8Array(info.data));
  }
}
