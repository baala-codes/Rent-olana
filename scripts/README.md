# Scripts

Small, idempotent helpers used by the build, deploy, and docs workflows. Run
them from the repository root.

| Script | Purpose |
| --- | --- |
| [`install-toolchain.sh`](install-toolchain.sh) | Installs Rust (rustup), the Solana CLI (`v1.18.26`), and the pinned Anchor CLI (`0.30.1` via `avm`), per user. Safe to re-run. Linux/WSL only. |
| [`gen-keypairs.py`](gen-keypairs.py) | Pure-stdlib fallback that writes `solana-keygen`-format keypairs to `.keys/` without the Solana CLI. Never overwrites existing files. |
| [`export-clients.sh`](export-clients.sh) | Runs `anchor build`, copies the IDL and generated types into `clients/`, and fails if the program ID disagrees across `lib.rs`, `Anchor.toml`, and `clients/ts/constants.ts` (the three-place rule). |
| [`render-diagrams.sh`](render-diagrams.sh) | Renders the PlantUML diagram sources in [`../docs/diagrams/`](../docs/diagrams/) to committed SVGs. Requires PlantUML (with Java) and Graphviz. |

## Toolchain

```bash
bash scripts/install-toolchain.sh
```

After it finishes, add the toolchain to your shell profile:

```bash
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$HOME/.avm/bin:$PATH"
```

## Keys and clients

```bash
python3 scripts/gen-keypairs.py .keys admin treasury owner_a owner_b renter program
bash scripts/export-clients.sh
```

See [`../docs/SETUP.md`](../docs/SETUP.md) for the full wallet and deploy
runbook.

