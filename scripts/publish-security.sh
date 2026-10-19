#!/usr/bin/env bash
#
# Publish security.json as the canonical program metadata account
# (seed "security"), which Solana Explorer reads as security.txt.
#
# Only the program upgrade authority can create a canonical metadata account.
# This script checks that the keypair you pass matches the on-chain authority
# before it spends anything.
#
# Usage:
#   bash scripts/publish-security.sh /path/to/upgrade-authority.json
#   UPGRADE_AUTHORITY_KEYPAIR=/path/to/keypair.json bash scripts/publish-security.sh
#   RPC_URL=https://api.mainnet-beta.solana.com bash scripts/publish-security.sh /path/to/keypair.json
#
# Requires: solana CLI, node/npx, a funded authority wallet (~0.003 SOL).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PROGRAM_ID="$(sed -n 's/.*declare_id!("\([1-9A-HJ-NP-Za-km-z]*\)").*/\1/p' \
  programs/asset-rental/src/lib.rs)"
RPC_URL="${RPC_URL:-https://api.devnet.solana.com}"
KEYPAIR="${1:-${UPGRADE_AUTHORITY_KEYPAIR:-}}"

if [ -z "$PROGRAM_ID" ]; then
  echo "error: could not read declare_id! from programs/asset-rental/src/lib.rs" >&2
  exit 1
fi

if [ -z "$KEYPAIR" ]; then
  echo "usage: bash scripts/publish-security.sh /path/to/upgrade-authority.json" >&2
  exit 1
fi

if [ ! -f "$KEYPAIR" ]; then
  echo "error: keypair not found: $KEYPAIR" >&2
  exit 1
fi

if [ ! -f security.json ]; then
  echo "error: security.json is missing from the repository root" >&2
  exit 1
fi

SIGNER="$(solana address -k "$KEYPAIR")"
AUTHORITY="$(solana program show "$PROGRAM_ID" --url "$RPC_URL" --keypair "$KEYPAIR" \
  | awk '/Authority:/{print $2}')"

echo "program:   $PROGRAM_ID"
echo "rpc:       $RPC_URL"
echo "signer:    $SIGNER"
echo "authority: $AUTHORITY"

if [ "$SIGNER" != "$AUTHORITY" ]; then
  echo >&2
  echo "error: this keypair is not the program upgrade authority." >&2
  echo "Only $AUTHORITY can create the canonical security.txt account." >&2
  exit 1
fi

BALANCE="$(solana balance "$SIGNER" --url "$RPC_URL" | awk '{print $1}')"
echo "balance:   $BALANCE SOL"
echo
echo "==> writing security.txt (seed \"security\")"
npx -y @solana-program/program-metadata@latest write security "$PROGRAM_ID" ./security.json \
  --keypair "$KEYPAIR" \
  --rpc "$RPC_URL"

echo
echo "==> reading it back"
npx -y @solana-program/program-metadata@latest fetch security "$PROGRAM_ID" \
  --rpc "$RPC_URL"
