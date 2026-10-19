/**
 * Mirror synchronisation and reconciliation.
 *
 * `sync()` pulls the whole program state and upserts it; `reconcile()` re-reads
 * each mirrored account individually and corrects (or removes) it. Both write an
 * audit event for every observed transition. Neither moves funds.
 *
 * The mirror is disposable: a delete here is only a cache eviction. Solana stays
 * the source of truth, and `confirmed_at` tells the portal how fresh a row is.
 */

import { PublicKey } from "@solana/web3.js";

import { categoryLabel } from "../../clients/ts/contract.ts";
import type { ConfigAccount, Listing, Rental } from "../../clients/ts/wire.ts";
import type {
  AuditEvent,
  ListingDTO,
  MediaAsset,
  ReconcileReport,
  RentalDTO,
  SyncReport,
} from "../../shared/src/index.ts";
import type { AuditLog } from "./audit.ts";
import type { ChainReader } from "./chain.ts";
import type { ListingRow, ListingRowWithMetadata, MirrorDb, RentalRow } from "./db.ts";
import type { Notifier } from "./notifications.ts";

const iso = (clock: () => Date): string => clock().toISOString();

export function listingToRow(listing: Listing, confirmedAt: string): ListingRow {
  return {
    address: listing.address.toBase58(),
    owner: listing.owner.toBase58(),
    asset_id: Buffer.from(listing.assetId).toString("hex"),
    category: listing.category,
    price_per_day: listing.pricePerDay.toString(),
    deposit: listing.deposit.toString(),
    max_days: listing.maxDays,
    metadata_hash: Buffer.from(listing.metadataHash).toString("hex"),
    active: listing.active ? 1 : 0,
    current_rental: listing.currentRental.equals(PublicKey.default)
      ? null
      : listing.currentRental.toBase58(),
    busy_until: Number(listing.busyUntil),
    total_rentals: Number(listing.totalRentals),
    created_at: Number(listing.createdAt),
    confirmed_at: confirmedAt,
  };
}

export function rentalToRow(rental: Rental, confirmedAt: string): RentalRow {
  return {
    address: rental.address.toBase58(),
    listing: rental.listing.toBase58(),
    owner: rental.owner.toBase58(),
    renter: rental.renter.toBase58(),
    rental_id: Buffer.from(rental.rentalId).toString("hex"),
    start_ts: Number(rental.startTs),
    end_ts: Number(rental.endTs),
    days: rental.days,
    price_total: rental.priceTotal.toString(),
    deposit: rental.deposit.toString(),
    escrow: rental.escrow.toString(),
    status: rental.status,
    created_at: Number(rental.createdAt),
    confirmed_at: confirmedAt,
  };
}

export function rowToListingDTO(
  row: ListingRowWithMetadata,
  media: MediaAsset[]
): ListingDTO {
  let metadata = null;
  if (row.metadata_document) {
    try {
      metadata = JSON.parse(row.metadata_document);
    } catch {
      metadata = null;
    }
  }
  return {
    address: row.address,
    owner: row.owner,
    assetId: row.asset_id,
    category: row.category,
    categoryLabel: categoryLabel(row.category),
    pricePerDay: row.price_per_day,
    deposit: row.deposit,
    maxDays: row.max_days,
    metadataHash: row.metadata_hash,
    active: row.active === 1,
    currentRental: row.current_rental,
    busyUntil: row.busy_until,
    totalRentals: row.total_rentals,
    createdAt: row.created_at,
    metadata,
    media,
    confirmedAt: row.confirmed_at,
  };
}

export function rowToRentalDTO(
  row: RentalRow & { listing_name?: string | null; listing_category?: number | null }
): RentalDTO {
  return {
    address: row.address,
    listing: row.listing,
    owner: row.owner,
    renter: row.renter,
    rentalId: row.rental_id,
    startTs: row.start_ts,
    endTs: row.end_ts,
    days: row.days,
    priceTotal: row.price_total,
    deposit: row.deposit,
    escrow: row.escrow,
    status: row.status,
    createdAt: row.created_at,
    listingCategory: row.listing_category ?? undefined,
    listingName: row.listing_name ?? null,
    confirmedAt: row.confirmed_at,
  };
}

const rentalEvent = (status: Rental["status"]): AuditEvent["kind"] | null => {
  switch (status) {
    case "Completed":
      return "rental.settled";
    case "Cancelled":
      return "rental.cancelled";
    case "Disputed":
      return "rental.disputed";
    case "Resolved":
      return "rental.resolved";
    default:
      return null;
  }
};

const sameListing = (a: ListingRow, b: ListingRow): boolean =>
  a.owner === b.owner &&
  a.category === b.category &&
  a.price_per_day === b.price_per_day &&
  a.deposit === b.deposit &&
  a.max_days === b.max_days &&
  a.metadata_hash === b.metadata_hash &&
  a.active === b.active &&
  a.current_rental === b.current_rental &&
  a.busy_until === b.busy_until &&
  a.total_rentals === b.total_rentals;

const sameRental = (a: RentalRow, b: RentalRow): boolean =>
  a.escrow === b.escrow &&
  a.status === b.status &&
  a.start_ts === b.start_ts &&
  a.end_ts === b.end_ts &&
  a.price_total === b.price_total &&
  a.deposit === b.deposit;

export class MirrorService {
  constructor(
    private readonly db: MirrorDb,
    private readonly chain: ChainReader,
    private readonly audit: AuditLog,
    private readonly clock: () => Date = () => new Date(),
    private readonly notifier: Notifier | null = null
  ) {}

  /**
   * Hand a transition to the optional notifier without awaiting it. A webhook
   * outage must never delay or fail a sync, so failures are swallowed here and
   * reported by the notifier itself.
   */
  private publish(event: AuditEvent): void {
    if (!this.notifier) return;
    try {
      const result = this.notifier.notify(event);
      if (result && typeof (result as Promise<void>).catch === "function") {
        void (result as Promise<void>).catch((error) =>
          console.error("notification hook failed (event kept in the audit log)", error)
        );
      }
    } catch (error) {
      console.error("notification hook failed (event kept in the audit log)", error);
    }
  }

  /** Pull full program state and upsert it. Throws if the RPC read fails. */
  async sync(): Promise<SyncReport> {
    const startedAt = iso(this.clock);
    const snapshot = await this.chain.snapshot();
    const confirmedAt = iso(this.clock);
    let auditEvents = 0;

    const seenListings = new Set<string>();
    let listingsUpserted = 0;
    for (const listing of snapshot.listings) {
      const row = listingToRow(listing, confirmedAt);
      const before = this.db.getListing(row.address);
      this.db.upsertListing(row);
      seenListings.add(row.address);
      listingsUpserted += 1;

      if (!before) {
        await this.audit.append({
          at: confirmedAt,
          kind: "listing.registered",
          subject: row.address,
          wallet: row.owner,
          detail: { category: row.category, pricePerDay: row.price_per_day },
        });
        auditEvents += 1;
      } else if (!sameListing(before, row)) {
        await this.audit.append({
          at: confirmedAt,
          kind: "listing.updated",
          subject: row.address,
          wallet: row.owner,
          detail: { active: row.active === 1, busyUntil: row.busy_until },
        });
        auditEvents += 1;
      }
    }

    let listingsRemoved = 0;
    for (const address of this.db.allListingAddresses()) {
      if (seenListings.has(address)) continue;
      const before = this.db.getListing(address);
      this.db.deleteListing(address);
      listingsRemoved += 1;
      await this.audit.append({
        at: confirmedAt,
        kind: "listing.closed",
        subject: address,
        wallet: before?.owner,
        detail: { reason: "account no longer exists" },
      });
      auditEvents += 1;
    }

    const seenRentals = new Set<string>();
    let rentalsUpserted = 0;
    for (const rental of snapshot.rentals) {
      const row = rentalToRow(rental, confirmedAt);
      const before = this.db.getRental(row.address);
      this.db.upsertRental(row);
      seenRentals.add(row.address);
      rentalsUpserted += 1;

      const kind = !before ? "rental.created" : before.status !== row.status ? rentalEvent(row.status) : null;
      if (kind) {
        const event: AuditEvent = {
          at: confirmedAt,
          kind,
          subject: row.address,
          wallet: row.renter,
          detail: { listing: row.listing, status: row.status, escrow: row.escrow },
        };
        await this.audit.append(event);
        this.publish(event);
        auditEvents += 1;
      }
    }

    let rentalsRemoved = 0;
    for (const address of this.db.allRentalAddresses()) {
      if (seenRentals.has(address)) continue;
      this.db.deleteRental(address);
      rentalsRemoved += 1;
    }

    const config = snapshot.config;
    let configState: SyncReport["config"] = "missing";
    if (config) {
      const before = this.db.getConfig();
      this.db.putConfig(configToRow(config, confirmedAt));
      if (!before) configState = "created";
      else if (
        before.admin !== config.admin.toBase58() ||
        before.treasury !== config.treasury.toBase58() ||
        before.feeBps !== config.feeBps ||
        before.paused !== config.paused
      ) {
        configState = "updated";
        await this.audit.append({
          at: confirmedAt,
          kind: "config.updated",
          subject: config.address.toBase58(),
          detail: {
            treasury: config.treasury.toBase58(),
            feeBps: config.feeBps,
            paused: config.paused,
          },
        });
        auditEvents += 1;
      } else {
        configState = "unchanged";
      }
    } else {
      this.db.deleteConfig();
    }

    this.db.lastSyncedAt = confirmedAt;
    return {
      startedAt,
      finishedAt: confirmedAt,
      listings: { seen: snapshot.listings.length, upserted: listingsUpserted, removed: listingsRemoved },
      rentals: { seen: snapshot.rentals.length, upserted: rentalsUpserted, removed: rentalsRemoved },
      config: configState,
      auditEvents,
    };
  }

  /**
   * Re-read every mirrored account from a finalized node and correct the mirror.
   * This is the recovery path after an uncertain confirmation or a restart.
   */
  async reconcile(): Promise<ReconcileReport> {
    const checkedAt = iso(this.clock);
    const listings = { checked: 0, confirmed: 0, updated: 0, removed: 0, mismatched: [] as string[] };
    const rentals = { checked: 0, confirmed: 0, updated: 0, removed: 0, mismatched: [] as string[] };

    for (const address of this.db.allListingAddresses()) {
      listings.checked += 1;
      const before = this.db.getListing(address)!;
      const chain = await this.chain.listing(address);
      if (!chain) {
        this.db.deleteListing(address);
        listings.removed += 1;
        listings.mismatched.push(address);
        continue;
      }
      const row = listingToRow(chain, checkedAt);
      if (sameListing(before, row)) {
        listings.confirmed += 1;
      } else {
        this.db.upsertListing(row);
        listings.updated += 1;
        listings.mismatched.push(address);
      }
    }

    for (const address of this.db.allRentalAddresses()) {
      rentals.checked += 1;
      const before = this.db.getRental(address)!;
      const chain = await this.chain.rental(address);
      if (!chain) {
        this.db.deleteRental(address);
        rentals.removed += 1;
        rentals.mismatched.push(address);
        continue;
      }
      const row = rentalToRow(chain, checkedAt);
      if (sameRental(before, row)) {
        rentals.confirmed += 1;
      } else {
        this.db.upsertRental(row);
        rentals.updated += 1;
        rentals.mismatched.push(address);

        // A reconcile can be the first place a terminal transition is seen
        // (for example after a restart). Notify for it, but leave audit
        // bookkeeping to the mirror.reconciled event.
        if (before.status !== row.status) {
          const kind = rentalEvent(row.status);
          if (kind) {
            this.publish({
              at: checkedAt,
              kind,
              subject: row.address,
              wallet: row.renter,
              detail: { listing: row.listing, status: row.status, escrow: row.escrow },
            });
          }
        }
      }
    }

    let config: ReconcileReport["config"] = "missing";
    const chainConfig = await this.chain.config();
    const mirrored = this.db.getConfig();
    if (chainConfig) {
      if (
        mirrored &&
        mirrored.admin === chainConfig.admin.toBase58() &&
        mirrored.treasury === chainConfig.treasury.toBase58() &&
        mirrored.feeBps === chainConfig.feeBps &&
        mirrored.paused === chainConfig.paused
      ) {
        config = "confirmed";
      } else {
        this.db.putConfig(configToRow(chainConfig, checkedAt));
        config = mirrored ? "mismatched" : "confirmed";
      }
    } else if (mirrored) {
      this.db.deleteConfig();
      config = "mismatched";
    }

    await this.audit.append({
      at: checkedAt,
      kind: "mirror.reconciled",
      subject: "mirror",
      detail: {
        listingsChecked: listings.checked,
        listingsUpdated: listings.updated,
        listingsRemoved: listings.removed,
        rentalsChecked: rentals.checked,
        rentalsUpdated: rentals.updated,
        rentalsRemoved: rentals.removed,
      },
    });

    return { checkedAt, listings, rentals, config };
  }
}

function configToRow(config: ConfigAccount, confirmedAt: string) {
  return {
    address: config.address.toBase58(),
    admin: config.admin.toBase58(),
    treasury: config.treasury.toBase58(),
    fee_bps: config.feeBps,
    paused: config.paused ? 1 : 0,
    confirmed_at: confirmedAt,
  };
}
