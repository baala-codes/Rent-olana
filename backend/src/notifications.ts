/**
 * Notification hooks for rental lifecycle transitions.
 *
 * The mirror is poll-based, so a transition is observed when a finalized
 * account read shows a new terminal status. At that moment the audit log gets an
 * event and, if configured, the same event is POSTed to an operator webhook.
 *
 * Notifications are strictly best-effort and one-way:
 *   - they never influence mirror state or fund movement;
 *   - a slow or failing webhook must not delay or fail `sync()`;
 *   - no keys, PII, coordinates, or document bodies are sent.
 */

import type { AuditEvent } from "../../shared/src/index.ts";

/** Kinds worth waking an operator for. Listing changes stay audit-only. */
export const NOTIFIABLE_KINDS: ReadonlySet<AuditEvent["kind"]> = new Set([
  "rental.settled",
  "rental.cancelled",
  "rental.disputed",
  "rental.resolved",
]);

export interface Notifier {
  notify(event: AuditEvent): void | Promise<void>;
}

export interface WebhookNotifierOptions {
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Injected for tests; defaults to console.error. */
  logger?: (message: string, error?: unknown) => void;
}

export class WebhookNotifier implements Notifier {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly logger: (message: string, error?: unknown) => void;

  constructor(
    private readonly url: string,
    options: WebhookNotifierOptions = {}
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.logger = options.logger ?? ((message, error) => console.error(message, error));
  }

  /**
   * Fire-and-forget POST. Never throws: a webhook outage is logged and dropped,
   * exactly like an audit-write failure, so it cannot take the API down.
   */
  async notify(event: AuditEvent): Promise<void> {
    if (!NOTIFIABLE_KINDS.has(event.kind)) return;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    timer.unref?.();

    try {
      const response = await this.fetchImpl(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "asset-rental", event }),
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger(`notification webhook returned HTTP ${response.status}`);
      }
    } catch (error) {
      this.logger("notification webhook failed (event kept in the audit log)", error);
    } finally {
      clearTimeout(timer);
    }
  }
}
