/**
 * Off-chain asset metadata.
 *
 * The program stores only a 32-byte `metadata_hash` commitment and a category
 * code; the human-readable document (name, description, photo, location) lives
 * off-chain. This POC keeps that document in the browser's `localStorage`,
 * keyed by the SHA-256 of a canonical JSON encoding — which is exactly the
 * value written on-chain as `metadata_hash`, so a listing's document can be
 * verified against the chain.
 *
 * A production build would put this behind the provider backend / object
 * storage; the commitment, not the storage, is what the contract fixes.
 */

export interface AssetMetadata {
  /** Lowercase hex SHA-256 of the canonical document (the on-chain commit). */
  metadataHash: string;
  name: string;
  description: string;
  category: number;
  location: MetadataLocation | null;
  images: string[];
  updatedAt: string;
}

export interface MetadataLocation {
  label?: string;
  lat?: number;
  lng?: number;
}

/** The user-editable part of a metadata document. */
export interface MetadataInput {
  name: string;
  description?: string;
  category?: number;
  location?: MetadataLocation | null;
  images?: string[];
}

const STORAGE_KEY = "rent-olana:metadata:v1";

export const hashToHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("hex string must have even length");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * Canonical JSON for hashing. Key order is fixed here (not left to the
 * engine) so the same document always hashes to the same commitment.
 */
export function canonicalDocument(input: MetadataInput): string {
  const location = input.location
    ? {
        label: input.location.label?.trim() ?? "",
        lat: input.location.lat ?? null,
        lng: input.location.lng ?? null,
      }
    : null;
  return JSON.stringify({
    name: input.name.trim(),
    description: (input.description ?? "").trim(),
    category: input.category ?? 0,
    location,
    images: input.images ?? [],
  });
}

/** SHA-256 of the canonical document, as 64 hex characters (32 bytes). */
export async function computeMetadataHash(input: MetadataInput): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalDocument(input));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return hashToHex(new Uint8Array(digest));
}

// ------------------------------------------------------------------ storage

function readAll(): Record<string, AssetMetadata> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, AssetMetadata>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, AssetMetadata>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage can be unavailable (private mode); the app still works, minus names.
  }
}

export function getMetadataMany(hashes: string[]): Record<string, AssetMetadata> {
  const all = readAll();
  const out: Record<string, AssetMetadata> = {};
  for (const hash of hashes) {
    const record = all[hash.toLowerCase()];
    if (record) out[hash.toLowerCase()] = record;
  }
  return out;
}

export function getMetadata(hash: string): AssetMetadata | undefined {
  return readAll()[hash.toLowerCase()];
}

/** Compute the commitment for `input`, store the document, and return it. */
export async function saveMetadata(input: MetadataInput): Promise<AssetMetadata> {
  const hash = await computeMetadataHash(input);
  const record: AssetMetadata = {
    metadataHash: hash,
    name: input.name.trim(),
    description: (input.description ?? "").trim(),
    category: input.category ?? 0,
    location: input.location ?? null,
    images: input.images ?? [],
    updatedAt: new Date().toISOString(),
  };
  const all = readAll();
  all[hash] = record;
  writeAll(all);
  return record;
}

export function removeMetadata(hash: string): void {
  const all = readAll();
  delete all[hash.toLowerCase()];
  writeAll(all);
}

/** Every document this browser knows, newest first (for diagnostics). */
export function listMetadata(): AssetMetadata[] {
  return Object.values(readAll()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
