import { PublicKey } from "@solana/web3.js";

/**
 * Frozen client constants for the asset-rental program.
 *
 * If the program is redeployed under a new key, update PROGRAM_ID here, in
 * `programs/asset-rental/src/lib.rs` (`declare_id!`) and in `Anchor.toml`.
 * Prefer `anchor keys sync`, which updates the Rust and Anchor.toml copies;
 * `clients/ts/constants.ts` must then be edited to match.
 */

/** Program ID (devnet). Must equal `declare_id!` in lib.rs. */
export const PROGRAM_ID = new PublicKey("DhbEciuQ2HDMUbQzCRnGWe15cYK9wSav9KgXP42v4DUZ");

/** Cluster this client is configured for. */
export const CLUSTER = "devnet";

/** Default RPC endpoint for CLUSTER. */
export const RPC_URL = "https://api.devnet.solana.com";

/** PDA seed prefixes, as byte strings. */
export const SEED_CONFIG = Buffer.from("config");
export const SEED_ASSET = Buffer.from("asset");
export const SEED_RENTAL = Buffer.from("rental");

/** Fixed identifier lengths. */
export const ASSET_ID_LEN = 32;
export const RENTAL_ID_LEN = 32;
export const METADATA_HASH_LEN = 32;

/** Account byte sizes (including the 8-byte discriminator). */
export const ACCOUNT_LEN = {
  PlatformConfig: 76,
  AssetListing: 182,
  RentalAgreement: 188,
} as const;

/** `RentalStatus` discriminants, in Borsh declaration order. */
export const RENTAL_STATUS = {
  Reserved: 0,
  Active: 1,
  Completed: 2,
  Cancelled: 3,
  Disputed: 4,
  Resolved: 5,
} as const;

/** Discriminant -> name, for display and mirror reconciliation. */
export const RENTAL_STATUS_NAME = [
  "Reserved",
  "Active",
  "Completed",
  "Cancelled",
  "Disputed",
  "Resolved",
] as const;

/** Program-enforced constants (mirror of `programs/asset-rental/src/constants.rs`). */
export const GRACE_SECONDS = 86_400;
export const MAX_FEE_BPS = 1_000;
export const MAX_DAYS = 36_500;
export const SECONDS_PER_DAY = 86_400;
export const BPS_DENOMINATOR = 10_000;

/** First custom error code; codes are assigned in `RentalError` declaration order. */
export const RENTAL_ERROR_BASE = 6000;

/** Custom program errors, code -> [name, message]. Append only; never reorder. */
export const RENTAL_ERRORS = {
  6000: ["InvalidPrice", "Price per day must be greater than zero lamports."],
  6001: ["InvalidDeposit", "The deposit amount is not acceptable."],
  6002: ["InvalidDuration", "Rental duration must be between 1 day and the listing's max days."],
  6003: ["InvalidCategory", "The category code is not acceptable."],
  6004: ["ListingNotActive", "This listing is deactivated and cannot be booked."],
  6005: ["PlatformPaused", "The platform is paused; new rentals are rejected."],
  6006: ["RenterIsOwner", "The listing owner cannot rent their own listing."],
  6007: ["StartInPast", "A rental must start at or after the current chain time."],
  6008: ["ListingBusy", "This listing is already booked at or after the requested start."],
  6009: ["RentalIdReused", "This rental ID has already been used for this listing."],
  6010: ["NotListingOwner", "The signer is not the owner of this listing."],
  6011: ["NotRentalParty", "Only the rental's owner or renter may do this."],
  6012: ["InvalidStatus", "This account is not in a state that allows this operation."],
  6013: ["CancelTooLate", "A rental can only be cancelled before its start time."],
  6014: ["FeeTooHigh", "Fee must be at most MAX_FEE_BPS (1000 = 10%)."],
  6015: ["TimeOverflow", "Arithmetic overflow while computing a rental timestamp."],
  6016: ["InvalidPda", "The supplied account does not match its expected PDA."],
  6017: ["TreasuryMismatch", "The treasury account does not match the platform config."],
  6018: ["DepositOverflow", "Arithmetic overflow while computing an escrow amount or split."],
  6019: ["DisputeInProgress", "This rental is frozen by an open dispute; settle and cancel are blocked."],
  6020: ["Unauthorized", "The signer is not authorized for this operation."],
  6021: ["InvalidTreasury", "The treasury address is not acceptable."],
  6022: ["InvalidShare", "The owner share must be at most 10_000 basis points."],
} as const satisfies Record<number, readonly [string, string]>;

/** Error name -> code, for assertions in tests and the backend. */
export const RENTAL_ERROR_CODE: Record<string, number> = Object.fromEntries(
  Object.entries(RENTAL_ERRORS).map(([code, [name]]) => [name, Number(code)])
);
