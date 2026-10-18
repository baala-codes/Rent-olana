#!/usr/bin/env bash
#
# Build the asset-rental program and publish its generated interface into
# clients/ so the portal and backend consume exactly what was compiled and
# deployed.
#
# Run after any change to the program, and commit the result together with the
# program change.
#
# Usage:
#   bash scripts/export-clients.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

for tool in anchor cargo; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "error: '$tool' is not on PATH. Run bash scripts/install-toolchain.sh first." >&2
    exit 1
  fi
done

# Go through the wrapper so the IDL build runs on a toolchain that can compile
# this workspace's locked dependencies (see scripts/anchor.sh).
echo "==> anchor build"
bash "$ROOT/scripts/anchor.sh" build

IDL="target/idl/asset_rental.json"
TYPES="target/types/asset_rental.ts"

for artifact in "$IDL" "$TYPES"; do
  if [ ! -f "$artifact" ]; then
    echo "error: expected build artifact '$artifact' was not produced" >&2
    exit 1
  fi
done

mkdir -p clients/idl clients/types
cp "$IDL" clients/idl/asset_rental.json
cp "$TYPES" clients/types/asset_rental.ts

# Regenerate the typed constants the portal, backend and tests import. The IDL
# is the single source of the discriminators, so this must run after every copy.
echo "==> generating clients/ts/generated.ts"
node "$ROOT/scripts/gen-client-constants.mjs"

echo "==> published"
echo "    clients/idl/asset_rental.json"
echo "    clients/types/asset_rental.ts"
echo "    clients/ts/generated.ts"

# Guard against drift in every place the program ID is written.
echo "==> contract check"
node "$ROOT/scripts/check-contract.mjs"
