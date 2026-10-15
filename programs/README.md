# Solana programs

The POC's escrowed-rental program lives in [asset-rental/](asset-rental/) and is
implemented with Anchor 0.30.1.

The Anchor workspace root is the repository root: `Anchor.toml`, `Cargo.toml`,
`tests/`, and `migrations/` are all at the top level, and `asset-rental` is the
only workspace member under `programs/`.

| Where | What |
| --- | --- |
| [asset-rental/](asset-rental/) | The program: `PlatformConfig`, `AssetListing`, `RentalAgreement`; the instruction set; validation rules and invariants |
| [billing-access/](billing-access/) | Superseded: the original billing-and-access workstream scope note (archived) |
| [../clients/](../clients/) | Published client contract (TS helpers, IDL, generated types) |
| [../docs/CONTRACT.md](../docs/CONTRACT.md) | Account layouts, PDA seeds, instruction arguments, error codes |
| [../docs/EXAMPLES.md](../docs/EXAMPLES.md) | One worked transaction example per instruction |
| [../docs/SETUP.md](../docs/SETUP.md) | Toolchain, wallets, deploy, program ID, tests |
| [../tests/](../tests/) | Acceptance suite (`asset-rental.ts`) and fixture generation |

```bash
bash scripts/install-toolchain.sh     # Rust + Solana CLI + Anchor
anchor build                          # program, IDL, generated TS types
anchor test --provider.cluster localnet
```

The program crate name is `asset-rental` and its library name is `asset_rental`,
so the IDL is emitted as `target/idl/asset_rental.json`. See
[asset-rental/README.md](asset-rental/README.md) for the account/instruction
contract, and [`new_architecture.md`](../new_architecture.md) for
the system design.
