//! Instruction modules.
//!
//! Each module owns one instruction group and exposes its `#[derive(Accounts)]`
//! structs plus uniquely named handlers ending in `_handler`.
//!
//! The re-exports below are globs on purpose. `#[derive(Accounts)]` emits a
//! `pub(crate) mod __client_accounts_*` (and `__cpi_client_accounts_*`) next to
//! each account struct, and the `#[program]` macro resolves those through
//! absolute `crate::__client_accounts_*` paths. Declaring the structs in
//! per-instruction modules therefore only works if a glob chain lifts those
//! generated modules back to the crate root.
//!
//! Handlers are named `<instruction>_handler` rather than a bare `handler`
//! precisely so that these globs re-export no duplicate names. Nothing about
//! this affects the published IDL — on-chain instruction names come from
//! `#[program]` in `lib.rs`, not from here.

pub mod cancel_rental;
pub mod close_listing;
pub mod close_rental;
pub mod config;
pub mod create_rental;
pub mod dispute;
pub mod escrow;
pub mod register_asset;
pub mod resolve_dispute;
pub mod set_listing_status;
pub mod settle_rental;
pub mod update_asset;

pub use cancel_rental::*;
pub use close_listing::*;
pub use close_rental::*;
pub use config::*;
pub use create_rental::*;
pub use dispute::*;
pub use register_asset::*;
pub use resolve_dispute::*;
pub use set_listing_status::*;
pub use settle_rental::*;
pub use update_asset::*;
