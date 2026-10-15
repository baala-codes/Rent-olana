use anchor_lang::prelude::*;

/// Program errors. Codes start at 6000 in declaration order, so the order of
/// these variants is part of the published client contract — append only.
///
/// Three variants are deliberately reserved rather than emitted, exactly like
/// the *previous* project's `DuplicatePaymentId`: the runtime reports those
/// conditions through Anchor/runtime errors, but clients need a stable code to
/// classify them. They are documented in `docs/CONTRACT.md` §5.
#[error_code]
pub enum RentalError {
    #[msg("Price per day must be greater than zero lamports.")]
    InvalidPrice,
    /// Reserved: no deposit bound is enforced yet (any `u64` is accepted).
    #[msg("The deposit amount is not acceptable.")]
    InvalidDeposit,
    #[msg("Rental duration must be between 1 day and the listing's max days.")]
    InvalidDuration,
    /// Reserved: categories are free-form `u16` codes for now.
    #[msg("The category code is not acceptable.")]
    InvalidCategory,
    #[msg("This listing is deactivated and cannot be booked.")]
    ListingNotActive,
    #[msg("The platform is paused; new rentals are rejected.")]
    PlatformPaused,
    #[msg("The listing owner cannot rent their own listing.")]
    RenterIsOwner,
    #[msg("A rental must start at or after the current chain time.")]
    StartInPast,
    #[msg("This listing is already booked at or after the requested start.")]
    ListingBusy,
    /// Reserved: a reused `rental_id` fails at account creation, which the
    /// runtime reports as "account already in use" rather than this code.
    #[msg("This rental ID has already been used for this listing.")]
    RentalIdReused,
    #[msg("The signer is not the owner of this listing.")]
    NotListingOwner,
    #[msg("Only the rental's owner or renter may do this.")]
    NotRentalParty,
    /// The one status guard: the instruction's required lifecycle state was not
    /// met (including "the listing still has an open rental").
    #[msg("This account is not in a state that allows this operation.")]
    InvalidStatus,
    #[msg("A rental can only be cancelled before its start time.")]
    CancelTooLate,
    #[msg("Fee must be at most MAX_FEE_BPS (1000 = 10%).")]
    FeeTooHigh,
    #[msg("Arithmetic overflow while computing a rental timestamp.")]
    TimeOverflow,
    #[msg("The supplied account does not match its expected PDA.")]
    InvalidPda,
    #[msg("The treasury account does not match the platform config.")]
    TreasuryMismatch,
    #[msg("Arithmetic overflow while computing an escrow amount or split.")]
    DepositOverflow,
    #[msg("This rental is frozen by an open dispute; settle and cancel are blocked.")]
    DisputeInProgress,
    #[msg("The signer is not authorized for this operation.")]
    Unauthorized,
    #[msg("The treasury address is not acceptable.")]
    InvalidTreasury,
    #[msg("The owner share must be at most 10_000 basis points.")]
    InvalidShare,
}
