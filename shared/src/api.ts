/**
 * Portal <-> backend contract.
 *
 * Solana is the source of truth for funds and rental state; these payloads are
 * the off-chain view (search, metadata, media, mirror) and are allowed to be
 * stale or missing. Nothing here may be treated as proof that a rental settled
 * or that a payment happened — re-read the chain for that.
 *
 * Lamports cross the wire as decimal strings so JavaScript numbers can never
 * round them; timestamps are Unix seconds.
 */

import type { RentalStatusName } from "../../clients/ts/contract";
import type { MetadataDocument } from "./metadata";

export type Lamports = string;
export type UnixSeconds = number;

export interface MediaAsset {
  id: string;
  url: string;
  contentType: string;
  bytes: number;
  sha256: string;
  createdAt: string;
}

export interface ListingDTO {
  address: string;
  owner: string;
  assetId: string;
  category: number;
  categoryLabel: string;
  pricePerDay: Lamports;
  deposit: Lamports;
  maxDays: number;
  metadataHash: string;
  active: boolean;
  /** `null` when the listing has no open rental. */
  currentRental: string | null;
  /** Unix seconds; the earliest start a new booking may use. */
  busyUntil: UnixSeconds;
  totalRentals: number;
  createdAt: UnixSeconds;
  metadata: MetadataDocument | null;
  media: MediaAsset[];
  /** When the mirror last confirmed this row against a finalized chain read. */
  confirmedAt: string | null;
}

export interface RentalDTO {
  address: string;
  listing: string;
  owner: string;
  renter: string;
  rentalId: string;
  startTs: UnixSeconds;
  endTs: UnixSeconds;
  days: number;
  priceTotal: Lamports;
  deposit: Lamports;
  escrow: Lamports;
  status: RentalStatusName;
  createdAt: UnixSeconds;
  /** Search/list display conveniences; may be absent if the listing is unknown. */
  listingCategory?: number;
  listingName?: string | null;
  confirmedAt: string | null;
}

export interface ConfigDTO {
  address: string;
  admin: string;
  treasury: string;
  feeBps: number;
  paused: boolean;
}

export interface SearchQuery {
  q?: string;
  category?: number;
  /** Both lat and lng are required for a radius search. */
  lat?: number;
  lng?: number;
  radiusKm?: number;
  /** Only listings free at or after this Unix timestamp. */
  availableFrom?: UnixSeconds;
  /** Booking length used with `availableFrom` (1..MAX_DAYS). */
  days?: number;
  includeInactive?: boolean;
  sort?: "newest" | "price" | "relevance";
  limit?: number;
  offset?: number;
}

export interface NormalizedSearchQuery {
  q: string;
  category: number | null;
  lat: number | null;
  lng: number | null;
  radiusKm: number;
  availableFrom: number | null;
  days: number;
  includeInactive: boolean;
  sort: NonNullable<SearchQuery["sort"]>;
  limit: number;
  offset: number;
}

export interface SearchResponse {
  results: ListingDTO[];
  total: number;
  limit: number;
  offset: number;
  query: NormalizedSearchQuery;
}

export interface ApiIssue {
  field: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code:
      | "bad_request"
      | "unauthorized"
      | "not_found"
      | "conflict"
      | "rate_limited"
      | "upstream_unavailable"
      | "internal";
    message: string;
    issues?: ApiIssue[];
  };
}

export interface HealthResponse {
  ok: boolean;
  version: string;
  cluster: string;
  programId: string;
  rpcConfigured: boolean;
  mirror: {
    listings: number;
    rentals: number;
    lastSyncedAt: string | null;
  };
}

export interface SyncReport {
  startedAt: string;
  finishedAt: string;
  listings: { seen: number; upserted: number; removed: number };
  rentals: { seen: number; upserted: number; removed: number };
  config: "created" | "updated" | "unchanged" | "missing";
  auditEvents: number;
}

export interface ReconcileReport {
  checkedAt: string;
  listings: ReconcileSection;
  rentals: ReconcileSection;
  config: "confirmed" | "missing" | "mismatched";
}

export interface ReconcileSection {
  checked: number;
  confirmed: number;
  updated: number;
  removed: number;
  /** Addresses where the mirror disagreed with the finalized account. */
  mismatched: string[];
}

export interface AuditEvent {
  at: string;
  kind:
    | "listing.registered"
    | "listing.updated"
    | "listing.closed"
    | "rental.created"
    | "rental.settled"
    | "rental.cancelled"
    | "rental.disputed"
    | "rental.resolved"
    | "config.updated"
    | "mirror.reconciled"
    | "media.stored"
    | "metadata.stored";
  subject: string;
  wallet?: string;
  detail?: Record<string, string | number | boolean | null>;
}

export interface MetadataWriteRequest {
  document: MetadataDocument;
}

export interface MetadataWriteResponse {
  metadataHash: string;
  document: MetadataDocument;
}
