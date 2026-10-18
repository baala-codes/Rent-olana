/**
 * Instruction builders, implemented once in `clients/ts/wire.ts`.
 *
 * Account order, writability, discriminators (from the IDL) and Borsh arguments
 * all live there, so a portal change cannot silently diverge from the program
 * or from the acceptance suite.
 */

export {
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
} from "@rental-client/wire";

export type {
  RegisterAssetArgs,
  UpdateAssetArgs,
  CreateRentalArgs,
  SettleRentalArgs,
  ResolveDisputeArgs,
} from "@rental-client/wire";
