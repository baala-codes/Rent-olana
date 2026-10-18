/**
 * Append-only JSONL audit log.
 *
 * One line per state transition, with the listing/rental address, the wallet
 * where one is known, a timestamp, and no PII. Never log signatures, keys,
 * witness material, or full metadata documents.
 *
 * Writes are serialised through one promise chain so concurrent requests cannot
 * interleave partial lines.
 */

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { AuditEvent } from "../../shared/src/index.ts";

export class AuditLog {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly path: string) {}

  append(event: AuditEvent): Promise<void> {
    const line = `${JSON.stringify(event)}\n`;
    this.queue = this.queue
      .then(async () => {
        await mkdir(dirname(this.path), { recursive: true });
        await appendFile(this.path, line, "utf8");
      })
      // A failed audit write must not take the request down, but it must be
      // visible. Re-throw to the caller only when they await `append`.
      .catch((error) => {
        console.error("audit write failed", error);
      });
    return this.queue;
  }

  /** Last `limit` events, oldest first. */
  async recent(limit = 50): Promise<AuditEvent[]> {
    let raw = "";
    try {
      raw = await readFile(this.path, "utf8");
    } catch {
      return [];
    }
    const lines = raw.split("\n").filter(Boolean);
    return lines
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line) as AuditEvent;
        } catch {
          return null;
        }
      })
      .filter((event): event is AuditEvent => event !== null);
  }
}
