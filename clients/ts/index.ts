/**
 * Published client contract for the asset-rental program.
 *
 * Two layers, both fed by the same IDL:
 * - `instructions.ts` — Anchor `Program` builders (Node/tests, typed by the IDL).
 * - `wire.ts` — the raw, browser-safe encoding used by the portal, the backend,
 *   and any caller that does not want to ship Anchor.
 *
 * Discriminators are derived from `clients/idl/asset_rental.json` in
 * `contract.ts`; nothing in this package hard-codes them.
 */

export * from "./contract";
export * from "./pda";
export * from "./instructions";

export {
  // Codec
  Writer,
  Reader,
  hexToBytes,
  bytesToHex,
  bytesEqual,
  concatBytes,
  // Instruction builders (raw)
  ixInitializeConfig,
  ixSetConfig,
  ixRegisterAsset,
  ixUpdateAsset,
  ixSetListingStatus,
  ixCloseListing,
  ixCreateRental,
  ixSettleRental,
  ixCancelRental,
  ixRaiseDispute,
  ixResolveDispute,
  ixCloseRental,
  // Account decoding
  decodeListing,
  decodeRental,
  decodeConfig,
  decodeAssetListing,
  decodeRentalAgreement,
  decodePlatformConfig,
  fetchListings,
  fetchRentals,
  fetchConfig,
  isListingFree,
  // Errors
  parseProgramError,
  programErrorCode,
  isProgramError,
  rentalStatusName,
  rentalStatusCode,
} from "./wire";

export type {
  Listing,
  Rental,
  ConfigAccount,
  ProgramFailure,
  CreateRentalArgs as CreateRentalIxArgs,
  SettleRentalArgs as SettleRentalIxArgs,
  RegisterAssetArgs as RegisterAssetIxArgs,
  UpdateAssetArgs as UpdateAssetIxArgs,
  ResolveDisputeArgs as ResolveDisputeIxArgs,
} from "./wire";
