/**
 * HTTP API.
 *
 *   GET  /health
 *   GET  /v1/categories
 *   GET  /v1/config
 *   GET  /v1/listings                     search (q, category, lat/lng/radiusKm,
 *                                         availableFrom, days, sort, limit, offset)
 *   GET  /v1/listings/:address
 *   PUT  /v1/listings/:address/metadata   wallet-signed, owner only
 *   POST /v1/listings/:address/media      wallet-signed, owner only, raw image
 *   GET  /v1/rentals                      owner/renter/status/listing filters
 *   GET  /v1/rentals/:address
 *   POST /v1/admin/sync                   x-admin-token
 *   POST /v1/admin/reconcile              x-admin-token
 *   GET  /v1/admin/audit                  x-admin-token
 *   GET  /media/:filename                 immutable, content-addressed
 *
 * Reads are public. Writes prove wallet ownership; admin routes need a bearer
 * token that is disabled unless `ADMIN_TOKEN` is configured.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";

import { PROGRAM_ID, RENTAL_STATUS_NAME } from "../../clients/ts/contract.ts";
import {
  CATEGORIES,
  MAX_CATEGORY,
  metadataHashHex,
  parseSearchQuery,
  validateMetadata,
  type ApiErrorBody,
  type ApiIssue,
  type ListingDTO,
  type MetadataWriteResponse,
} from "../../shared/src/index.ts";
import { AuditLog } from "./audit.ts";
import { AuthError, authenticate } from "./auth.ts";
import type { BackendConfig } from "./config.ts";
import type { MirrorDb } from "./db.ts";
import { MediaStore, UnsupportedMediaTypeError } from "./media.ts";
import {
  MirrorService,
  rowToListingDTO,
  rowToRentalDTO,
} from "./mirror.ts";

export interface AppDeps {
  config: BackendConfig;
  db: MirrorDb;
  audit: AuditLog;
  media: MediaStore;
  mirror: MirrorService;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorBody["error"]["code"],
    message: string,
    readonly issues?: ApiIssue[]
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const JSON_LIMIT = 256 * 1024;

export function createApp(deps: AppDeps): Server {
  return createServer((request, response) => {
    void handle(deps, request, response).catch((error) => {
      writeError(response, error, deps.config);
    });
  });
}

async function handle(
  deps: AppDeps,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const { config } = deps;
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = (request.method ?? "GET").toUpperCase();

  // CORS: echo only configured origins; never "*" for a write-capable API.
  const origin = request.headers.origin;
  if (origin && config.allowedOrigins.includes(origin)) {
    response.setHeader("access-control-allow-origin", origin);
    response.setHeader("vary", "origin");
  }
  response.setHeader("x-content-type-options", "nosniff");

  if (method === "OPTIONS") {
    response.setHeader("access-control-allow-methods", "GET,PUT,POST,OPTIONS");
    response.setHeader(
      "access-control-allow-headers",
      "content-type,x-wallet,x-signature,x-issued-at,x-nonce,x-admin-token"
    );
    response.setHeader("access-control-max-age", "600");
    response.writeHead(204).end();
    return;
  }

  try {
    if (method === "GET" && path === "/health") {
      const counts = deps.db.counts();
      return json(response, 200, {
        ok: true,
        version: config.version,
        cluster: config.cluster,
        programId: PROGRAM_ID.toBase58(),
        rpcConfigured: Boolean(config.rpcUrl),
        mirror: { ...counts, lastSyncedAt: deps.db.lastSyncedAt },
      });
    }

    if (method === "GET" && path === "/v1/categories") {
      return json(response, 200, { categories: CATEGORIES, max: MAX_CATEGORY });
    }

    if (method === "GET" && path === "/v1/config") {
      return json(response, 200, { config: deps.db.getConfig() });
    }

    if (method === "GET" && path === "/v1/listings") {
      const parsed = parseSearchQuery(Object.fromEntries(url.searchParams));
      if (!parsed.ok) {
        throw new HttpError(400, "bad_request", "invalid search query", parsed.issues);
      }
      const { rows, total } = deps.db.listListings(parsed.query);
      const results: ListingDTO[] = rows.map((row) =>
        rowToListingDTO(row, deps.db.listMedia(row.address))
      );
      return json(response, 200, {
        results,
        total,
        limit: parsed.query.limit,
        offset: parsed.query.offset,
        query: parsed.query,
      });
    }

    const listingMatch = path.match(/^\/v1\/listings\/([1-9A-HJ-NP-Za-km-z]{32,44})$/);
    if (listingMatch && method === "GET") {
      return json(response, 200, { listing: mustListing(deps, listingMatch[1]) });
    }

    const metadataMatch = path.match(
      /^\/v1\/listings\/([1-9A-HJ-NP-Za-km-z]{32,44})\/metadata$/
    );
    if (metadataMatch && method === "PUT") {
      const address = metadataMatch[1];
      const body = await readBody(request, JSON_LIMIT);
      const raw = body.toString("utf8");
      const wallet = authenticate(deps.db, { method, path: url.pathname, body: raw, headers: request.headers });
      const listing = mustListingRow(deps, address);
      if (listing.owner !== wallet) {
        throw new HttpError(403, "unauthorized", "only the listing owner may change metadata");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new HttpError(400, "bad_request", "body must be JSON");
      }
      const document = (parsed as { document?: unknown })?.document;
      const validation = validateMetadata(document);
      if (!validation.ok) {
        throw new HttpError(400, "bad_request", "invalid metadata document", validation.issues);
      }

      const hash = await metadataHashHex(validation.value);
      if (hash !== listing.metadata_hash) {
        throw new HttpError(
          409,
          "conflict",
          `document does not match the on-chain metadata_hash (expected ${listing.metadata_hash}, got ${hash})`
        );
      }

      deps.db.putMetadata({
        metadata_hash: hash,
        name: validation.value.name,
        document: JSON.stringify(validation.value),
        lat: validation.value.location?.lat ?? null,
        lng: validation.value.location?.lng ?? null,
        updated_at: new Date().toISOString(),
      });
      await deps.audit.append({
        at: new Date().toISOString(),
        kind: "metadata.stored",
        subject: address,
        wallet,
        detail: { metadataHash: hash },
      });

      const result: MetadataWriteResponse = { metadataHash: hash, document: validation.value };
      return json(response, 200, result);
    }

    const mediaMatch = path.match(/^\/v1\/listings\/([1-9A-HJ-NP-Za-km-z]{32,44})\/media$/);
    if (mediaMatch && method === "POST") {
      const address = mediaMatch[1];
      const contentType = String(request.headers["content-type"] ?? "");
      if (!MediaStore.isSupported(contentType)) {
        throw new HttpError(415, "bad_request", `unsupported content type "${contentType}"`);
      }
      const body = await readBody(request, deps.config.maxUploadBytes);
      const wallet = authenticate(deps.db, {
        method,
        path: url.pathname,
        body,
        headers: request.headers,
      });
      const listing = mustListingRow(deps, address);
      if (listing.owner !== wallet) {
        throw new HttpError(403, "unauthorized", "only the listing owner may upload media");
      }

      const asset = await deps.media.put(address, body, contentType);
      await deps.audit.append({
        at: new Date().toISOString(),
        kind: "media.stored",
        subject: address,
        wallet,
        detail: { sha256: asset.sha256, bytes: asset.bytes, contentType: asset.contentType },
      });
      return json(response, 201, { asset });
    }

    if (method === "GET" && path === "/v1/rentals") {
      const status = url.searchParams.get("status") ?? undefined;
      if (status && !(RENTAL_STATUS_NAME as readonly string[]).includes(status)) {
        throw new HttpError(400, "bad_request", `status must be one of ${RENTAL_STATUS_NAME.join(", ")}`);
      }
      const limit = clamp(Number(url.searchParams.get("limit") ?? 50), 1, 200);
      const offset = Math.max(Math.trunc(Number(url.searchParams.get("offset") ?? 0)) || 0, 0);
      const { rows, total } = deps.db.listRentals({
        owner: url.searchParams.get("owner") ?? undefined,
        renter: url.searchParams.get("renter") ?? undefined,
        listing: url.searchParams.get("listing") ?? undefined,
        status,
        limit,
        offset,
      });
      return json(response, 200, {
        results: rows.map(rowToRentalDTO),
        total,
        limit,
        offset,
      });
    }

    const rentalMatch = path.match(/^\/v1\/rentals\/([1-9A-HJ-NP-Za-km-z]{32,44})$/);
    if (rentalMatch && method === "GET") {
      const row = deps.db.getRental(rentalMatch[1]);
      if (!row) throw new HttpError(404, "not_found", "rental is not mirrored yet");
      return json(response, 200, { rental: rowToRentalDTO(row) });
    }

    if (method === "POST" && path === "/v1/admin/sync") {
      requireAdmin(deps, request);
      const report = await deps.mirror.sync();
      return json(response, 200, report);
    }

    if (method === "POST" && path === "/v1/admin/reconcile") {
      requireAdmin(deps, request);
      const report = await deps.mirror.reconcile();
      return json(response, 200, report);
    }

    if (method === "GET" && path === "/v1/admin/audit") {
      requireAdmin(deps, request);
      const limit = clamp(Number(url.searchParams.get("limit") ?? 50), 1, 500);
      return json(response, 200, { events: await deps.audit.recent(limit) });
    }

    const mediaFile = path.match(/^\/media\/([^/]+)$/);
    if (mediaFile && method === "GET") {
      const file = await deps.media.read(mediaFile[1]);
      if (!file) throw new HttpError(404, "not_found", "media not found");
      response.setHeader("content-type", file.contentType);
      response.setHeader("cache-control", "public, max-age=31536000, immutable");
      response.setHeader("content-length", String(file.data.length));
      response.writeHead(200).end(file.data);
      return;
    }

    throw new HttpError(404, "not_found", `no route for ${method} ${path}`);
  } catch (error) {
    writeError(response, error, deps.config);
  }
}

// ------------------------------------------------------------------ helpers

function mustListingRow(deps: AppDeps, address: string) {
  const row = deps.db.getListing(address);
  if (!row) throw new HttpError(404, "not_found", "listing is not mirrored yet");
  return row;
}

function mustListing(deps: AppDeps, address: string): ListingDTO {
  const row = mustListingRow(deps, address);
  return rowToListingDTO(row, deps.db.listMedia(address));
}

function requireAdmin(deps: AppDeps, request: IncomingMessage): void {
  const expected = deps.config.adminToken;
  if (!expected) {
    throw new HttpError(403, "unauthorized", "admin endpoints are disabled (ADMIN_TOKEN is unset)");
  }
  const provided = request.headers["x-admin-token"];
  const token = Array.isArray(provided) ? provided[0] : provided;
  if (typeof token !== "string" || !safeEqual(token, expected)) {
    throw new HttpError(401, "unauthorized", "invalid admin token");
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

async function readBody(request: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > limit) {
      throw new HttpError(413, "bad_request", `body exceeds ${limit} bytes`);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function json(response: ServerResponse, status: number, body: unknown): void {
  if (response.headersSent) return;
  const payload = Buffer.from(JSON.stringify(body));
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-length", String(payload.length));
  response.writeHead(status).end(payload);
}

function writeError(response: ServerResponse, error: unknown, config: BackendConfig): void {
  if (response.headersSent) return;

  let status = 500;
  let code: ApiErrorBody["error"]["code"] = "internal";
  let message = "internal error";
  let issues: ApiIssue[] | undefined;

  if (error instanceof HttpError) {
    status = error.status;
    code = error.code;
    message = error.message;
    issues = error.issues;
  } else if (error instanceof AuthError) {
    status = error.status;
    code = "unauthorized";
    message = error.message;
  } else if (error instanceof UnsupportedMediaTypeError) {
    status = 415;
    code = "bad_request";
    message = error.message;
  } else if (error instanceof Error) {
    // RPC failures are the common case here: report them as upstream, not 500.
    if (/fetch failed|ECONNREFUSED|ETIMEDOUT|429|rpc/i.test(error.message)) {
      status = 503;
      code = "upstream_unavailable";
      message = "Solana RPC is unavailable; the mirror was not changed";
    }
    console.error(`${config.cluster}: unhandled request error:`, error);
  }

  json(response, status, {
    error: { code, message, ...(issues ? { issues } : {}) },
  } satisfies ApiErrorBody);
}
