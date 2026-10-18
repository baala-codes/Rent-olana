/**
 * SQLite mirror.
 *
 * The mirror is disposable: everything here can be rebuilt from finalized chain
 * reads. It exists to make discovery, calendars, and order history fast, never
 * to decide whether funds moved. `confirmed_at` records the last time a row was
 * checked against a finalized account; a stale row is "unknown", not "true".
 */

import { DatabaseSync } from "node:sqlite";

import type { ConfigDTO, MediaAsset, NormalizedSearchQuery } from "../../shared/src/api.ts";
import type { RentalStatusName } from "../../clients/ts/contract.ts";

export interface ListingRow {
  address: string;
  owner: string;
  asset_id: string;
  category: number;
  price_per_day: string;
  deposit: string;
  max_days: number;
  metadata_hash: string;
  active: number;
  current_rental: string | null;
  busy_until: number;
  total_rentals: number;
  created_at: number;
  confirmed_at: string | null;
}

export type ListingRowWithMetadata = ListingRow & { metadata_document: string | null };

export interface RentalRow {
  address: string;
  listing: string;
  owner: string;
  renter: string;
  rental_id: string;
  start_ts: number;
  end_ts: number;
  days: number;
  price_total: string;
  deposit: string;
  escrow: string;
  status: RentalStatusName;
  created_at: number;
  confirmed_at: string | null;
}

export interface MetadataRow {
  metadata_hash: string;
  name: string;
  document: string;
  lat: number | null;
  lng: number | null;
  updated_at: string;
}

export interface ConfigRow {
  address: string;
  admin: string;
  treasury: string;
  fee_bps: number;
  paused: number;
  confirmed_at: string | null;
}

const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS listings (
  address TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  category INTEGER NOT NULL,
  price_per_day TEXT NOT NULL,
  deposit TEXT NOT NULL,
  max_days INTEGER NOT NULL,
  metadata_hash TEXT NOT NULL,
  active INTEGER NOT NULL,
  current_rental TEXT,
  busy_until INTEGER NOT NULL,
  total_rentals INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  confirmed_at TEXT
);
CREATE INDEX IF NOT EXISTS listings_category ON listings(category);
CREATE INDEX IF NOT EXISTS listings_busy_until ON listings(busy_until);
CREATE INDEX IF NOT EXISTS listings_owner ON listings(owner);

CREATE TABLE IF NOT EXISTS rentals (
  address TEXT PRIMARY KEY,
  listing TEXT NOT NULL,
  owner TEXT NOT NULL,
  renter TEXT NOT NULL,
  rental_id TEXT NOT NULL,
  start_ts INTEGER NOT NULL,
  end_ts INTEGER NOT NULL,
  days INTEGER NOT NULL,
  price_total TEXT NOT NULL,
  deposit TEXT NOT NULL,
  escrow TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  confirmed_at TEXT
);
CREATE INDEX IF NOT EXISTS rentals_listing ON rentals(listing);
CREATE INDEX IF NOT EXISTS rentals_owner ON rentals(owner);
CREATE INDEX IF NOT EXISTS rentals_renter ON rentals(renter);
CREATE INDEX IF NOT EXISTS rentals_status ON rentals(status);

CREATE TABLE IF NOT EXISTS metadata (
  metadata_hash TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  document TEXT NOT NULL,
  lat REAL,
  lng REAL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS metadata_name ON metadata(name);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  listing TEXT NOT NULL,
  filename TEXT NOT NULL,
  url TEXT NOT NULL,
  content_type TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS media_listing ON media(listing);

CREATE TABLE IF NOT EXISTS config (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  address TEXT NOT NULL,
  admin TEXT NOT NULL,
  treasury TEXT NOT NULL,
  fee_bps INTEGER NOT NULL,
  paused INTEGER NOT NULL,
  confirmed_at TEXT
);

CREATE TABLE IF NOT EXISTS auth_nonces (
  nonce TEXT PRIMARY KEY,
  wallet TEXT NOT NULL,
  seen_at INTEGER NOT NULL
);
`;

export class MirrorDb {
  readonly db: DatabaseSync;

  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec(SCHEMA);
    this.setMeta("schema_version", String(SCHEMA_VERSION));
  }

  close(): void {
    this.db.close();
  }

  // ---------------------------------------------------------------- meta

  getMeta(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare("INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(key, value);
  }

  get lastSyncedAt(): string | null {
    return this.getMeta("last_synced_at");
  }

  set lastSyncedAt(value: string) {
    this.setMeta("last_synced_at", value);
  }

  // ------------------------------------------------------------ listings

  upsertListing(row: ListingRow): void {
    this.db
      .prepare(
        `INSERT INTO listings (
           address, owner, asset_id, category, price_per_day, deposit, max_days,
           metadata_hash, active, current_rental, busy_until, total_rentals,
           created_at, confirmed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(address) DO UPDATE SET
           owner = excluded.owner,
           asset_id = excluded.asset_id,
           category = excluded.category,
           price_per_day = excluded.price_per_day,
           deposit = excluded.deposit,
           max_days = excluded.max_days,
           metadata_hash = excluded.metadata_hash,
           active = excluded.active,
           current_rental = excluded.current_rental,
           busy_until = excluded.busy_until,
           total_rentals = excluded.total_rentals,
           created_at = excluded.created_at,
           confirmed_at = excluded.confirmed_at`
      )
      .run(
        row.address,
        row.owner,
        row.asset_id,
        row.category,
        row.price_per_day,
        row.deposit,
        row.max_days,
        row.metadata_hash,
        row.active,
        row.current_rental,
        row.busy_until,
        row.total_rentals,
        row.created_at,
        row.confirmed_at
      );
  }

  getListing(address: string): ListingRowWithMetadata | null {
    const row = this.db
      .prepare(
        `SELECT l.*, m.document AS metadata_document
           FROM listings l
           LEFT JOIN metadata m ON m.metadata_hash = l.metadata_hash
          WHERE l.address = ?`
      )
      .get(address) as ListingRowWithMetadata | undefined;
    return row ?? null;
  }

  allListingAddresses(): string[] {
    return (this.db.prepare("SELECT address FROM listings").all() as { address: string }[]).map(
      (row) => row.address
    );
  }

  allRentalAddresses(): string[] {
    return (this.db.prepare("SELECT address FROM rentals").all() as { address: string }[]).map(
      (row) => row.address
    );
  }

  deleteListing(address: string): void {
    this.db.prepare("DELETE FROM listings WHERE address = ?").run(address);
    this.db.prepare("DELETE FROM media WHERE listing = ?").run(address);
  }

  listListings(query: NormalizedSearchQuery): { rows: ListingRowWithMetadata[]; total: number } {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (!query.includeInactive) where.push("l.active = 1");
    if (query.category !== null) {
      where.push("l.category = ?");
      params.push(query.category);
    }
    if (query.availableFrom !== null) {
      where.push("l.busy_until <= ?");
      params.push(query.availableFrom);
    }
    if (query.q) {
      where.push("(m.name LIKE ? OR l.address LIKE ? OR l.owner LIKE ? OR l.asset_id LIKE ?)");
      const like = `%${query.q}%`;
      params.push(like, like, like, like);
    }

    const geo = query.lat !== null && query.lng !== null;
    if (geo) {
      // Pre-filter with a bounding box in SQL, refine with haversine in JS.
      const latDelta = query.radiusKm / 111.32;
      const lngDelta = query.radiusKm / (111.32 * Math.max(Math.cos((query.lat! * Math.PI) / 180), 0.01));
      where.push("m.lat IS NOT NULL AND m.lng IS NOT NULL");
      where.push("m.lat BETWEEN ? AND ? AND m.lng BETWEEN ? AND ?");
      params.push(query.lat! - latDelta, query.lat! + latDelta, query.lng! - lngDelta, query.lng! + lngDelta);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const from = `FROM listings l LEFT JOIN metadata m ON m.metadata_hash = l.metadata_hash ${whereSql}`;

    const totalRow = this.db.prepare(`SELECT COUNT(*) AS count ${from}`).get(...params) as {
      count: number;
    };

    if (geo) {
      // Distance ordering needs the whole candidate set; cap it so a bad query
      // cannot make the backend scan without bound.
      const rows = this.db
        .prepare(`SELECT l.*, m.document AS metadata_document, m.lat AS lat, m.lng AS lng ${from} LIMIT 2000`)
        .all(...params) as unknown as (ListingRowWithMetadata & { lat: number; lng: number })[];

      const withDistance = rows
        .map((row) => ({ row, distanceKm: haversineKm(query.lat!, query.lng!, row.lat, row.lng) }))
        .filter((entry) => entry.distanceKm <= query.radiusKm);

      const sorted = sortListings(
        withDistance.map((entry) => entry.row),
        query,
        new Map(withDistance.map((entry) => [entry.row.address, entry.distanceKm]))
      );

      return {
        rows: sorted.slice(query.offset, query.offset + query.limit),
        total: sorted.length,
      };
    }

    const orderParams: string[] = [];
    const order = orderSql(query, orderParams);
    const rows = this.db
      .prepare(`SELECT l.*, m.document AS metadata_document ${from} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .all(...params, ...orderParams, query.limit, query.offset) as unknown as ListingRowWithMetadata[];

    return { rows, total: totalRow.count };
  }

  // ------------------------------------------------------------- rentals

  upsertRental(row: RentalRow): void {
    this.db
      .prepare(
        `INSERT INTO rentals (
           address, listing, owner, renter, rental_id, start_ts, end_ts, days,
           price_total, deposit, escrow, status, created_at, confirmed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(address) DO UPDATE SET
           listing = excluded.listing,
           owner = excluded.owner,
           renter = excluded.renter,
           rental_id = excluded.rental_id,
           start_ts = excluded.start_ts,
           end_ts = excluded.end_ts,
           days = excluded.days,
           price_total = excluded.price_total,
           deposit = excluded.deposit,
           escrow = excluded.escrow,
           status = excluded.status,
           created_at = excluded.created_at,
           confirmed_at = excluded.confirmed_at`
      )
      .run(
        row.address,
        row.listing,
        row.owner,
        row.renter,
        row.rental_id,
        row.start_ts,
        row.end_ts,
        row.days,
        row.price_total,
        row.deposit,
        row.escrow,
        row.status,
        row.created_at,
        row.confirmed_at
      );
  }

  getRental(address: string): RentalRow | null {
    return (
      (this.db.prepare("SELECT * FROM rentals WHERE address = ?").get(address) as
        | RentalRow
        | undefined) ?? null
    );
  }

  deleteRental(address: string): void {
    this.db.prepare("DELETE FROM rentals WHERE address = ?").run(address);
  }

  listRentals(filters: {
    owner?: string;
    renter?: string;
    status?: string;
    listing?: string;
    limit: number;
    offset: number;
  }): { rows: (RentalRow & { listing_name: string | null; listing_category: number | null })[]; total: number } {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (filters.owner) {
      where.push("r.owner = ?");
      params.push(filters.owner);
    }
    if (filters.renter) {
      where.push("r.renter = ?");
      params.push(filters.renter);
    }
    if (filters.status) {
      where.push("r.status = ?");
      params.push(filters.status);
    }
    if (filters.listing) {
      where.push("r.listing = ?");
      params.push(filters.listing);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const from = `FROM rentals r
      LEFT JOIN listings l ON l.address = r.listing
      LEFT JOIN metadata m ON m.metadata_hash = l.metadata_hash
      ${whereSql}`;

    const total = (
      this.db.prepare(`SELECT COUNT(*) AS count ${from}`).get(...params) as { count: number }
    ).count;

    const rows = this.db
      .prepare(
        `SELECT r.*, m.name AS listing_name, l.category AS listing_category
           ${from}
           ORDER BY r.created_at DESC LIMIT ? OFFSET ?`
      )
      .all(...params, filters.limit, filters.offset) as unknown as (RentalRow & {
      listing_name: string | null;
      listing_category: number | null;
    })[];

    return { rows, total };
  }

  // ------------------------------------------------------------ metadata

  putMetadata(row: MetadataRow): void {
    this.db
      .prepare(
        `INSERT INTO metadata(metadata_hash, name, document, lat, lng, updated_at)
         VALUES(?, ?, ?, ?, ?, ?)
         ON CONFLICT(metadata_hash) DO UPDATE SET
           name = excluded.name,
           document = excluded.document,
           lat = excluded.lat,
           lng = excluded.lng,
           updated_at = excluded.updated_at`
      )
      .run(row.metadata_hash, row.name, row.document, row.lat, row.lng, row.updated_at);
  }

  getMetadata(hash: string): MetadataRow | null {
    return (
      (this.db.prepare("SELECT * FROM metadata WHERE metadata_hash = ?").get(hash) as
        | MetadataRow
        | undefined) ?? null
    );
  }

  // --------------------------------------------------------------- media

  putMedia(media: MediaAsset & { filename: string; listing: string }): void {
    this.db
      .prepare(
        `INSERT INTO media(id, listing, filename, url, content_type, bytes, sha256, created_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           url = excluded.url,
           content_type = excluded.content_type,
           bytes = excluded.bytes,
           sha256 = excluded.sha256`
      )
      .run(
        media.id,
        media.listing,
        media.filename,
        media.url,
        media.contentType,
        media.bytes,
        media.sha256,
        media.createdAt
      );
  }

  listMedia(listing: string): MediaAsset[] {
    const rows = this.db
      .prepare("SELECT * FROM media WHERE listing = ? ORDER BY created_at DESC")
      .all(listing) as {
      id: string;
      url: string;
      content_type: string;
      bytes: number;
      sha256: string;
      created_at: string;
    }[];
    return rows.map((row) => ({
      id: row.id,
      url: row.url,
      contentType: row.content_type,
      bytes: row.bytes,
      sha256: row.sha256,
      createdAt: row.created_at,
    }));
  }

  mediaByFilename(filename: string): { filename: string; content_type: string } | null {
    return (
      (this.db.prepare("SELECT filename, content_type FROM media WHERE filename = ?").get(filename) as
        | { filename: string; content_type: string }
        | undefined) ?? null
    );
  }

  // -------------------------------------------------------------- config

  getConfig(): ConfigDTO | null {
    const row = this.db.prepare("SELECT * FROM config WHERE singleton = 1").get() as
      | ConfigRow
      | undefined;
    if (!row) return null;
    return {
      address: row.address,
      admin: row.admin,
      treasury: row.treasury,
      feeBps: row.fee_bps,
      paused: row.paused === 1,
    };
  }

  putConfig(row: ConfigRow): void {
    this.db
      .prepare(
        `INSERT INTO config(singleton, address, admin, treasury, fee_bps, paused, confirmed_at)
         VALUES(1, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(singleton) DO UPDATE SET
           address = excluded.address,
           admin = excluded.admin,
           treasury = excluded.treasury,
           fee_bps = excluded.fee_bps,
           paused = excluded.paused,
           confirmed_at = excluded.confirmed_at`
      )
      .run(row.address, row.admin, row.treasury, row.fee_bps, row.paused, row.confirmed_at);
  }

  deleteConfig(): void {
    this.db.prepare("DELETE FROM config WHERE singleton = 1").run();
  }

  // --------------------------------------------------------------- nonce

  /** Insert a nonce; returns false when it was already used (replay). */
  useNonce(nonce: string, wallet: string, seenAt: number): boolean {
    const existing = this.db.prepare("SELECT 1 FROM auth_nonces WHERE nonce = ?").get(nonce);
    if (existing) return false;
    this.db
      .prepare("INSERT INTO auth_nonces(nonce, wallet, seen_at) VALUES(?, ?, ?)")
      .run(nonce, wallet, seenAt);
    this.db.prepare("DELETE FROM auth_nonces WHERE seen_at < ?").run(seenAt - 86_400);
    return true;
  }

  // --------------------------------------------------------------- counts

  counts(): { listings: number; rentals: number } {
    return {
      listings: (this.db.prepare("SELECT COUNT(*) AS c FROM listings").get() as { c: number }).c,
      rentals: (this.db.prepare("SELECT COUNT(*) AS c FROM rentals").get() as { c: number }).c,
    };
  }
}

// -------------------------------------------------------------- helpers

function orderSql(query: NormalizedSearchQuery, params: string[]): string {
  switch (query.sort) {
    case "price":
      return "CAST(l.price_per_day AS INTEGER) ASC, l.created_at DESC";
    case "newest":
      return "l.created_at DESC";
    case "relevance":
    default:
      if (query.q) {
        // Prefix matches first, then newest. The prefix is bound here (the
        // caller passes `params` through after the WHERE parameters).
        params.push(`${query.q}%`);
        return "CASE WHEN m.name LIKE ? THEN 0 ELSE 1 END, l.created_at DESC";
      }
      return "l.created_at DESC";
  }
}

function sortListings(
  rows: ListingRowWithMetadata[],
  query: NormalizedSearchQuery,
  distance: Map<string, number>
): ListingRowWithMetadata[] {
  const copy = [...rows];
  if (query.sort === "price") {
    return copy.sort((a, b) => Number(a.price_per_day) - Number(b.price_per_day));
  }
  if (query.sort === "newest") {
    return copy.sort((a, b) => b.created_at - a.created_at);
  }
  // Relevance with a location means nearest first.
  return copy.sort((a, b) => (distance.get(a.address) ?? 0) - (distance.get(b.address) ?? 0));
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (value: number): number => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

