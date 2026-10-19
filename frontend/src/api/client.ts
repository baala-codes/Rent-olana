/**
 * Backend API client for the portal.
 *
 * The backend is the discovery layer (search, geo, metadata, media) and never
 * decides fund movement. Reads are public; metadata and media writes are signed
 * by the connected wallet using the same canonical message the backend verifies.
 *
 * If the backend is unreachable the portal falls back to direct RPC reads, so a
 * static deployment still works for booking and settlement.
 */

import { PublicKey } from "@solana/web3.js";

import type { Listing, Rental, ConfigAccount } from "../solana/accounts";
import { categoryLabel } from "../solana/constants";
import type { AssetMetadata } from "../metadata/store";
import type {
  ListingDTO,
  MetadataDocument,
  NormalizedSearchQuery,
  RentalDTO,
  SearchQuery,
} from "@shared";

const RAW_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
const DISABLED = RAW_BASE === "off" || RAW_BASE === "false";

export const apiBase = DISABLED ? null : (RAW_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
export const backendEnabled = apiBase !== null;

export class BackendError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "BackendError";
  }
}

export interface WalletSigner {
  publicKey: PublicKey;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
}

export interface BackendSnapshot {
  config: ConfigAccount | null;
  listings: Listing[];
  rentals: Rental[];
  metadata: Record<string, AssetMetadata>;
}

export interface ListingSearchResult {
  listings: Listing[];
  total: number;
  query: NormalizedSearchQuery;
}

// ------------------------------------------------------------------ helpers

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(bytes: Uint8Array): string {
  let number = 0n;
  for (const byte of bytes) number = number * 256n + BigInt(byte);
  let out = "";
  while (number > 0n) {
    out = BASE58[Number(number % 58n)] + out;
    number /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = `1${out}`;
  }
  return out;
}

const hexToBytes = (hex: string): Uint8Array => {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error(`invalid 32-byte hex: ${hex}`);
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const big = (value: string | number): bigint => BigInt(value);

async function digestHex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
  return bytesToHex(new Uint8Array(digest));
}

/** Absolute media URL: the backend stores relative `/media/...` paths. */
export function resolveMediaUrl(url: string): string {
  if (!url.startsWith("/") || !apiBase) return url;
  return `${apiBase}${url}`;
}

export function dtoToListing(dto: ListingDTO): Listing {
  return {
    address: new PublicKey(dto.address),
    owner: new PublicKey(dto.owner),
    assetId: hexToBytes(dto.assetId),
    category: dto.category,
    pricePerDay: big(dto.pricePerDay),
    deposit: big(dto.deposit),
    maxDays: dto.maxDays,
    metadataHash: hexToBytes(dto.metadataHash),
    active: dto.active,
    currentRental: dto.currentRental ? new PublicKey(dto.currentRental) : PublicKey.default,
    busyUntil: big(dto.busyUntil),
    totalRentals: big(dto.totalRentals),
    createdAt: big(dto.createdAt),
  };
}

export function dtoToRental(dto: RentalDTO): Rental {
  return {
    address: new PublicKey(dto.address),
    listing: new PublicKey(dto.listing),
    owner: new PublicKey(dto.owner),
    renter: new PublicKey(dto.renter),
    rentalId: hexToBytes(dto.rentalId),
    startTs: big(dto.startTs),
    endTs: big(dto.endTs),
    days: dto.days,
    priceTotal: big(dto.priceTotal),
    deposit: big(dto.deposit),
    escrow: big(dto.escrow),
    status: dto.status,
    createdAt: big(dto.createdAt),
  };
}

function metadataFromDto(dto: ListingDTO): AssetMetadata | null {
  if (!dto.metadata) return null;
  const document: MetadataDocument = {
    ...dto.metadata,
    // Prefer the backend's content-addressed media when the document has no
    // image URLs of its own.
    images:
      dto.metadata.images.length > 0
        ? dto.metadata.images
        : dto.media.map((asset) => resolveMediaUrl(asset.url)),
  };
  return {
    ...document,
    name: document.name || categoryLabel(dto.category),
    metadataHash: dto.metadataHash.toLowerCase(),
    updatedAt: dto.confirmedAt ?? new Date().toISOString(),
  };
}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 3_500): Promise<T> {
  if (!apiBase) throw new BackendError(0, "disabled", "backend integration is disabled");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${apiBase}${path}`, { ...init, signal: controller.signal });
    if (!response.ok) {
      let code = "http_error";
      let message = `HTTP ${response.status}`;
      try {
        const body = (await response.json()) as { error?: { code?: string; message?: string } };
        code = body.error?.code ?? code;
        message = body.error?.message ?? message;
      } catch {
        // Non-JSON error body; keep the status text.
      }
      throw new BackendError(response.status, code, message);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------------- reads

export async function fetchSnapshot(): Promise<BackendSnapshot> {
  const [configBody, listingBody, rentalBody] = await Promise.all([
    request<{ config: { address: string; admin: string; treasury: string; feeBps: number; paused: boolean } | null }>(
      "/v1/config"
    ),
    request<{ results: ListingDTO[] }>("/v1/listings?includeInactive=true&limit=200&sort=newest"),
    request<{ results: RentalDTO[] }>("/v1/rentals?limit=200"),
  ]);

  const listings = listingBody.results.map(dtoToListing);
  const metadata: Record<string, AssetMetadata> = {};
  for (const dto of listingBody.results) {
    const doc = metadataFromDto(dto);
    if (doc) metadata[doc.metadataHash] = doc;
  }

  return {
    config: configBody.config
      ? {
          address: new PublicKey(configBody.config.address),
          admin: new PublicKey(configBody.config.admin),
          treasury: new PublicKey(configBody.config.treasury),
          feeBps: configBody.config.feeBps,
          paused: configBody.config.paused,
        }
      : null,
    listings,
    rentals: rentalBody.results.map(dtoToRental),
    metadata,
  };
}

export async function searchListings(query: SearchQuery): Promise<ListingSearchResult> {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.category !== undefined) params.set("category", String(query.category));
  if (query.lat !== undefined && query.lng !== undefined) {
    params.set("lat", String(query.lat));
    params.set("lng", String(query.lng));
  }
  if (query.radiusKm !== undefined) params.set("radiusKm", String(query.radiusKm));
  if (query.availableFrom !== undefined) params.set("availableFrom", String(query.availableFrom));
  if (query.days !== undefined) params.set("days", String(query.days));
  if (query.includeInactive) params.set("includeInactive", "1");
  params.set("sort", query.sort ?? "relevance");
  params.set("limit", String(query.limit ?? 100));
  params.set("offset", String(query.offset ?? 0));

  const body = await request<{
    results: ListingDTO[];
    total: number;
    query: NormalizedSearchQuery;
  }>(`/v1/listings?${params.toString()}`);
  return {
    listings: body.results.map(dtoToListing),
    total: body.total,
    query: body.query,
  };
}

// ------------------------------------------------------------------ writes

async function signedHeaders(
  signer: WalletSigner,
  method: string,
  path: string,
  body: Uint8Array
): Promise<Record<string, string>> {
  if (!signer.signMessage) {
    throw new BackendError(0, "unsupported_wallet", "this wallet cannot sign messages");
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const message = [
    "asset-rental:v1",
    method.toUpperCase(),
    path,
    await digestHex(body),
    String(issuedAt),
    nonce,
  ].join("\n");
  const signature = await signer.signMessage(new TextEncoder().encode(message));
  return {
    "x-wallet": signer.publicKey.toBase58(),
    "x-issued-at": String(issuedAt),
    "x-nonce": nonce,
    "x-signature": base58Encode(signature),
  };
}

/** Store the document only if its canonical hash matches the on-chain commitment. */
export async function putMetadata(
  address: string,
  document: MetadataDocument,
  signer: WalletSigner
): Promise<{ metadataHash: string }> {
  const path = `/v1/listings/${address}/metadata`;
  const body = new TextEncoder().encode(JSON.stringify({ document }));
  const headers = {
    ...(await signedHeaders(signer, "PUT", path, body)),
    "content-type": "application/json",
  };
  return request<{ metadataHash: string }>(path, {
    method: "PUT",
    headers,
    body: body as unknown as BodyInit,
  });
}

/** Upload a raw image; the backend content-addresses and indexes it. */
export async function uploadMedia(
  address: string,
  file: File,
  signer: WalletSigner
): Promise<{ asset: { url: string; sha256: string; contentType: string; bytes: number } }> {
  const path = `/v1/listings/${address}/media`;
  const body = new Uint8Array(await file.arrayBuffer());
  const headers = {
    ...(await signedHeaders(signer, "POST", path, body)),
    "content-type": file.type || "application/octet-stream",
  };
  return request<{ asset: { url: string; sha256: string; contentType: string; bytes: number } }>(
    path,
    { method: "POST", headers, body: body as unknown as BodyInit }
  );
}
