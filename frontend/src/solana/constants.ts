/**
 * Portal view of the published client contract.
 *
 * The values live in `clients/ts/contract.ts` (discriminators derived from the
 * IDL), so the portal cannot drift from the on-chain program. Only
 * browser-specific presentation helpers belong in this file.
 */

import { CLUSTER } from "@rental-client/contract";

export * from "@rental-client/contract";

/** Devnet explorer link for an address or transaction. */
export const explorerUrl = (path: string): string =>
  `https://explorer.solana.com/${path}?cluster=${CLUSTER}`;
