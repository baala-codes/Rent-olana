# Documentation

Reference documentation for the asset-rental marketplace. The authoritative
design and build plan live outside this folder, in the repository's `new/`
directory:

- [`../new_architecture.md`](../new_architecture.md) — the architecture and on-chain contract.
- [`../new_tasklist.md`](../new_tasklist.md) — the LLM-executable build plan.

## Contents

| Document | Purpose |
| --- | --- |
| [`CONTRACT.md`](CONTRACT.md) | Frozen on-chain interface: program ID, account byte-offset tables, PDA seed byte tables, instruction table with discriminators and account lists, error table, and read-side rules for the backend mirror. |
| [`EXAMPLES.md`](EXAMPLES.md) | One worked example per instruction, with the exact ordered account list and the on-chain result. |
| [`SETUP.md`](SETUP.md) | Toolchain, wallet roles, the three-place program-ID rule, deploy steps, and a recorded devnet run. |
| [`diagrams/`](diagrams/) | PlantUML diagram sources and rendered SVGs, with [rendering instructions](diagrams/README.md). |

## How the pieces fit

`CONTRACT.md` is the single source of truth for account layouts, seeds,
instruction arguments, and error codes. `clients/ts/` encodes the same contract
for callers, `docs/EXAMPLES.md` shows how to invoke it, and `docs/SETUP.md`
covers building and deploying the program that implements it. Anything that
disagrees with `CONTRACT.md` is a bug to be reconciled before release.

