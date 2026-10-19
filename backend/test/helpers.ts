import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { Keypair, PublicKey } from "@solana/web3.js";

import type { ConfigAccount, Listing, Rental } from "../../clients/ts/wire.ts";
import { bytesToHex, metadataHashHex, type MetadataDocument } from "../../shared/src/index.ts";
import { AuditLog } from "../src/audit.ts";
import { authMessage, base58Encode } from "../src/auth.ts";
import type { ChainReader, ChainSnapshot } from "../src/chain.ts";
import { loadConfig, type BackendConfig } from "../src/config.ts";
import { MirrorDb, type ListingRow } from "../src/db.ts";
import { createApp } from "../src/http.ts";
import { MediaStore } from "../src/media.ts";
import { MirrorService, listingToRow } from "../src/mirror.ts";

/** `Response.json()` is typed `unknown`; tests assert on the documented shape. */
export async function readJson<T = any>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "asset-rental-"));
}

export function testConfig(dir: string, overrides: Partial<BackendConfig> = {}): BackendConfig {
  return {
    ...loadConfig({
      PORT: "0",
      DB_PATH: join(dir, "mirror.sqlite"),
      MEDIA_DIR: join(dir, "media"),
      AUDIT_PATH: join(dir, "audit.jsonl"),
      ADMIN_TOKEN: "test-admin-token",
      RPC_URL: "http://127.0.0.1:1",
    } as NodeJS.ProcessEnv),
    ...overrides,
  };
}

export interface WalletFixture {
  address: string;
  sign: (message: string) => string;
}

export function walletFixture(): WalletFixture {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" }) as { x?: string };
  if (!jwk.x) throw new Error("ed25519 public key has no x value");
  const raw = Buffer.from(jwk.x, "base64url");
  return {
    address: base58Encode(raw),
    sign: (message: string) => base58Encode(sign(null, Buffer.from(message), privateKey)),
  };
}

export function authHeaders(
  wallet: WalletFixture,
  request: { method: string; path: string; body: string | Uint8Array },
  options: { issuedAt?: number; nonce?: string } = {}
): Record<string, string> {
  const issuedAt = options.issuedAt ?? Math.floor(Date.now() / 1000);
  const nonce = options.nonce ?? randomUUID();
  const message = authMessage(request, issuedAt, nonce);
  return {
    "x-wallet": wallet.address,
    "x-issued-at": String(issuedAt),
    "x-nonce": nonce,
    "x-signature": wallet.sign(message),
  };
}

export interface SeededListing {
  listing: Listing;
  row: ListingRow;
  document: MetadataDocument | null;
}

export async function seedListing(
  db: MirrorDb,
  options: {
    owner?: PublicKey;
    category?: number;
    pricePerDay?: bigint;
    active?: boolean;
    busyUntil?: bigint;
    createdAt?: bigint;
    metadata?: {
      name: string;
      description?: string;
      lat?: number;
      lng?: number;
    } | null;
  } = {}
): Promise<SeededListing> {
  const owner = options.owner ?? Keypair.generate().publicKey;
  const metadata = options.metadata
    ? {
        name: options.metadata.name,
        description: options.metadata.description ?? "",
        category: options.category ?? 1,
        location:
          options.metadata.lat !== undefined && options.metadata.lng !== undefined
            ? { label: "test", lat: options.metadata.lat, lng: options.metadata.lng }
            : null,
        images: [],
      }
    : null;

  const hash = metadata ? await metadataHashHex(metadata) : "00".repeat(32);
  const listing: Listing = {
    address: Keypair.generate().publicKey,
    owner,
    assetId: crypto.getRandomValues(new Uint8Array(32)),
    category: options.category ?? 1,
    pricePerDay: options.pricePerDay ?? 5_000_000n,
    deposit: 10_000_000n,
    maxDays: 30,
    metadataHash: Uint8Array.from(Buffer.from(hash, "hex")),
    active: options.active ?? true,
    currentRental: PublicKey.default,
    busyUntil: options.busyUntil ?? 0n,
    totalRentals: 0n,
    createdAt: options.createdAt ?? BigInt(Math.floor(Date.now() / 1000)),
  };

  const row = listingToRow(listing, new Date().toISOString());
  db.upsertListing(row);

  if (metadata) {
    db.putMetadata({
      metadata_hash: hash,
      name: metadata.name,
      document: JSON.stringify(metadata),
      lat: metadata.location?.lat ?? null,
      lng: metadata.location?.lng ?? null,
      updated_at: new Date().toISOString(),
    });
  }

  return { listing, row, document: metadata };
}

export function makeRental(overrides: Partial<Rental> = {}): Rental {
  const start = BigInt(Math.floor(Date.now() / 1000));
  return {
    address: Keypair.generate().publicKey,
    listing: Keypair.generate().publicKey,
    owner: Keypair.generate().publicKey,
    renter: Keypair.generate().publicKey,
    rentalId: crypto.getRandomValues(new Uint8Array(32)),
    startTs: start,
    endTs: start + 86_400n,
    days: 1,
    priceTotal: 5_000_000n,
    deposit: 10_000_000n,
    escrow: 15_000_000n,
    status: "Reserved",
    createdAt: start,
    ...overrides,
  };
}

export class FakeChain implements ChainReader {
  snapshotData: ChainSnapshot = { config: null, listings: [], rentals: [] };
  listingReads = new Map<string, Listing | null>();
  rentalReads = new Map<string, Rental | null>();
  configRead: ConfigAccount | null = null;
  fail = false;

  async snapshot(): Promise<ChainSnapshot> {
    if (this.fail) throw new Error("fetch failed: RPC unavailable");
    return this.snapshotData;
  }

  async listing(address: string): Promise<Listing | null> {
    return this.listingReads.get(address) ?? null;
  }

  async rental(address: string): Promise<Rental | null> {
    return this.rentalReads.get(address) ?? null;
  }

  async config(): Promise<ConfigAccount | null> {
    return this.configRead;
  }
}

export interface TestApp {
  db: MirrorDb;
  chain: FakeChain;
  mirror: MirrorService;
  config: BackendConfig;
  url: string;
  close: () => Promise<void>;
}

export async function startTestApp(
  options: { adminToken?: string | null } = {}
): Promise<TestApp> {
  const dir = await tempDir();
  const config = testConfig(dir, {
    adminToken: options.adminToken === undefined ? "test-admin-token" : options.adminToken,
  });
  const db = new MirrorDb(":memory:");
  const audit = new AuditLog(config.auditPath);
  const media = new MediaStore(config.mediaDir, db);
  const chain = new FakeChain();
  const mirror = new MirrorService(db, chain, audit);
  const server: Server = createApp({ config, db, audit, media, mirror, chain });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server did not bind a port");

  return {
    db,
    chain,
    mirror,
    config,
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.close();
    },
  };
}

export { bytesToHex };
