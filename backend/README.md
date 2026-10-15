# Backend

The provider backend for the asset-rental marketplace. It is a Node/TypeScript
service that makes listings discoverable and rentals usable, and it **never
decides fund movement** — the Solana program owns the funds and rental state.

Build one provider service for the POC.

- Maintain a geo/category search index over listings so renters can discover
  assets off-chain.
- Store asset images and large off-chain metadata (descriptions, location
  details); the on-chain `metadata_hash` commits to them.
- Mirror listings and rental agreements for UX: availability/calendar display,
  rental status, order history.
- Reconcile the mirror against **finalized** chain reads after restarts or
  uncertain confirmations; treat unavailable or stale RPC state as "unknown",
  never as confirmation.
- Relay notification hooks (booking, settlement, cancellation, dispute).

The mirror is disposable: it is served from SQLite or Postgres, seeded from
events and finalized account reads. Reserve and coordinate any provider-side
identities the same way the program expects (stable 32-byte `asset_id`,
`rental_id` generated and persisted before submission).

Start by agreeing on API payloads, database states, retries, and reconciliation
results in [shared/](../shared/), and read the on-chain contract in
[docs/CONTRACT.md](../docs/CONTRACT.md). The program is the source of truth;
this service only reads and mirrors. Add setup and run commands with the
implementation.

See [`new_architecture.md`](../new_architecture.md) §3 (components)
and §10 (local state and audit records).
