# Shared interfaces

Interface definitions shared between the program clients, the backend, and the
portal. Agree on these contracts before connecting implementations. This folder
holds interface definitions, client helpers, and non-secret fixtures as they are
created.

| Contract | Define first |
| --- | --- |
| Solana program/client | Cluster and program ID, account layouts, PDA seed encodings, instruction arguments, errors, and rental/listing fixtures |
| Rental/order API | Payloads between the portal and the backend: listing search, availability, booking, rental status, and reconciliation results |
| Off-chain metadata | Asset document shape and hashing (`metadata_hash` commitment), media object-storage layout, category code table |
| Backend mirror state | SQLite/Postgres tables for listings and rentals, event-to-mirror mapping, restart reconciliation rules |
| Notifications | Booking, settlement, cancellation, and dispute notification hooks |

The frozen on-chain interface is published in
[`docs/CONTRACT.md`](../docs/CONTRACT.md); the TypeScript equivalent lives in
[`clients/ts/`](../clients/ts/). Solana is the source of truth for funds and
rental state, so nothing in this folder may redefine fund movement.

See [`new_architecture.md`](../new_architecture.md) §5 and §10.
