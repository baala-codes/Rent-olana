progress1


Program — completed and building

- Added all missing instruction modules ( escrow.rs  shared PDA-signed transfer helper +  register_asset ,  update_asset ,  set_listing_status ,  close_listing ,  create_rental ,  settle_rental ,  cancel_rental ,  dispute ,  resolve_dispute ,  close_rental ).
- Fixed  lib.rs  (declared/re-exported the missing  constants  module),  config.rs  ( Unauthorized  +  constants  import),  errors.rs  (added  InvalidTreasury ,  InvalidShare ), and one unused import.
- Verified:  cargo test -p asset-rental  → 7/7 pass, zero warnings;  cargo build-sbf  →  target/deploy/asset_rental.so  builds for the on-chain target.

Old code migrated to the new architecture

-  Anchor.toml  →  asset_rental , correct program ID,  .keys/admin.json  provider,  tests/asset-rental.ts .
-  migrations/deploy.ts  → idempotent  initialize_config(treasury, 250) .
-  clients/ts/{constants,pda,instructions}.ts  →  configPda/listingPda/rentalPda ,  newAssetId/newRentalId , all 12 instruction builders, account sizes, status/error tables.
-  tests/asset-rental.ts  (new; old  solana-vps.ts  removed) → register/create/overlap/replay/rejection-matrix/cancel/settle/dispute/pause/close/invariant-fuzz harness.
-  scripts/*  →  asset_rental  artifacts and three-place ID check;  render-diagrams.sh  no longer depends on the removed  Architecture.md .
-  docs/CONTRACT.md ,  EXAMPLES.md ,  SETUP.md  → fully rewritten (byte-offset tables, seed tables, real Anchor discriminators, error table, per-instruction account lists).
-  docs/diagrams/*  → system/on-chain/off-chain sources redrawn and re-rendered to SVG (PlantUML 1.2026.8); removed the obsolete billing-and-provisioning diagram.
-  package.json / package-lock.json  name/description updated.
- Verified:  tsc --noEmit  → clean.

Docs moved + banners removed

-  new_architecture.md  and  new_tasklist.md  moved into  lendersol/  (the  new/  dir is gone); all links rewritten and re-checked.
- Removed the archived/under-migration/legacy banners from all READMEs.
- Verified: link check across 18 READMEs, 90 relative links, all resolve; the only remaining old-program strings live in the intentionally-kept  ssh/  workstream and  programs/billing-access/ .

Could not run (limitations)

-  anchor build  / IDL generation did not run: the workspace pins  anchor-cli 0.30.1 , which isn't installed, and  avm install 0.30.1  fails in this environment (missing Rust  1.79.0  toolchain). So  target/idl/asset_rental.json ,  clients/idl/ , and  clients/types/  are not generated — run  bash scripts/export-clients.sh  after  avm install 0.30.1 . The clients compile without generated types.
- The TS suite and migration were typechecked but not executed (they need the generated IDL plus a validator/deploy).
- I did not delete  ssh/  or  programs/billing-access/  (old-architecture subsystems with no rental equivalent). This working tree has no git commits, so deletions would be unrecoverable — say the word and I'll remove them. Stale gitignored build/keys ( target/deploy/solana_vps.* ,  .keys/obsolete-vps-program.json ) are also left in place.
Suggested followups:
$ cd lendersol && echo "=== requested exact paths ===" && ls -1 new_architecture.md new_tasklist.md Anchor.toml migrations/deploy.ts tests/asset-rental.ts clients/ts/constants.ts clients/ts/pda.ts clients/ts/instructions.ts docs/CONTRACT.md docs/EXAMPLES.md docs/SETUP.md 2>&1; echo "=== old test removed? ==="; ls tests/solana-vps.ts 2>&1; echo "=== old new/ dir gone? ==="; ls -d ../new 2>&1; echo "=== instruction modules ==="; ls -1 programs/asset-rental/src/instructions/
=== requested exact paths ===
Anchor.toml
clients/ts/constants.ts
clients/ts/instructions.ts
clients/ts/pda.ts
All deliverables are in place at the requested paths.

Verified

Program (complete, builds, tested)
- All 12 instruction modules present ( escrow.rs  + 11 instructions) plus  config.rs / mod.rs .
-  cargo test -p asset-rental  → 7/7 pass, zero warnings;  cargo build-sbf  →  target/deploy/asset_rental.so  compiled for the on-chain target.

Old architecture migrated
-  Anchor.toml  ( asset_rental ),  migrations/deploy.ts  ( initialize_config ),  clients/ts/{constants,pda,instructions}.ts ,  tests/asset-rental.ts  (old  solana-vps.ts  removed),  scripts/* ,  docs/{CONTRACT,EXAMPLES,SETUP}.md ,  docs/diagrams/*  (sources redrawn and SVGs re-rendered),  package.json / package-lock.json .
-  npx tsc --noEmit  → clean. Link check → 18 READMEs, 90 links, all resolve.

Docs moved / banners
-  new_architecture.md  and  new_tasklist.md  now live at  lendersol/  root;  ../new/  no longer exists. All readme link paths updated.
- Archived/under-migration/legacy banners removed from all READMEs.

Could not run

-  anchor build  / IDL generation: the workspace pins  anchor-cli 0.30.1 , which isn't installed, and  avm install 0.30.1  fails here (missing Rust  1.79.0  toolchain). Therefore  target/idl/asset_rental.json ,  clients/idl/ , and  clients/types/  are not generated — run  bash scripts/export-clients.sh  after installing 0.30.1. (The clients compile without generated types, and the program's host tests and SBF build both pass.)
- The acceptance suite and migration were typechecked, not executed — they need the generated IDL plus a validator/deploy.

Remaining limitations

-  ssh/  (a full standalone Rust/QEMU workstream) and  programs/billing-access/  still contain old-architecture content; they were not listed in your request and are the only places old terms remain. This tree has no git commits, so I deliberately did not delete them (deletion would be unrecoverable) — confirm and I'll remove them plus the stale gitignored artifacts ( target/deploy/solana_vps.* ,  .keys/obsolete-vps-program.json ).
- Diagrams were rendered using a locally-fetched PlantUML 1.2026.8 jar via a temporary PATH shim; on a machine with  plantuml  installed,  bash scripts/render-diagrams.sh  regenerates them directly.
