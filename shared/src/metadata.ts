/**
 * Off-chain asset metadata and its on-chain commitment.
 *
 * The program stores only a 32-byte `metadata_hash` plus a category code. The
 * human-readable document (name, description, photo URLs, coarse location) is
 * kept off-chain, and `metadata_hash` is the SHA-256 of its **canonical JSON**
 * encoding. Because the encoding is fixed, the same document always commits to
 * the same bytes, so anyone holding the document can verify it against the
 * chain.
 *
 * This module is the single implementation of that commitment: the portal uses
 * it before `register_asset`, and the backend recomputes it before storing a
 * document or accepting a media upload. It uses Web Crypto, so it runs in the
 * browser and in Node without a polyfill.
 */

import { MAX_CATEGORY } from "../../clients/ts/contract";

export interface MetadataLocation {
  /** Human label such as "Shoreditch, London". Never a street address. */
  label?: string;
  /** Coarse latitude, for the discovery radius search. */
  lat?: number | null;
  /** Coarse longitude. */
  lng?: number | null;
}

export interface MetadataInput {
  name: string;
  description?: string;
  category?: number;
  location?: MetadataLocation | null;
  images?: string[];
}

/** The normalised document that is actually hashed and stored. */
export interface MetadataDocument {
  name: string;
  description: string;
  category: number;
  location: { label: string; lat: number | null; lng: number | null } | null;
  images: string[];
}

export const METADATA_LIMITS = {
  name: 120,
  description: 2_000,
  images: 8,
  imageUrl: 500,
  locationLabel: 120,
} as const;

/**
 * Canonical JSON: fixed key order, trimmed strings, `null` for absent
 * coordinates. Never change this without versioning the commitment — every
 * listing already on chain commits to these exact bytes.
 */
export function canonicalMetadata(input: MetadataInput): string {
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

/** SHA-256 of the canonical document, as 64 lowercase hex characters. */
export async function metadataHashHex(input: MetadataInput): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalMetadata(input));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const value = hex.trim().toLowerCase();
  if (value.length !== 64 || !/^[0-9a-f]+$/.test(value)) {
    throw new Error("metadata hash must be 64 lowercase hex characters");
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) out[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export interface ValidationIssue {
  field: string;
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

/** Validate and normalise a metadata document. */
export function validateMetadata(input: unknown): ValidationResult<MetadataDocument> {
  const issues: ValidationIssue[] = [];
  const record = (input ?? {}) as Record<string, unknown>;

  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (name.length === 0) issues.push({ field: "name", message: "name is required" });
  if (name.length > METADATA_LIMITS.name) {
    issues.push({ field: "name", message: `name must be at most ${METADATA_LIMITS.name} characters` });
  }

  const description =
    typeof record.description === "string" ? record.description.trim() : "";
  if (description.length > METADATA_LIMITS.description) {
    issues.push({
      field: "description",
      message: `description must be at most ${METADATA_LIMITS.description} characters`,
    });
  }

  const category = record.category === undefined ? 0 : record.category;
  if (
    typeof category !== "number" ||
    !Number.isInteger(category) ||
    category < 0 ||
    category > MAX_CATEGORY
  ) {
    issues.push({ field: "category", message: `category must be an integer in [0, ${MAX_CATEGORY}]` });
  }

  const imagesInput = record.images === undefined ? [] : record.images;
  const images: string[] = [];
  if (!Array.isArray(imagesInput)) {
    issues.push({ field: "images", message: "images must be an array of URLs" });
  } else {
    if (imagesInput.length > METADATA_LIMITS.images) {
      issues.push({ field: "images", message: `at most ${METADATA_LIMITS.images} images` });
    }
    for (const [index, value] of imagesInput.entries()) {
      if (typeof value !== "string" || !isHttpUrl(value)) {
        issues.push({ field: `images[${index}]`, message: "image must be an http(s) URL" });
      } else if (value.length > METADATA_LIMITS.imageUrl) {
        issues.push({ field: `images[${index}]`, message: "image URL is too long" });
      } else {
        images.push(value);
      }
    }
  }

  let location: MetadataDocument["location"] = null;
  const locationInput = record.location;
  if (locationInput !== undefined && locationInput !== null) {
    if (typeof locationInput !== "object") {
      issues.push({ field: "location", message: "location must be an object or null" });
    } else {
      const loc = locationInput as Record<string, unknown>;
      const label = typeof loc.label === "string" ? loc.label.trim() : "";
      if (label.length > METADATA_LIMITS.locationLabel) {
        issues.push({ field: "location.label", message: "location label is too long" });
      }
      const coordinate = (value: unknown, min: number, max: number, field: string): number | null => {
        if (value === undefined || value === null) return null;
        if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
          issues.push({ field, message: `${field} must be between ${min} and ${max}` });
          return null;
        }
        return value;
      };
      const lat = coordinate(loc.lat, -90, 90, "location.lat");
      const lng = coordinate(loc.lng, -180, 180, "location.lng");
      location = { label, lat, lng };
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    value: {
      name,
      description,
      category: category as number,
      location,
      images,
    },
  };
}

/** Normalise an already-validated document into the hash input shape. */
export function documentToInput(document: MetadataDocument): MetadataInput {
  return {
    name: document.name,
    description: document.description,
    category: document.category,
    location: document.location,
    images: document.images,
  };
}
