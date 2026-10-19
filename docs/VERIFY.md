# Verified build and security.txt

## Current deployment

| Field | Value |
| --- | --- |
| Cluster | devnet |
| Program ID | `Ge4Z9acYsYxSj8UsVo1W3yMroEbonZBUshUW2wGgNaCg` |
| ProgramData | `CwZXBAL64ohVjMey8eXo38KNd73SLVgsUTSeDbXVe6Xv` |
| Upgrade authority | `52vbxxWPbmnnAHD52uB9nSd4nLL67VHWv9MMzicUGecW` |

The local `.keys/admin.json` is **not** the upgrade authority
(`9Vzp1PAppAn6jhvoPdpf1JMYuy9VbrmCJgFCMWJkrmm3`). Use the wallet or keypair that
controls `52vbx…` for any authority-signed operation.

## Why Solana Explorer says "Program Not Verified"

A verified build proves that the deployed `.so` was produced from a public
commit in a reproducible Docker build. The verification data is uploaded to a
PDA and then processed by the OtterSec worker that feeds Solana Explorer.

Two separate constraints apply to this deployment:

1. **The deployed binary must match the reproducible build.** A normal
   `anchor build` is not guaranteed to produce the same bytes. Build with
   `solana-verify`, then deploy *that* artifact.
2. **Remote verification is mainnet-only.** The official Solana guide states:
   "Remote verification will only work on mainnet." The Explorer's verified
   badge therefore cannot be completed for a devnet-only program. A devnet PDA
   can be uploaded, but do not expect the badge until the program is deployed
   to mainnet-beta and a remote job succeeds.

## 1. Install the tools

```bash
cargo install solana-verify --locked
docker --version
```

Docker is required. The current host does not have it, so the build and
verification below must run on a machine or CI runner with Docker.

The workspace root pins the Agave version in `Cargo.toml`:

```toml
[workspace.metadata.cli]
solana = "1.18.26"
```

## 2. Build deterministically

From the repository root:

```bash
solana-verify build --library-name asset_rental
solana-verify get-executable-hash target/deploy/asset_rental.so
solana-verify get-program-hash -u devnet Ge4Z9acYsYxSj8UsVo1W3yMroEbonZBUshUW2wGgNaCg
```

`scripts/verify-build.sh` runs these three commands and compares the hashes.

If the hashes differ, the on-chain program was not built from this source/toolchain.
Deploy the verified artifact (this needs the upgrade authority and SOL for the
temporary buffer + fees):

```bash
solana config set --url devnet --keypair /path/to/52vbx-authority.json
solana program deploy target/deploy/asset_rental.so \
  --program-id Ge4Z9acYsYxSj8UsVo1W3yMroEbonZBUshUW2wGgNaCg
```

Do not overwrite the deployed program with `anchor build` or `cargo build-sbf`
afterward; those are not the verified artifact.

## 3. Verify against the public repository

The repository is public:
`https://github.com/baala-codes/Rent-olana`.

Commit the exact program source first, then use that commit hash:

```bash
COMMIT=$(git rev-parse HEAD)
solana-verify verify-from-repo -u devnet \
  --program-id Ge4Z9acYsYxSj8UsVo1W3yMroEbonZBUshUW2wGgNaCg \
  https://github.com/baala-codes/Rent-olana \
  --commit-hash "$COMMIT" \
  --library-name asset_rental \
  --mount-path programs/asset-rental
```

When prompted, upload the verification PDA. The uploader is normally the
upgrade authority.

For mainnet, after the PDA is uploaded:

```bash
solana-verify remote submit-job \
  --program-id <program-id> \
  --uploader <authority-pubkey>

solana-verify remote get-job --job-id <job-id>
```

The Explorer clears the verified status after every program upgrade, so repeat
the verify step after deploying a new build.

## 4. Publish security.txt

`security.json` at the repository root is the canonical payload. It is read from
the program metadata account with seed `security`, derived from the program and
created by the **upgrade authority**. Solana Explorer displays this account's
name, logo, description, and contacts.

```bash
npx @solana-program/program-metadata@latest write security \
  Ge4Z9acYsYxSj8UsVo1W3yMroEbonZBUshUW2wGgNaCg \
  ./security.json \
  --keypair /path/to/52vbx-authority.json \
  --rpc https://api.devnet.solana.com
```

Or use the checked-in helper, which first confirms the keypair is the on-chain
upgrade authority:

```bash
bash scripts/publish-security.sh /path/to/52vbx-authority.json
```

Confirm the account:

```bash
npx @solana-program/program-metadata@latest fetch security \
  Ge4Z9acYsYxSj8UsVo1W3yMroEbonZBUshUW2wGgNaCg \
  --rpc https://api.devnet.solana.com
```

The authority wallet needs roughly `0.003 SOL` for the metadata account rent and
transaction fees. If the authority is a multisig, use the CLI's `--export` flow
documented in `@solana-program/program-metadata`.

## Why this cannot be finished from this workspace

- Docker is not installed here, so the reproducible build cannot run.
- The upgrade authority keypair (`52vbx…`) is not in `.keys/`; signing with the
  local `admin` key would fail.
- The local `admin` wallet has `0 SOL` and the faucet is exhausted, so it cannot
  pay for the metadata account anyway.

Provide the authority keypair (or a funded signer it controls) and run the two
commands above on a Docker-capable machine.
