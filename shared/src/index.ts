/**
 * `@asset-rental/shared` — the off-chain contract.
 *
 * - `metadata` / `search`: canonical encodings and limits.
 * - `api`: payloads the portal and backend exchange.
 * - `categories`: re-exported from the on-chain client contract so the numeric
 *   codes have exactly one definition.
 */

export * from "./metadata";
export * from "./api";
export * from "./search";
export { CATEGORIES, MAX_CATEGORY, categoryLabel } from "./categories";
export type { RentalStatusName } from "../../clients/ts/contract";
