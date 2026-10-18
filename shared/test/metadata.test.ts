import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
  canonicalMetadata,
  validateMetadata,
  metadataHashHex,
  hexToBytes,
  documentToInput,
  parseSearchQuery,
  SEARCH_LIMITS,
  type MetadataInput,
} from "../src/index.ts";

const sample: MetadataInput = {
  name: "  Box fan ",
  description: " Three speeds, quiet. ",
  category: 1,
  location: { label: "Shoreditch", lat: 51.52, lng: -0.08 },
  images: ["https://example.com/fan.jpg"],
};

describe("metadata commitment", () => {
  it("is canonical and order-stable", () => {
    assert.equal(
      canonicalMetadata(sample),
      '{"name":"Box fan","description":"Three speeds, quiet.","category":1,"location":{"label":"Shoreditch","lat":51.52,"lng":-0.08},"images":["https://example.com/fan.jpg"]}'
    );
    assert.equal(
      canonicalMetadata({ ...sample }),
      canonicalMetadata({ images: sample.images, location: sample.location, category: 1, description: sample.description, name: sample.name })
    );
  });

  it("treats an absent location as null and defaults the category", () => {
    assert.equal(
      canonicalMetadata({ name: "Ladder" }),
      '{"name":"Ladder","description":"","category":0,"location":null,"images":[]}'
    );
  });

  it("hashes the exact canonical bytes to a 32-byte commitment", async () => {
    const canonical = canonicalMetadata(sample);
    const expected = createHash("sha256").update(canonical).digest("hex");

    assert.equal(await metadataHashHex(sample), expected);
    assert.equal((await metadataHashHex(sample)).length, 64);
    assert.equal(hexToBytes(expected).length, 32);
  });

  it("keeps a fixed vector so the commitment cannot drift silently", async () => {
    // Computed once from the canonical document above; if this changes, every
    // listing already registered would fail metadata verification.
    assert.equal(
      await metadataHashHex(sample),
      "e0efa3ba304daa0fad05a341290e2bd1ccb8241e39ae6da00bc1bf911968e21a"
    );
  });

  it("rejects malformed hashes and non-canonical documents", () => {
    assert.throws(() => hexToBytes("abc"), /64 lowercase hex/);
    assert.throws(() => hexToBytes("z".repeat(64)), /64 lowercase hex/);
  });
});

describe("metadata validation", () => {
  it("accepts a valid document and normalises it", () => {
    const result = validateMetadata(sample);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.name, "Box fan");
    assert.equal(result.value.category, 1);
    assert.deepEqual(result.value.images, ["https://example.com/fan.jpg"]);
    assert.equal(awaitHash(result.value), canonicalMetadata(sample));
  });

  it("reports every issue at once", () => {
    const result = validateMetadata({
      name: "",
      description: "x".repeat(2_001),
      category: 99,
      images: ["javascript:alert(1)", 42],
      location: { label: "x".repeat(200), lat: 120, lng: 200 },
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    const fields = result.issues.map((issue) => issue.field);
    assert.ok(fields.includes("name"));
    assert.ok(fields.includes("description"));
    assert.ok(fields.includes("category"));
    assert.ok(fields.includes("images[0]"));
    assert.ok(fields.includes("images[1]"));
    assert.ok(fields.includes("location.label"));
    assert.ok(fields.includes("location.lat"));
    assert.ok(fields.includes("location.lng"));
  });

  it("rejects non-http image URLs and too many images", () => {
    const result = validateMetadata({
      name: "Drill",
      images: Array.from({ length: 9 }, (_, index) => `ftp://example.com/${index}.jpg`),
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.issues.some((issue) => issue.message.includes("http(s)")));
    assert.ok(result.issues.some((issue) => issue.message.includes("at most 8")));
  });
});

describe("search query", () => {
  it("fills defaults", () => {
    const { ok, query } = parseSearchQuery({});
    assert.equal(ok, true);
    assert.equal(query.limit, SEARCH_LIMITS.limit);
    assert.equal(query.offset, 0);
    assert.equal(query.sort, "relevance");
    assert.equal(query.category, null);
    assert.equal(query.lat, null);
    assert.equal(query.days, 1);
    assert.equal(query.includeInactive, false);
  });

  it("clamps limits and radius", () => {
    const { query } = parseSearchQuery({ limit: "5000", offset: "-4", radiusKm: "9999", lat: "10", lng: "20" });
    assert.equal(query.limit, SEARCH_LIMITS.maxLimit);
    assert.equal(query.offset, 0);
    assert.equal(query.radiusKm, SEARCH_LIMITS.maxRadiusKm);
    assert.equal(query.lat, 10);
    assert.equal(query.lng, 20);
  });

  it("requires lat and lng together and validates ranges", () => {
    const missing = parseSearchQuery({ lat: "51.5" });
    assert.equal(missing.ok, false);
    assert.ok(missing.issues.some((issue) => issue.field === "location"));

    const range = parseSearchQuery({ lat: "91", lng: "0" });
    assert.equal(range.ok, false);
    assert.ok(range.issues.some((issue) => issue.field === "lat"));
  });

  it("rejects an unknown category and an out-of-range duration", () => {
    const { ok, issues } = parseSearchQuery({ category: "999", days: "0" });
    assert.equal(ok, false);
    assert.deepEqual(
      issues.map((issue) => issue.field).sort(),
      ["category", "days"]
    );
  });
});

const awaitHash = (document: Parameters<typeof documentToInput>[0]): string =>
  canonicalMetadata(documentToInput(document));
