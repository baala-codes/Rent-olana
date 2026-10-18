import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { Keypair } from "@solana/web3.js";

import { parseSearchQuery } from "../../shared/src/index.ts";
import { MirrorDb, type RentalRow } from "../src/db.ts";
import { seedListing } from "./helpers.ts";

const now = (): number => Math.floor(Date.now() / 1000);

describe("mirror queries", () => {
  it("filters by text, category, activity, and availability", async () => {
    const db = new MirrorDb(":memory:");
    const fan = await seedListing(db, {
      category: 1,
      metadata: { name: "Box fan", description: "quiet" },
      pricePerDay: 5_000_000n,
    });
    const drill = await seedListing(db, {
      category: 2,
      metadata: { name: "Cordless drill" },
      pricePerDay: 8_000_000n,
    });
    await seedListing(db, {
      category: 1,
      active: false,
      metadata: { name: "Old lamp" },
    });
    const busy = await seedListing(db, {
      category: 1,
      busyUntil: BigInt(now() + 86_400),
      metadata: { name: "Busy fridge" },
    });

    // Availability is only filtered when the caller asks for a start time; a
    // currently-busy listing is still discoverable for later dates.
    const all = db.listListings(parseSearchQuery({}).query);
    assert.equal(all.total, 3, "inactive listing is hidden by default");
    assert.ok(all.rows.some((row) => row.address === busy.listing.address.toBase58()));

    const category = db.listListings(parseSearchQuery({ category: "2" }).query);
    assert.deepEqual(category.rows.map((row) => row.address), [drill.listing.address.toBase58()]);

    const text = db.listListings(parseSearchQuery({ q: "fan" }).query);
    assert.deepEqual(text.rows.map((row) => row.address), [fan.listing.address.toBase58()]);

    const withInactive = db.listListings(parseSearchQuery({ includeInactive: "1" }).query);
    assert.equal(withInactive.total, 4);

    const available = db.listListings(
      parseSearchQuery({ availableFrom: String(now() + 3_600), includeInactive: "1" }).query
    );
    assert.equal(available.total, 3);
    assert.ok(!available.rows.some((row) => row.address === busy.listing.address.toBase58()));
    assert.ok(available.rows.some((row) => row.address === fan.listing.address.toBase58()));

    db.close();
  });

  it("orders by price and paginates without duplicating rows", async () => {
    const db = new MirrorDb(":memory:");
    await seedListing(db, { pricePerDay: 9_000_000n, metadata: { name: "A" }, createdAt: 100n });
    await seedListing(db, { pricePerDay: 3_000_000n, metadata: { name: "B" }, createdAt: 200n });
    await seedListing(db, { pricePerDay: 6_000_000n, metadata: { name: "C" }, createdAt: 300n });

    const price = db.listListings(parseSearchQuery({ sort: "price" }).query);
    assert.deepEqual(price.rows.map((row) => row.price_per_day), ["3000000", "6000000", "9000000"]);

    const newest = db.listListings(parseSearchQuery({ sort: "newest" }).query);
    assert.deepEqual(newest.rows.map((row) => row.created_at), [300, 200, 100]);

    const page = db.listListings(parseSearchQuery({ limit: "1", offset: "1", sort: "price" }).query);
    assert.equal(page.total, 3);
    assert.equal(page.rows.length, 1);
    assert.equal(page.rows[0].price_per_day, "6000000");
    db.close();
  });

  it("applies a radius search and sorts by distance", async () => {
    const db = new MirrorDb(":memory:");
    const london = await seedListing(db, {
      metadata: { name: "London fan", lat: 51.5074, lng: -0.1278 },
    });
    const manchester = await seedListing(db, {
      metadata: { name: "Manchester drill", lat: 53.4808, lng: -2.2426 },
    });
    await seedListing(db, { metadata: { name: "No location" } });

    const near = db.listListings(
      parseSearchQuery({ lat: "51.51", lng: "-0.12", radiusKm: "50" }).query
    );
    assert.equal(near.total, 1);
    assert.equal(near.rows[0].address, london.listing.address.toBase58());

    const wide = db.listListings(
      parseSearchQuery({ lat: "52.0", lng: "-1.5", radiusKm: "400" }).query
    );
    assert.deepEqual(
      wide.rows.map((row) => row.address),
      [london.listing.address.toBase58(), manchester.listing.address.toBase58()]
    );
    db.close();
  });

  it("filters rentals by party and status", () => {
    const db = new MirrorDb(":memory:");
    const owner = Keypair.generate().publicKey.toBase58();
    const renter = Keypair.generate().publicKey.toBase58();

    const row = (address: string, overrides: Partial<RentalRow>): RentalRow => ({
      address,
      listing: Keypair.generate().publicKey.toBase58(),
      owner,
      renter,
      rental_id: "00".repeat(32),
      start_ts: 1_800_000_000,
      end_ts: 1_800_086_400,
      days: 1,
      price_total: "5000000",
      deposit: "0",
      escrow: "5000000",
      status: "Reserved",
      created_at: 1_800_000_000,
      confirmed_at: null,
      ...overrides,
    });

    db.upsertRental(row("completed", { status: "Completed" }));
    db.upsertRental(
      row("open", {
        owner: Keypair.generate().publicKey.toBase58(),
        renter: Keypair.generate().publicKey.toBase58(),
      })
    );

    const byOwner = db.listRentals({ owner, limit: 10, offset: 0 });
    assert.equal(byOwner.total, 1);
    assert.equal(byOwner.rows[0].status, "Completed");

    const byStatus = db.listRentals({ status: "Reserved", limit: 10, offset: 0 });
    assert.equal(byStatus.total, 1);

    const byRenter = db.listRentals({ renter, limit: 10, offset: 0 });
    assert.equal(byRenter.total, 1);
    db.close();
  });
});
