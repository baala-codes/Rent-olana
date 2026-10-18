# Setup, deploy, and wallet runbook

**Cluster:** `devnet` (local validator for isolated tests)

Everything here assumes a Linux or WSL shell. Anchor has no native Windows
build, so on Windows run these commands inside WSL. Building Rust on `/mnt/c`
works but is slow; keep the repository on the Linux filesystem.

## 1. Toolchain

```bash
bash scripts/install-toolchain.sh
```

Installs Rust (rustup), the Solana CLI (`v1.18.26`), and the Anchor CLI
(`0.30.1` via `avm`), all per-user. Re-running it is safe. Afterwards, add the
toolchain to your shell profile:

```bash
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$HOME/.avm/bin:$PATH"
```

Check:

```bash
anchor --version   # anchor-cli 0.30.1
solana --version   # solana-cli 1.18.26
rustc --version
```

The program is pinned to `anchor-lang 0.30.1`, so the Anchor CLI must be
`0.30.1`. If another version is active, run `avm use 0.30.1`.

Node 22 LTS is required: `ts-mocha`, which the Anchor acceptance suite uses,
does not run on Node 26 (a yargs/ESM incompatibility). Then, from the repository
root:

```bash
npm ci
```

The portal, `shared/`, and `backend/` each have their own `package.json` and are
installed separately when you work on them (`npm install` in that directory).

## 2. Wallets

Five role wallets plus the program keypair. All of them live in `.keys/`, which
is gitignored — never commit or share these files.

```bash
bash scripts/bootstrap-keys.sh --program   # or: npm run keys:init
```

That creates the five role wallets (and the program keypair with `--program`) in
`.keys/`, links `target/deploy/asset_rental-keypair.json`, and prints the public
addresses. It never overwrites an existing key. `scripts/anchor.sh` also calls
it automatically before any command that needs a signing wallet, so a fresh
clone can run the localnet suite without a separate step.

`scripts/gen-keypairs.py` is a pure-stdlib fallback for environments without the
Solana CLI. If you have `solana-keygen`, the equivalent is:

```bash
for k in admin treasury owner_a owner_b renter program; do
  solana-keygen new --no-bip39-passphrase -s -o ".keys/$k.json"
done
```

| Key | Role | Needs SOL? |
| --- | --- | --- |
| `admin` | initializes/mutates `PlatformConfig`; resolves disputes; deploy authority | yes — deploy + funds the suite |
| `treasury` | receives the platform fee | no — it only receives |
| `owner_a` | registers listings and settles rentals | no for the suite — funded by `admin` |
| `owner_b` | registers listings and settles rentals | no for the suite — funded by `admin` |
| `renter` | books listings and escrows price + deposit | no for the suite — funded by `admin` |
| `program` | the program account itself | no — `admin` pays deploy rent |

Fund **only `admin`** on devnet. The acceptance suite sends **0.05 SOL** to each
role wallet, so the test run itself needs about 0.2 SOL; deployment rent is on
top of that.

```bash
solana config set --url https://api.devnet.solana.com
addr=$(solana-keygen pubkey ".keys/admin.json")

# Public RPC is usually rate-limited. Prefer a provider faucet/RPC:
#   https://faucet.quicknode.com/solana/devnet
#   https://faucet.solana.com/
#   Helius dashboard -> Devnet faucet
solana airdrop 1 "$addr" --url devnet
solana balance "$addr" --url devnet
```

The airdrop is rate-limited per IP. If it fails, use a provider faucet or
another funded wallet. The treasury needs no SOL; it only receives. If you want
to exercise the role wallets directly instead of through the suite, fund each
of them separately.

`Anchor.toml` points `provider.wallet` at `.keys/admin.json`, so the admin
keypair is also the deploy authority and signs `initialize_config` in the
migration.

## 3. Program ID — the one value that must match everywhere

The program ID must agree across the Rust declaration, `Anchor.toml`, and the
published IDL. The client constants are **generated** from the IDL, so they
cannot disagree on their own.

| Location | Written as |
| --- | --- |
| `programs/asset-rental/src/lib.rs` | `declare_id!("…")` |
| `Anchor.toml` | `[programs.devnet] asset_rental = "…"` and `[programs.localnet]` |
| `clients/idl/asset_rental.json` | `"address": "…"` (build output) |
| `clients/ts/generated.ts` | generated from the IDL — do not edit |

On a fresh clone, the checked-in ID will not match your own program keypair. Fix
it in one step:

```bash
bash scripts/bootstrap-keys.sh --program   # creates the key and runs keys sync
bash scripts/export-clients.sh             # rebuilds the IDL + generated client
```

`export-clients.sh` then runs `scripts/check-contract.mjs`, which fails if the
ID, the IDL, the client constants, or the builder set disagree:

```bash
npm run contract:check
```

Keep `target/deploy/asset_rental-keypair.json` and `.keys/program.json` safe: if
you lose them you cannot upgrade the deployed program under the same address.

## 4. Build

```bash
anchor build
```

This compiles the program for SBF and generates `target/idl/asset_rental.json`,
`target/types/asset_rental.ts`, and `target/deploy/asset_rental.so`.

Publish the interface for the portal and backend:

```bash
bash scripts/export-clients.sh
```

Commit `clients/idl/` and `clients/types/` together with the program change.

## 5. Deploy to devnet

```bash
solana config set --url https://api.devnet.solana.com
anchor deploy --provider.cluster devnet
```

`anchor deploy` runs [`migrations/deploy.ts`](../migrations/deploy.ts) right
after the program lands. That migration creates the singleton `PlatformConfig`
(admin-signed) with the configured treasury and a 250 bps fee. It is idempotent:
if the config account already exists it logs the current values and returns.

Verify:

```bash
solana program show DhbEciuQ2HDMUbQzCRnGWe15cYK9wSav9KgXP42v4DUZ --url devnet
```

The first deploy must happen **before** the IDL accounts for a deployed
authority; if `declare_id!` changes, re-run `anchor build` and `anchor deploy` so
the deployed program and the IDL agree.

## 6. Record the deployment

Keep this table current, and add the signature of a real
`register_asset` + `create_rental` + `settle_rental` run to `fixtures/`.

| Item | Value |
| --- | --- |
| Cluster | `devnet` |
| Program ID | `DhbEciuQ2HDMUbQzCRnGWe15cYK9wSav9KgXP42v4DUZ` |
| Deployment tx | *(pending — record `anchor deploy` output here)* |
| `initialize_config` tx | *(pending — record from the migration output)* |
| register/book/settle tx | *(pending — record from a devnet run)* |

Locally generated wallets in `.keys/` (public keys only; the keypair files are
gitignored):

| Key | Public key |
| --- | --- |
| `admin` | `D3kN3a8rqjZZmkgT9HNa6MvSmXBryp58XCP2uV37LMnq` |
| `treasury` | `8tQDkhEo1EdheZyFEV8SZmFWyWhmar14JgSHpTjBfQWr` |
| `owner_a` | `8NJHN1kPzbKC7j5HwonjAY65rH5TdWMaevPwiGUEC8Yc` |
| `owner_b` | `9oQip5maa54t9zVHDHt13mQuWDEQt6ALMb3dBaVg6AsX` |
| `renter` | `BJicrqS5cSQZzoDUdTJyDdKaUrautBSEWLzbCv2qF5TW` |
| `program` | `DhbEciuQ2HDMUbQzCRnGWe15cYK9wSav9KgXP42v4DUZ` |

## 7. A live devnet fixture

Once, with real values, so the portal and backend have live accounts to read.
Register a listing, book it, and settle it, then record the signatures in
`fixtures/`. The client helpers derive every PDA:

```ts
import { newAssetId, newRentalId, registerAsset, createRental, settleRental } from "../clients/ts";

const assetId = newAssetId();
const rentalId = newRentalId();
// registerAsset → createRental → settleRental, using the wallet keypairs.
```

See [`EXAMPLES.md`](EXAMPLES.md) for the exact account lists per instruction.

## 8. Tests

Isolated program unit tests (Rust, no validator):

```bash
cargo test -p asset-rental
```

The TypeScript acceptance suite against a throwaway validator:

```bash
anchor test --provider.cluster localnet
```

Against the configured devnet deployment (requires funded wallets):

```bash
anchor test --provider.cluster devnet
```

`anchor test` boots a local validator and starts a fresh ledger for localnet;
`test-ledger/` is gitignored. Fixtures written by the suite land in
`fixtures/` — see [fixtures/README.md](../fixtures/README.md).

The validator-free checks (no Rust or Solana toolchain required):

```bash
npm run contract:check     # IDL / program ID / builder drift
npm run test:client        # encoding, decoders, error parsing
npm run test:shared        # metadata commitment and search limits
npm run test:backend       # mirror, search, auth, media, HTTP API
```

## 9. Run the backend

```bash
cd backend
npm install
ADMIN_TOKEN=dev-only-token npm start     # http://127.0.0.1:8787
```

The mirror starts empty. Populate it from finalized devnet state:

```bash
curl -X POST -H "x-admin-token: dev-only-token" http://127.0.0.1:8787/v1/admin/sync
```

Set `SYNC_ON_START=1` and/or `SYNC_INTERVAL_MS=60000` to do that on a schedule.
See [backend/README.md](../backend/README.md) for the full API, configuration,
and the wallet-signature scheme used for owner-only metadata/media writes.
Do **not** expose the backend without a reverse proxy and TLS: wallet signatures
protect writes, but reads and media are public by design.

## 10. Docker (optional local packaging)

Build from the repository root; both images need the shared client and shared
package:

```bash
docker compose up --build
# portal:  http://localhost:8080
# backend: http://localhost:8787
docker compose exec backend sh -c 'curl -s localhost:8787/health'
```

The backend starts with `SYNC_ON_START=1` and `SYNC_INTERVAL_MS=60000` in
`docker-compose.yml`, so the index fills from devnet automatically. Set
`ADMIN_TOKEN`, `NOTIFY_WEBHOOK_URL`, or `RPC_URL` in the environment to override
the local defaults. The mirror and media live in the `mirror-data` volume.

CI is in `.github/workflows/ci.yml`: one job runs `npm run verify` plus the
portal build; a second runs `cargo test`, `anchor build`, and the localnet
acceptance suite on a toolchain host.

## 11. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `anchor: command not found` | Add `$HOME/.avm/bin` and `$HOME/.cargo/bin` to `PATH` (§1). |
| `error: no such command: build-sbf` | Solana CLI missing or not first on `PATH`; re-run `scripts/install-toolchain.sh`. |
| Wrong Anchor version | The program pins `anchor-lang 0.30.1`; run `avm use 0.30.1`. |
| `AnchorError caused by account: listing. Error Code: ConstraintSeeds` | The client derived a PDA with a different program ID or `asset_id` than the account was created with. |
| `ConstraintHasOne` on `settle_rental` / `cancel_rental` | The `owner_wallet` / `renter_wallet` passed does not match the stored rental party. |
| Deploy fails with insufficient funds | Fund `.keys/admin.json` with devnet SOL; deployment rent is a few SOL. |
| `anchor keys sync` changed the ID | Expected: it rewrites `lib.rs` and `Anchor.toml`. Run `bash scripts/export-clients.sh` to rebuild the IDL and regenerate the client constants, then redeploy. |
| Tests fail with `Account does not exist` | Run against a fresh localnet, or you are pointed at a different cluster than the accounts were created on. |
| Airdrop fails | Devnet faucet rate limit; wait or fund from another wallet. |
