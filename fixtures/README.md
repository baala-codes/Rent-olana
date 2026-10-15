# On-chain fixtures

Non-secret fixtures for the portal and backend. Files here are committed, so
never write keypair material, private keys, or session data into this folder.

## What lands here

`tests/asset-rental.ts` dumps one JSON file per scenario that touches listing or
rental state, named `<scenario>.json`. Each file is written after the case runs;
`signature` is `null` for a case that exercises a rejection. Each file contains:

| Field | Meaning |
| --- | --- |
| `scenario` | Scenario name, matching the test title |
| `cluster` | Cluster the fixture was produced on |
| `programId` | Program the accounts belong to |
| `signature` | Transaction signature, or `null` for pure-rejection scenarios |
| `accounts.<name>.address` | Account address |
| `accounts.<name>.exists` | Whether the account existed at capture time |
| `accounts.<name>.before` / `.after` | `{ address, exists, lamports }` before and after |
| `capturedAt` | ISO timestamp of capture |

`before`/`after` capture each account's existence and lamport balance, so a
consumer can see exactly what a transaction changed. To read decoded fields,
fetch the account with the program's IDL (`clients/idl/asset_rental.json`).

Typical scenarios include `register`, `create`, `cancel`, `settle`, and
`dispute`, produced by the `scenario()` harness in `tests/asset-rental.ts`.

## Provenance

Regenerate them with:

```bash
anchor test --provider.cluster devnet
```

Fixtures are only meaningful for the cluster and program ID recorded inside
them. If the program is redeployed under a new ID, regenerate everything rather
than editing by hand.
