import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { Keypair, PublicKey } from "@solana/web3.js";

import type { ConfigAccount, Listing } from "../../clients/ts/wire.ts";
import { AuditLog } from "../src/audit.ts";
import { MirrorDb } from "../src/db.ts";
import { MirrorService, listingToRow, rentalToRow } from "../src/mirror.ts";
import { FakeChain, makeRental, tempDir } from "./helpers.ts";

const CLOCK = (): Date => new Date("2026-01-01T00:00:00.000Z");
const AT = "2026-01-01T00:00:00.000Z";

function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    address: Keypair.generate().publicKey,
    owner: Keypair.generate().publicKey,
    assetId: crypto.getRandomValues(new Uint8Array(32)),
    category: 1,
    pricePerDay: 5_000_000n,
    deposit: 10_000_000n,
    maxDays: 30,
    metadataHash: crypto.getRandomValues(new Uint8Array(32)),
    active: true,
    currentRental: PublicKey.default,
    busyUntil: 0n,
    totalRentals: 0n,
    createdAt: 1_700_000_000n,
    ...overrides,
  };
}

function makeConfig(): ConfigAccount {
  return {
    address: PublicKey.default,
    admin: Keypair.generate().publicKey,
    treasury: Keypair.generate().publicKey,
    feeBps: 250,
    paused: false,
  };
}

async function setup(): Promise<{ db: MirrorDb; chain: FakeChain; audit: AuditLog; mirror: MirrorService }> {
  const dir = await tempDir();
  const db = new MirrorDb(":memory:");
  const chain = new FakeChain();
  const audit = new AuditLog(`${dir}/audit.jsonl`);
  const mirror = new MirrorService(db, chain, audit, CLOCK);
  return { db, chain, audit, mirror };
}

describe("mirror sync", () => {
  it("upserts the snapshot and audits each first observation", async () => {
    const { db, chain, audit, mirror } = await setup();
    const l1 = makeListing();
    const l2 = makeListing({ category: 2 });
    const r1 = makeRental({ listing: l1.address });
    chain.snapshotData = { config: makeConfig(), listings: [l1, l2], rentals: [r1] };

    const report = await mirror.sync();

    assert.deepEqual(report.listings, { seen: 2, upserted: 2, removed: 0 });
    assert.deepEqual(report.rentals, { seen: 1, upserted: 1, removed: 0 });
    assert.equal(report.config, "created");
    assert.equal(report.auditEvents, 3);
    assert.equal(db.counts().listings, 2);
    assert.equal(db.getListing(l1.address.toBase58())!.confirmed_at, AT);

    const events = await audit.recent();
    assert.deepEqual(
      events.map((event) => event.kind),
      ["listing.registered", "listing.registered", "rental.created"]
    );

    const again = await mirror.sync();
    assert.equal(again.auditEvents, 0, "an unchanged snapshot is not an event");
    assert.equal(again.config, "unchanged");
    db.close();
  });

  it("records term changes and terminal rental transitions", async () => {
    const { db, chain, audit, mirror } = await setup();
    const listing = makeListing();
    const rental = makeRental({ listing: listing.address });
    chain.snapshotData = { config: null, listings: [listing], rentals: [rental] };
    await mirror.sync();

    chain.snapshotData = {
      config: null,
      listings: [{ ...listing, pricePerDay: 9_000_000n, active: false }],
      rentals: [{ ...rental, status: "Completed", escrow: 0n }],
    };
    const report = await mirror.sync();

    assert.equal(report.auditEvents, 2);
    const kinds = (await audit.recent()).map((event) => event.kind);
    assert.ok(kinds.includes("listing.updated"));
    assert.ok(kinds.includes("rental.settled"));
    assert.equal(db.getListing(listing.address.toBase58())!.price_per_day, "9000000");
    assert.equal(db.getRental(rental.address.toBase58())!.status, "Completed");
    db.close();
  });

  it("removes accounts that no longer exist on chain", async () => {
    const { db, chain, mirror, audit } = await setup();
    const keep = makeListing();
    const gone = makeListing();
    chain.snapshotData = { config: null, listings: [keep, gone], rentals: [] };
    await mirror.sync();

    chain.snapshotData = { config: null, listings: [keep], rentals: [] };
    const report = await mirror.sync();

    assert.equal(report.listings.removed, 1);
    assert.equal(db.getListing(gone.address.toBase58()), null);
    assert.ok((await audit.recent()).some((event) => event.kind === "listing.closed"));
    db.close();
  });

  it("leaves the mirror untouched when the RPC read fails", async () => {
    const { db, chain, mirror } = await setup();
    const listing = makeListing();
    chain.snapshotData = { config: null, listings: [listing], rentals: [] };
    await mirror.sync();

    chain.fail = true;
    await assert.rejects(() => mirror.sync(), /RPC unavailable/);
    assert.equal(db.counts().listings, 1);
    assert.equal(db.getListing(listing.address.toBase58())!.price_per_day, "5000000");
    db.close();
  });
});

describe("mirror reconcile", () => {
  it("corrects a drifted row from a finalized read", async () => {
    const { db, chain, mirror } = await setup();
    const listing = makeListing();
    db.upsertListing(listingToRow(listing, AT));

    chain.listingReads.set(
      listing.address.toBase58(),
      { ...listing, pricePerDay: 7_000_000n, busyUntil: 1_800_000_000n }
    );

    const report = await mirror.reconcile();

    assert.deepEqual(report.listings, {
      checked: 1,
      confirmed: 0,
      updated: 1,
      removed: 0,
      mismatched: [listing.address.toBase58()],
    });
    assert.equal(db.getListing(listing.address.toBase58())!.price_per_day, "7000000");
    db.close();
  });

  it("drops rows whose account is missing and confirms the rest", async () => {
    const { db, chain, mirror } = await setup();
    const present = makeListing();
    const missing = makeListing();
    const rental = makeRental({ listing: present.address });

    db.upsertListing(listingToRow(present, AT));
    db.upsertListing(listingToRow(missing, AT));
    db.upsertRental(rentalToRow(rental, AT));

    chain.listingReads.set(present.address.toBase58(), present);
    chain.rentalReads.set(rental.address.toBase58(), rental);

    const report = await mirror.reconcile();

    assert.equal(report.listings.checked, 2);
    assert.equal(report.listings.confirmed, 1);
    assert.equal(report.listings.removed, 1);
    assert.equal(report.rentals.confirmed, 1);
    assert.equal(db.getListing(missing.address.toBase58()), null);
    assert.equal(db.counts().rentals, 1);
    db.close();
  });

  it("reports a config mismatch and rewrites the mirror", async () => {
    const { db, chain, mirror } = await setup();
    const config = makeConfig();
    db.putConfig({
      address: config.address.toBase58(),
      admin: config.admin.toBase58(),
      treasury: Keypair.generate().publicKey.toBase58(),
      fee_bps: 100,
      paused: 0,
      confirmed_at: AT,
    });
    chain.configRead = config;

    const report = await mirror.reconcile();
    assert.equal(report.config, "mismatched");
    assert.equal(db.getConfig()!.feeBps, 250);
    db.close();
  });
});
