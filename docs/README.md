# Documentation

Reference documentation for the asset-rental marketplace. The authoritative
design and build plan live at the repository root:

- [`../new_architecture.md`](../new_architecture.md) — the architecture and on-chain contract.
- [`../new_tasklist.md`](../new_tasklist.md) — the LLM-executable build plan.

## Contents

| Document | Purpose |
| --- | --- |
| [`CONTRACT.md`](CONTRACT.md) | Frozen on-chain interface: program ID, account byte-offset tables, PDA seed byte tables, instruction table with discriminators and account lists, error table, and read-side rules for the backend mirror. |
| [`EXAMPLES.md`](EXAMPLES.md) | One worked example per instruction, with the exact ordered account list and the on-chain result. |
| [`SETUP.md`](SETUP.md) | Toolchain, wallet bootstrap, the program-ID drift check, deploy steps, and backend startup. |
| [`DEPLOY-VERCEL.md`](DEPLOY-VERCEL.md) | Portal deployment on Vercel, `VITE_API_URL`, and the persistent backend requirement. |
| [`VERIFY.md`](VERIFY.md) | Reproducible builds, the Explorer verified badge, and the on-chain security.txt account. |
| [`MEDIA.md`](MEDIA.md) | On-chain image costs and the recommended off-chain media options. |
| [`diagrams/`](diagrams/) | PlantUML diagram sources and rendered SVGs, with [rendering instructions](diagrams/README.md). |

## How the pieces fit

`CONTRACT.md` is the single source of truth for account layouts, seeds,
instruction arguments, and error codes. `clients/ts/wire.ts` encodes the same
contract for every caller (portal, backend, tests), `docs/EXAMPLES.md` shows how
to invoke it, and `docs/SETUP.md` covers building/deploying the program and
running the backend. `npm run contract:check` reconciles the IDL, the program ID,
and the client builders; anything else that disagrees with `CONTRACT.md` is a bug
to fix before release.

