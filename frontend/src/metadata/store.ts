/**
 * Off-chain asset metadata storage (browser side).
 *
 * The commitment itself — canonical JSON + SHA-256 — lives in
 * `@asset-rental/shared`, the same code the backend uses, so a document stored
 * here and a document verified there hash identically. This file only adds
 * `localStorage` persistence.
 *
 * The program stores just the 32-byte `metadata_hash` and a category; the
 * human-readable document stays off-chain. Because the encoding is canonical,
 * the same document always commits to the same hash and can be checked against
 * the chain.
 */

import {
  canonicalMetadata,
  hexToBytes,
  metadataHashHex,
  validateMetadata,
  bytesToHex,
  type MetadataDocument,
  type MetadataInput,
  type MetadataLocation,
} from "@shared";

export type { MetadataDocument, MetadataInput, MetadataLocation };

/** A stored document plus the commitment written on chain. */
export interface AssetMetadata extends MetadataDocument {
  /** Lowercase hex SHA-256 of the canonical document (the on-chain commit). */
  metadataHash: string;
  updatedAt: string;
}

const STORAGE_KEY = "rent-olana:metadata:v1";

/** Hex helper kept for callers that hold raw bytes. */
export const hashToHex = bytesToHex;

export { hexToBytes, canonicalMetadata };

/** SHA-256 of the canonical document, as 64 hex characters (32 bytes). */
export const computeMetadataHash = metadataHashHex;

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

/**
 * Validate, canonicalise, hash, and store a document.
 *
 * Throws on an invalid document rather than storing something whose hash the
 * caller might still write on chain — a listing must never point at a document
 * the backend would reject.
 */
export async function saveMetadata(input: MetadataInput): Promise<AssetMetadata> {
  const validation = validateMetadata(input);
  if (!validation.ok) {
    throw new Error(
      validation.issues.map((issue) => `${issue.field}: ${issue.message}`).join("; ")
    );
  }

  const document = validation.value;
  const hash = await metadataHashHex(document);
  const record: AssetMetadata = {
    ...document,
    metadataHash: hash,
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
