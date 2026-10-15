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

echo "==> anchor build"
anchor build

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

echo "==> published"
echo "    clients/idl/asset_rental.json"
echo "    clients/types/asset_rental.ts"

# Guard against the program ID drifting between the three places it is written.
DECLARED="$(grep -oE 'declare_id!\("[1-9A-HJ-NP-Za-km-z]+"\)' programs/asset-rental/src/lib.rs | grep -oE '"[1-9A-HJ-NP-Za-km-z]+"' | tr -d '"')"
ANCHOR_TOML="$(grep -E '^asset_rental = ' Anchor.toml | head -1 | grep -oE '"[1-9A-HJ-NP-Za-km-z]+"' | tr -d '"')"
CLIENT_TS="$(grep -oE 'new PublicKey\("[1-9A-HJ-NP-Za-km-z]+"\)' clients/ts/constants.ts | grep -oE '"[1-9A-HJ-NP-Za-km-z]+"' | tr -d '"')"

echo "==> program ID check"
printf '    lib.rs        %s\n' "$DECLARED"
printf '    Anchor.toml   %s\n' "$ANCHOR_TOML"
printf '    constants.ts  %s\n' "$CLIENT_TS"

if [ "$DECLARED" != "$ANCHOR_TOML" ] || [ "$DECLARED" != "$CLIENT_TS" ]; then
  echo "error: program ID mismatch across lib.rs, Anchor.toml, and clients/ts/constants.ts" >&2
  exit 1
fi
