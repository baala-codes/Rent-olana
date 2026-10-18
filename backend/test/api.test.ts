import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import { PublicKey } from "@solana/web3.js";

import { bytesToHex } from "../../shared/src/index.ts";
import {
  authHeaders,
  readJson,
  seedListing,
  startTestApp,
  walletFixture,
  type TestApp,
} from "./helpers.ts";

describe("backend HTTP API", () => {
  let app: TestApp;
  let owner: ReturnType<typeof walletFixture>;
  let listingAddress: string;
  let metadataHash: string;
  let document: unknown;

  before(async () => {
    app = await startTestApp();
    owner = walletFixture();
    const seeded = await seedListing(app.db, {
      owner: new PublicKey(owner.address),
      category: 1,
      metadata: { name: "Box fan", description: "quiet", lat: 51.5, lng: -0.1 },
    });
    listingAddress = seeded.listing.address.toBase58();
    metadataHash = bytesToHex(seeded.listing.metadataHash);
    document = seeded.document;
  });

  after(async () => {
    await app.close();
  });

  it("serves health with mirror counts and the program ID", async () => {
    const response = await fetch(`${app.url}/health`);
    assert.equal(response.status, 200);
    const body = await readJson(response);
    assert.equal(body.ok, true);
    assert.equal(body.cluster, "devnet");
    assert.match(body.programId, /^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    assert.equal(body.mirror.listings, 1);
  });

  it("searches listings and reports invalid queries", async () => {
    const hit = await fetch(`${app.url}/v1/listings?q=fan`);
    assert.equal(hit.status, 200);
    const body = await readJson(hit);
    assert.equal(body.total, 1);
    assert.equal(body.results[0].address, listingAddress);
    assert.equal(body.results[0].metadata.name, "Box fan");

    const miss = await fetch(`${app.url}/v1/listings?q=drill`);
    assert.equal((await readJson(miss)).total, 0);

    const invalid = await fetch(`${app.url}/v1/listings?category=999`);
    assert.equal(invalid.status, 400);
    assert.equal((await readJson(invalid)).error.code, "bad_request");
  });

  it("returns a listing by address and 404s unknown ones", async () => {
    const found = await fetch(`${app.url}/v1/listings/${listingAddress}`);
    assert.equal(found.status, 200);
    assert.equal((await readJson(found)).listing.address, listingAddress);

    const unknown = await fetch(
      `${app.url}/v1/listings/11111111111111111111111111111111`
    );
    assert.equal(unknown.status, 404);
  });

  it("accepts owner-signed metadata only when it matches the on-chain hash", async () => {
    const path = `/v1/listings/${listingAddress}/metadata`;
    const body = JSON.stringify({ document });
    const headers = {
      ...authHeaders(owner, { method: "PUT", path, body }),
      "content-type": "application/json",
    };

    const ok = await fetch(`${app.url}${path}`, { method: "PUT", headers, body });
    assert.equal(ok.status, 200);
    assert.equal((await readJson(ok)).metadataHash, metadataHash);
    assert.equal(app.db.getMetadata(metadataHash)!.name, "Box fan");

    const tampered = JSON.stringify({
      document: { ...(document as object), name: "Not the committed document" },
    });
    const conflict = await fetch(`${app.url}${path}`, {
      method: "PUT",
      headers: { ...authHeaders(owner, { method: "PUT", path, body: tampered }), "content-type": "application/json" },
      body: tampered,
    });
    assert.equal(conflict.status, 409);
    assert.equal((await readJson(conflict)).error.code, "conflict");
  });

  it("rejects unsigned, replayed, and non-owner metadata writes", async () => {
    const path = `/v1/listings/${listingAddress}/metadata`;
    const body = JSON.stringify({ document });

    const unsigned = await fetch(`${app.url}${path}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body,
    });
    assert.equal(unsigned.status, 401);

    const nonce = "fixed-nonce-000000000000";
    const headers = {
      ...authHeaders(owner, { method: "PUT", path, body }, { nonce }),
      "content-type": "application/json",
    };
    assert.equal((await fetch(`${app.url}${path}`, { method: "PUT", headers, body })).status, 200);

    const replay = await fetch(`${app.url}${path}`, { method: "PUT", headers, body });
    assert.equal(replay.status, 401);
    assert.match((await readJson(replay)).error.message, /nonce/);

    const stranger = walletFixture();
    const strangerHeaders = {
      ...authHeaders(stranger, { method: "PUT", path, body }),
      "content-type": "application/json",
    };
    const forbidden = await fetch(`${app.url}${path}`, {
      method: "PUT",
      headers: strangerHeaders,
      body,
    });
    assert.equal(forbidden.status, 403);
  });

  it("stores owner-signed media and serves it back", async () => {
    const path = `/v1/listings/${listingAddress}/media`;
    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    const headers = {
      ...authHeaders(owner, { method: "POST", path, body: image }),
      "content-type": "image/png",
    };

    const uploaded = await fetch(`${app.url}${path}`, { method: "POST", headers, body: image });
    assert.equal(uploaded.status, 201);
    const asset = (await readJson(uploaded)).asset;
    assert.equal(asset.bytes, image.length);
    assert.match(asset.url, /^\/media\/[0-9a-f]{64}\.png$/);

    const served = await fetch(`${app.url}${asset.url}`);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await served.arrayBuffer()), image);
  });

  it("never serves a path outside the media directory", async () => {
    for (const path of [
      "/media/..%2F..%2Fetc%2Fpasswd",
      "/media/%2e%2e%2f%2e%2e%2fetc%2fpasswd",
      `/media/${"a".repeat(64)}.png`,
    ]) {
      const response = await fetch(`${app.url}${path}`);
      assert.equal(response.status, 404, path);
    }
  });

  it("protects admin routes with the configured token", async () => {
    const denied = await fetch(`${app.url}/v1/admin/sync`, { method: "POST" });
    assert.equal(denied.status, 401);

    const wrong = await fetch(`${app.url}/v1/admin/sync`, {
      method: "POST",
      headers: { "x-admin-token": "wrong" },
    });
    assert.equal(wrong.status, 401);

    const ok = await fetch(`${app.url}/v1/admin/sync`, {
      method: "POST",
      headers: { "x-admin-token": "test-admin-token" },
    });
    assert.equal(ok.status, 200);
    const report = await readJson(ok);
    assert.equal(report.listings.seen, 0);
  });

  it("disables admin routes entirely when no token is configured", async () => {
    const unconfigured = await startTestApp({ adminToken: null });
    try {
      const response = await fetch(`${unconfigured.url}/v1/admin/reconcile`, {
        method: "POST",
        headers: { "x-admin-token": "anything" },
      });
      assert.equal(response.status, 403);
    } finally {
      await unconfigured.close();
    }
  });
});
