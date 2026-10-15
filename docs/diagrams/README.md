# Architecture diagrams

The `.puml` files in this folder are the PlantUML source for the diagrams; each
has a committed `.svg` rendering.

To update a diagram, edit its `.puml` source and regenerate the SVGs from the
repository root:

```sh
bash scripts/render-diagrams.sh
```

The script renders **every** `docs/diagrams/*.puml` file, so a new diagram only
needs its source added here. Requires Bash, PlantUML (with Java), and Graphviz,
with `plantuml` and `dot` available on your PATH. Rendering runs locally without
a display server. Generated SVGs have a white background to keep labels readable
in GitHub's light and dark modes.

Commit the PlantUML source, updated SVG, and the Markdown that links them
together.

## Diagrams

| File | Depicts |
| --- | --- |
| `system-overview.*` | Portal, backend, RPC, and program overview |
| `on-chain-components.*` | The `asset-rental` program, its instructions, accounts, and the treasury |
| `on-chain-entities.*` | On-chain accounts (`PlatformConfig` → `AssetListing` → `RentalAgreement`) with their fields |
| `off-chain-components.*` | Backend services: search index, media storage, rental mirror, reconciler |
| `off-chain-entities.*` | Backend mirror entities (listing, rental, media) and the local audit log |
| `ssh-components.*`, `ssh-login.*` | The separate wallet-authenticated SSH workstream in [`../../ssh/`](../../ssh/) |

See [`../CONTRACT.md`](../CONTRACT.md) for the account layouts and PDA seeds, and
[`../../new_architecture.md`](../../new_architecture.md) for the system design.
