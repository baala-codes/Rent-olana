/**
 * Backend configuration.
 *
 * Everything is env-driven so the same image runs locally, in Docker, and under
 * systemd. Defaults are safe for a local POC: loopback bind, devnet RPC, no
 * admin token (which disables the admin endpoints rather than opening them).
 */

import { resolve } from "node:path";

export interface BackendConfig {
  version: string;
  host: string;
  port: number;
  cluster: string;
  rpcUrl: string;
  dbPath: string;
  mediaDir: string;
  auditPath: string;
  /** Bearer token for `/v1/admin/*`. Unset disables those routes. */
  adminToken: string | null;
  allowedOrigins: string[];
  maxUploadBytes: number;
  syncIntervalMs: number;
  syncOnStart: boolean;
  /** Trust `x-forwarded-for` for rate limiting behind a reverse proxy. */
  trustProxy: boolean;
}

const integer = (value: string | undefined, fallback: number, name: string): number => {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer, received "${value}"`);
  }
  return parsed;
};

const boolean = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined ? fallback : ["1", "true", "yes", "on"].includes(value.toLowerCase());

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BackendConfig {
  const port = integer(env.PORT, 8787, "PORT");
  if (port > 65_535) throw new Error(`PORT must be <= 65535, received ${port}`);

  const cluster = env.CLUSTER?.trim() || "devnet";
  const rpcUrl =
    env.RPC_URL?.trim() ||
    (cluster === "localnet" ? "http://127.0.0.1:8899" : `https://api.${cluster}.solana.com`);

  const origins = (env.CORS_ORIGINS ?? "http://127.0.0.1:5173,http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    version: env.npm_package_version ?? "0.1.0",
    host: env.HOST?.trim() || "127.0.0.1",
    port,
    cluster,
    rpcUrl,
    dbPath: resolve(env.DB_PATH ?? "var/mirror.sqlite"),
    mediaDir: resolve(env.MEDIA_DIR ?? "var/media"),
    auditPath: resolve(env.AUDIT_PATH ?? "var/audit.jsonl"),
    adminToken: env.ADMIN_TOKEN?.trim() || null,
    allowedOrigins: origins,
    maxUploadBytes: integer(env.MAX_UPLOAD_BYTES, 5 * 1024 * 1024, "MAX_UPLOAD_BYTES"),
    syncIntervalMs: integer(env.SYNC_INTERVAL_MS, 0, "SYNC_INTERVAL_MS"),
    syncOnStart: boolean(env.SYNC_ON_START, false),
    trustProxy: boolean(env.TRUST_PROXY, false),
  };
}
