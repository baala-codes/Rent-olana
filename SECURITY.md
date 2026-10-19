# Security policy

## Scope

This repository contains a devnet proof of concept:

- Anchor program `Ge4Z9acYsYxSj8UsVo1W3yMroEbonZBUshUW2wGgNaCg`
- Browser portal in `frontend/`
- Provider backend in `backend/`

Escrow custody, settlement, cancellation, and dispute resolution are enforced by
the program. The backend never holds keys and never decides fund movement.

## Reporting a vulnerability

Please **do not open a public issue** for a vulnerability that could move funds,
bypass a rental gate, or expose a wallet.

Report it privately through GitHub Security Advisories:

https://github.com/baala-codes/Rent-olana/security/advisories/new

Include the affected instruction or endpoint, a reproduction (localnet is fine),
and the impact. We will acknowledge the report and coordinate a fix and
disclosure.

## Out of scope

- Devnet-only infrastructure or faucet limits.
- Issues that require the upgrade authority or a compromised wallet key.
- The intentionally off-chain backend index being unavailable; the program
  remains the source of truth for funds and rentals.
- Denial of service against a local validator or a public RPC provider.

## Safe harbour

Good-faith research that follows this policy will not be pursued. Do not test
against mainnet funds or other users' listings.
