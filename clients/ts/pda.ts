/**
 * PDA helpers.
 *
 * The implementation lives in `wire.ts` so the browser, the Node client, the
 * backend and the tests derive addresses from exactly one copy of the seeds.
 */

export {
  configPda,
  listingPda,
  rentalPda,
  configAddress,
  listingAddress,
  rentalAddress,
  toBytes32,
  type Bytes32,
} from "./wire";

/** Historical alias: the old `toBytes` name for `toBytes32`. */
export { toBytes32 as toBytes } from "./wire";

export { ASSET_ID_LEN, RENTAL_ID_LEN } from "./contract";
