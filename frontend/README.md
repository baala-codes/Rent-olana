# Frontend

The browser portal for the asset-rental marketplace, connected to Phantom or
Solflare. It signs transactions but never holds keys, and it never decides fund
movement — the program does.

Build the wallet-connected portal for the POC.

- **Register:** owners connect a wallet, upload images/metadata off-chain, store
  the content hash, and call `register_asset`.
- **Discover:** renters search the backend index by location and category;
  results show availability windows from the mirrored `busy_until` /
  `current_rental`.
- **Book:** renters pick a start date and duration; the portal generates a
  fresh `rental_id`, **persists it before signing**, builds `create_rental`, and
  the wallet signs. On an uncertain confirmation, reconcile by re-reading the
  rental PDA with the same `rental_id` — never by generating a new one.
- **Manage:** listing CRUD (update terms, activate/deactivate, close), rental
  status, and settle / cancel / dispute actions.

Start with the shared API payloads in [shared/](../shared/) and the frozen client
helpers in [clients/ts/](../clients/ts/); the backend serves search and mirrors,
and the program holds the funds. Add setup and run commands when the portal is
implemented.

See [`new_architecture.md`](../new_architecture.md) §7 (portal
flows).
