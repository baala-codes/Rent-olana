/**
 * Backend process.
 *
 * Boots the mirror, the HTTP API, and (optionally) a periodic sync loop. The
 * mirror never moves funds and can be deleted at any time; reconciliation
 * rebuilds it from finalized chain state.
 */

import { mkdir } from "node:fs/promises";

import { AuditLog } from "./audit.ts";
import { SolanaChainReader } from "./chain.ts";
import { loadConfig } from "./config.ts";
import { MirrorDb } from "./db.ts";
import { createApp } from "./http.ts";
import { MediaStore } from "./media.ts";
import { MirrorService } from "./mirror.ts";

async function main(): Promise<void> {
  const config = loadConfig();
  await mkdir(config.mediaDir, { recursive: true });

  const db = new MirrorDb(config.dbPath);
  const audit = new AuditLog(config.auditPath);
  const media = new MediaStore(config.mediaDir, db);
  const chain = new SolanaChainReader(config.rpcUrl);
  const mirror = new MirrorService(db, chain, audit);

  const server = createApp({ config, db, audit, media, mirror });

  server.listen(config.port, config.host, () => {
    console.log(
      `asset-rental backend listening on http://${config.host}:${config.port} ` +
        `(cluster=${config.cluster}, db=${config.dbPath})`
    );
  });

  if (config.syncOnStart) {
    mirror
      .sync()
      .then((report) =>
        console.log(
          `initial sync: ${report.listings.upserted} listings, ${report.rentals.upserted} rentals`
        )
      )
      .catch((error) => console.error("initial sync failed (mirror unchanged):", error.message));
  }

  let timer: NodeJS.Timeout | null = null;
  if (config.syncIntervalMs > 0) {
    timer = setInterval(() => {
      mirror
        .sync()
        .then((report) =>
          console.log(
            `sync: ${report.listings.upserted} listings, ${report.rentals.upserted} rentals, ` +
              `${report.auditEvents} audit events`
          )
        )
        .catch((error) => console.error("scheduled sync failed (mirror unchanged):", error.message));
    }, config.syncIntervalMs);
    timer.unref();
  }

  const shutdown = (signal: string): void => {
    console.log(`${signal} received, shutting down`);
    if (timer) clearInterval(timer);
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error) => {
  console.error("backend failed to start:", error);
  process.exit(1);
});
