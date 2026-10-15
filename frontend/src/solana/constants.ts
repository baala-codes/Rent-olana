import { PublicKey } from "@solana/web3.js";

/**
 * Frozen client constants for the asset-rental program.
 *
 * These mirror `clients/ts/constants.ts` and `docs/CONTRACT.md`, which are the
 * published contract. The portal has no generated IDL, so it hand-encodes every
 * instruction and decodes every account; the values below are the source of
 * truth for that encoding.
 */

/** Program ID (devnet). Must equal `declare_id!` in lib.rs. */
export const PROGRAM_ID = new PublicKey("9CN7pM6aw4aYiNb5h715tvE7xeLA31WXMVbUcpmYohxo");

/** Cluster this portal is configured for. */
export const CLUSTER = "devnet" as const;

/** RPC endpoint for CLUSTER. */
export const RPC_URL = "https://api.devnet.solana.com";

/** Devnet explorer link for an address or transaction. */
export const explorerUrl = (path: string): string =>
  `https://explorer.solana.com/${path}?cluster=${CLUSTER}`;

/** PDA seed prefixes, as bytes. `TextEncoder` avoids needing a Buffer global. */
const enc = new TextEncoder();
export const SEED_CONFIG = enc.encode("config");
export const SEED_ASSET = enc.encode("asset");
export const SEED_RENTAL = enc.encode("rental");

/** Fixed identifier lengths. */
export const ASSET_ID_LEN = 32;
export const RENTAL_ID_LEN = 32;
export const METADATA_HASH_LEN = 32;

/** Account byte sizes (including the 8-byte Anchor discriminator). */
export const ACCOUNT_LEN = {
  PlatformConfig: 76,
  AssetListing: 182,
  RentalAgreement: 188,
} as const;

/**
 * Account discriminators, `sha256("account:<Name>")[..8]`, as hex.
 * Verified against `docs/CONTRACT.md` §1.
 */
export const ACCOUNT_DISC = {
  PlatformConfig: "a04e8000f853e6a0",
  AssetListing: "3f5da63d4b59edf8",
  RentalAgreement: "54cecc92f0da130e",
} as const;

/**
 * Instruction discriminators, `sha256("global:<snake_case_name>")[..8]`, as hex.
 * Anchor writes them as the first 8 bytes of the instruction data.
 */
export const IX_DISC = {
  initialize_config: "d07f1501c2bec446",
  set_config: "6c9e9aafd4623442",
  register_asset: "15509b9575cfeb10",
  update_asset: "387eee8ac076e4ac",
  set_listing_status: "6242395f0d989f9a",
  close_listing: "210fc0514eaf9f61",
  create_rental: "82f0991df39550f3",
  settle_rental: "95f1eedb44886e39",
  cancel_rental: "61cc3f0854221c2b",
  raise_dispute: "29f30133965ff649",
  resolve_dispute: "e706ca0660670ce6",
  close_rental: "b3bc71d329e83333",
} as const;

export type InstructionName = keyof typeof IX_DISC;

/** `RentalStatus` variants in Borsh declaration order. */
export const RENTAL_STATUS = [
  "Reserved",
  "Active",
  "Completed",
  "Cancelled",
  "Disputed",
  "Resolved",
] as const;

export type RentalStatusName = (typeof RENTAL_STATUS)[number];

/** Program-enforced constants (mirror of `constants.rs`). */
export const GRACE_SECONDS = 86_400;
export const MAX_FEE_BPS = 1_000;
export const MAX_DAYS = 36_500;
export const SECONDS_PER_DAY = 86_400;
export const BPS_DENOMINATOR = 10_000;
export const LAMPORTS_PER_SOL = 1_000_000_000;

/** First custom error code; codes follow `RentalError` declaration order. */
export const RENTAL_ERROR_BASE = 6000;

/** Custom program errors, code -> [name, message]. Append only. */
export const RENTAL_ERRORS: Record<number, readonly [string, string]> = {
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
};

/** Coarse category codes for the discovery index (numeric by design). */
export const CATEGORIES: ReadonlyArray<{ code: number; label: string }> = [
  { code: 0, label: "Uncategorised" },
  { code: 1, label: "Home appliance" },
  { code: 2, label: "Power tool" },
  { code: 3, label: "Electronics" },
  { code: 4, label: "Camera / media" },
  { code: 5, label: "Furniture" },
  { code: 6, label: "Outdoor / garden" },
  { code: 7, label: "Party / event" },
  { code: 8, label: "Sports / fitness" },
  { code: 9, label: "Vehicle" },
];

export const categoryLabel = (code: number): string =>
  CATEGORIES.find((c) => c.code === code)?.label ?? `Category ${code}`;
