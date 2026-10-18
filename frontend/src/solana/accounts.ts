/**
 * Read-side contract, implemented once in `clients/ts/wire.ts`.
 *
 * The portal, the backend and the tests decode `PlatformConfig`,
 * `AssetListing`, and `RentalAgreement` with the same code and the same
 * discriminator checks.
 */

export {
  decodeListing,
  decodeRental,
  decodeConfig,
  fetchListings,
  fetchRentals,
  fetchConfig,
  isListingFree,
} from "@rental-client/wire";

export type { Listing, Rental, ConfigAccount } from "@rental-client/wire";
