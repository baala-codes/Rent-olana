import { PublicKey } from "@solana/web3.js";

import {
  IDL_ACCOUNT_DISCRIMINATORS,
  IDL_ADDRESS,
  IDL_INSTRUCTION_DISCRIMINATORS,
} from "./generated";

/**
 * Canonical, browser-safe contract constants.
 *
 * Every byte-level discriminator comes from `generated.ts`, which is produced
 * from the published IDL (`clients/idl/asset_rental.json`) by
 * `scripts/gen-client-constants.mjs`. The portal used to keep its own hand-copied
 * hex tables; it now imports this module, so the IDL is the only place those
 * bytes are written down and `scripts/check-contract.mjs` fails on drift.
 *
 * Nothing here may import Node built-ins: the portal bundles this file.
 */

/** Instruction names the program exposes. Kept explicit so a mismatch with the
 * IDL is a loud, testable error rather than a silent client-side gap. */
export const INSTRUCTION_NAMES = [
  "initialize_config",
  "set_config",
  "register_asset",
  "update_asset",
  "set_listing_status",
  "close_listing",
  "create_rental",
  "settle_rental",
  "cancel_rental",
  "raise_dispute",
  "resolve_dispute",
  "close_rental",
] as const;

export type InstructionName = (typeof INSTRUCTION_NAMES)[number];

/** Account names the program owns. */
export const ACCOUNT_NAMES = ["PlatformConfig", "AssetListing", "RentalAgreement"] as const;

export type AccountName = (typeof ACCOUNT_NAMES)[number];

function discriminatorOf(
  entries: Readonly<Record<string, string>>,
  name: string,
  kind: string
): string {
  const value = entries[name];
  if (!value || value.length !== 16) {
    throw new Error(
      `Generated client constants are missing the 8-byte ${kind} discriminator for "${name}". ` +
        "Run `bash scripts/export-clients.sh`."
    );
  }
  return value;
}

/** `sha256("global:<name>")[..8]`, as published in the IDL. */
export const IX_DISC: Record<InstructionName, string> = Object.fromEntries(
  INSTRUCTION_NAMES.map((name) => [
    name,
    discriminatorOf(IDL_INSTRUCTION_DISCRIMINATORS, name, "instruction"),
  ])
) as Record<InstructionName, string>;

/** `sha256("account:<Name>")[..8]` (also usable as an Anchor `memcmp` filter). */
export const ACCOUNT_DISC: Record<AccountName, string> = Object.fromEntries(
  ACCOUNT_NAMES.map((name) => [name, discriminatorOf(IDL_ACCOUNT_DISCRIMINATORS, name, "account")])
) as Record<AccountName, string>;

/**
 * Report every disagreement between the published IDL and this module.
 *
 * Used by `scripts/check-contract.ts` and the backend boot check: an empty array
 * means the client and the on-chain program describe the same instruction and
 * account set.
 */
export function contractDrift(): string[] {
  const problems: string[] = [];

  const idlInstructions = new Set(Object.keys(IDL_INSTRUCTION_DISCRIMINATORS));
  for (const name of INSTRUCTION_NAMES) {
    if (!idlInstructions.has(name)) problems.push(`IDL is missing instruction "${name}"`);
  }
  for (const name of idlInstructions) {
    if (!(INSTRUCTION_NAMES as readonly string[]).includes(name)) {
      problems.push(`IDL instruction "${name}" has no client builder`);
    }
  }

  const idlAccounts = new Set(Object.keys(IDL_ACCOUNT_DISCRIMINATORS));
  for (const name of ACCOUNT_NAMES) {
    if (!idlAccounts.has(name)) problems.push(`IDL is missing account "${name}"`);
  }
  for (const name of idlAccounts) {
    if (!(ACCOUNT_NAMES as readonly string[]).includes(name)) {
      problems.push(`IDL account "${name}" has no client decoder`);
    }
  }

  return problems;
}

/** Program ID (devnet). Sourced from the IDL's `address` field. */
export const PROGRAM_ID = new PublicKey(IDL_ADDRESS);

/** Cluster this client is configured for. */
export const CLUSTER = "devnet";

/** Default RPC endpoint for CLUSTER. */
export const RPC_URL = "https://api.devnet.solana.com";

const encoder = new TextEncoder();

/** PDA seed prefixes, as raw bytes (no length prefixes, no hashing). */
export const SEED_CONFIG = encoder.encode("config");
export const SEED_ASSET = encoder.encode("asset");
export const SEED_RENTAL = encoder.encode("rental");

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

/** `RentalStatus` discriminants, in Borsh declaration order (append only). */
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

export type RentalStatusName = (typeof RENTAL_STATUS_NAME)[number];

/** Program-enforced constants (mirror of `programs/asset-rental/src/constants.rs`). */
export const GRACE_SECONDS = 86_400;
export const MAX_FEE_BPS = 1_000;
export const MAX_DAYS = 36_500;
export const SECONDS_PER_DAY = 86_400;
export const BPS_DENOMINATOR = 10_000;
export const LAMPORTS_PER_SOL = 1_000_000_000;

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

/** The highest category code the program accepts (`register_asset` checks it). */
export const MAX_CATEGORY = CATEGORIES[CATEGORIES.length - 1].code;

export const categoryLabel = (code: number): string =>
  CATEGORIES.find((category) => category.code === code)?.label ?? `Category ${code}`;
