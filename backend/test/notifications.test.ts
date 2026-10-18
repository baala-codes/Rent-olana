import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type { AuditEvent } from "../../shared/src/index.ts";
import { AuditLog } from "../src/audit.ts";
import { MirrorDb } from "../src/db.ts";
import { MirrorService } from "../src/mirror.ts";
import { NOTIFIABLE_KINDS, WebhookNotifier, type Notifier } from "../src/notifications.ts";
import { FakeChain, makeRental, tempDir } from "./helpers.ts";

const CLOCK = (): Date => new Date("2026-01-01T00:00:00.000Z");

const event = (kind: AuditEvent["kind"]): AuditEvent => ({
  at: "2026-01-01T00:00:00.000Z",
  kind,
  subject: "rental-address",
  wallet: "renter-wallet",
  detail: { listing: "listing-address", status: "Completed" },
});

describe("notification hooks", () => {
  it("posts only terminal rental transitions with the audit event", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const notifier = new WebhookNotifier("https://hooks.example/rental", {
      fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response("ok", { status: 200 });
      }) as typeof fetch,
    });

    assert.deepEqual(
      [...NOTIFIABLE_KINDS].sort(),
      ["rental.cancelled", "rental.disputed", "rental.resolved", "rental.settled"]
    );

    await notifier.notify(event("rental.settled"));
    await notifier.notify(event("listing.updated"));
    await notifier.notify(event("rental.disputed"));

    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "https://hooks.example/rental");
    assert.equal(calls[0].init.method, "POST");
    assert.equal((calls[0].init.headers as Record<string, string>)["content-type"], "application/json");
    const payload = JSON.parse(String(calls[0].init.body));
    assert.equal(payload.source, "asset-rental");
    assert.equal(payload.event.kind, "rental.settled");
    assert.equal(payload.event.subject, "rental-address");
  });

  it("never throws when the webhook fails or times out", async () => {
    const logs: string[] = [];
    const notifier = new WebhookNotifier("https://hooks.example/rental", {
      logger: (message) => logs.push(message),
      fetchImpl: (async () => {
        throw new Error("network down");
      }) as typeof fetch,
    });
    await notifier.notify(event("rental.settled"));

    const rejecting = new WebhookNotifier("https://hooks.example/rental", {
      logger: (message) => logs.push(message),
      fetchImpl: (async () => new Response("nope", { status: 503 })) as typeof fetch,
    });
    await rejecting.notify(event("rental.resolved"));

    assert.equal(logs.length, 2);
    assert.match(logs[0], /failed/);
    assert.match(logs[1], /HTTP 503/);
  });

  it("publishes terminal transitions from sync and reconcile", async () => {
    const dir = await tempDir();
    const db = new MirrorDb(":memory:");
    const chain = new FakeChain();
    const audit = new AuditLog(`${dir}/audit.jsonl`);
    const seen: AuditEvent[] = [];
    const notifier: Notifier = { notify: (event) => void seen.push(event) };
    const mirror = new MirrorService(db, chain, audit, CLOCK, notifier);

    const first = makeRental({ status: "Reserved" });
    const second = makeRental({ status: "Reserved" });
    chain.snapshotData = { config: null, listings: [], rentals: [first] };
    await mirror.sync();
    assert.equal(seen.length, 1);
    assert.equal(seen[0].kind, "rental.created", "the hook sees the first observation too");

    chain.snapshotData = { config: null, listings: [], rentals: [{ ...first, status: "Completed", escrow: 0n }] };
    await mirror.sync();
    assert.equal(seen.length, 2);
    assert.equal(seen[1].kind, "rental.settled");

    // Reconcile observes a transition the poll loop missed.
    db.upsertRental({
      address: second.address.toBase58(),
      listing: second.listing.toBase58(),
      owner: second.owner.toBase58(),
      renter: second.renter.toBase58(),
      rental_id: Buffer.from(second.rentalId).toString("hex"),
      start_ts: Number(second.startTs),
      end_ts: Number(second.endTs),
      days: second.days,
      price_total: second.priceTotal.toString(),
      deposit: second.deposit.toString(),
      escrow: second.escrow.toString(),
      status: "Reserved",
      created_at: Number(second.createdAt),
      confirmed_at: CLOCK().toISOString(),
    });
    chain.rentalReads.set(second.address.toBase58(), { ...second, status: "Disputed" });
    await mirror.reconcile();

    assert.equal(seen.length, 3);
    assert.equal(seen[2].kind, "rental.disputed");
    assert.equal(seen[2].subject, second.address.toBase58());
    db.close();
  });

  it("does not let a throwing notifier fail a sync", async () => {
    const dir = await tempDir();
    const db = new MirrorDb(":memory:");
    const chain = new FakeChain();
    const audit = new AuditLog(`${dir}/audit.jsonl`);
    const notifier: Notifier = {
      notify: () => {
        throw new Error("sync hook exploded");
      },
    };
    const mirror = new MirrorService(db, chain, audit, CLOCK, notifier);

    const rental = makeRental({ status: "Reserved" });
    chain.snapshotData = { config: null, listings: [], rentals: [rental] };
    await mirror.sync();

    chain.snapshotData = {
      config: null,
      listings: [],
      rentals: [{ ...rental, status: "Cancelled", escrow: 0n }],
    };
    const report = await mirror.sync();

    assert.equal(report.auditEvents, 1);
    assert.equal(db.getRental(rental.address.toBase58())!.status, "Cancelled");
    db.close();
  });
});
