#!/usr/bin/env bash
#
# Reproducible build check for the asset-rental program.
#
# This never deploys or upgrades anything. It builds in Docker with
# solana-verify, then prints the executable hash and the on-chain hash so you can
# see whether the deployed program came from this source.
#
# Usage:
#   bash scripts/verify-build.sh
#   RPC_URL=https://api.mainnet-beta.solana.com bash scripts/verify-build.sh
#
# Requires: docker, cargo, solana-verify (`cargo install solana-verify --locked`).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PROGRAM_ID="$(sed -n 's/.*declare_id!("\([1-9A-HJ-NP-Za-km-z]*\)").*/\1/p' \
  programs/asset-rental/src/lib.rs)"
LIB_NAME="asset_rental"
RPC_URL="${RPC_URL:-https://api.devnet.solana.com}"

if [ -z "$PROGRAM_ID" ]; then
  echo "error: could not read declare_id! from programs/asset-rental/src/lib.rs" >&2
  exit 1
fi

for tool in docker cargo solana-verify; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "error: $tool is required" >&2
    if [ "$tool" = "solana-verify" ]; then
      echo "       install with: cargo install solana-verify --locked" >&2
    fi
    exit 1
  fi
done

echo "==> building $LIB_NAME reproducibly (Docker)"
solana-verify build --library-name "$LIB_NAME"

ARTIFACT="target/deploy/${LIB_NAME}.so"
if [ ! -f "$ARTIFACT" ]; then
  echo "error: $ARTIFACT was not produced" >&2
  exit 1
fi

EXECUTABLE_HASH="$(solana-verify get-executable-hash "$ARTIFACT")"
ONCHAIN_HASH="$(solana-verify get-program-hash -u "$RPC_URL" "$PROGRAM_ID")"

echo
echo "program:          $PROGRAM_ID"
echo "rpc:              $RPC_URL"
echo "executable hash:  $EXECUTABLE_HASH"
echo "on-chain hash:    $ONCHAIN_HASH"

if [ "$EXECUTABLE_HASH" != "$ONCHAIN_HASH" ]; then
  echo
  echo "MISMATCH: the deployed program was not built from this source and toolchain." >&2
  echo "Deploy this artifact before uploading a verification PDA." >&2
  echo "Do not use 'anchor build' for the deployed binary." >&2
  exit 2
fi

echo
echo "MATCH: this source reproduces the deployed program."
echo "Next: solana-verify verify-from-repo ... (see docs/VERIFY.md)"
