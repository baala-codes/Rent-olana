#!/usr/bin/env bash
#
# Create the local wallet set a fresh clone needs to run the program tests.
#
#   bash scripts/bootstrap-keys.sh            # role keys only (tests work)
#   bash scripts/bootstrap-keys.sh --program  # also the deploy key, then sync
#
# Why: `Anchor.toml` points at `.keys/admin.json` and the acceptance suite loads
# `.keys/{admin,treasury,owner_a,owner_b,renter}.json`, but `.keys/` is gitignored
# (correctly — they are private keys). Without this, `npm test` fails on a fresh
# clone with ENOENT before any test runs.
#
# Existing files are never overwritten. Keys live only on this machine.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

QUIET=0
WITH_PROGRAM=0
for arg in "$@"; do
  case "$arg" in
    --quiet) QUIET=1 ;;
    --program) WITH_PROGRAM=1 ;;
    -h|--help)
      sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "error: unknown argument '$arg'" >&2
      exit 2
      ;;
  esac
done

log() { [ "$QUIET" -eq 1 ] || echo "$@"; }

ROLE_KEYS=(admin treasury owner_a owner_b renter)
mkdir -p .keys
chmod 700 .keys

missing=()
for name in "${ROLE_KEYS[@]}"; do
  [ -f ".keys/${name}.json" ] || missing+=("$name")
done

if [ "${#missing[@]}" -gt 0 ]; then
  if command -v solana-keygen >/dev/null 2>&1; then
    for name in "${missing[@]}"; do
      solana-keygen new --no-bip39-passphrase --silent --outfile ".keys/${name}.json" >/dev/null
    done
  elif command -v python3 >/dev/null 2>&1; then
    # Pure-stdlib Ed25519 fallback; the format is identical to solana-keygen.
    python3 scripts/gen-keypairs.py .keys "${missing[@]}" >/dev/null
  else
    echo "error: need 'solana-keygen' or 'python3' to create .keys/" >&2
    echo "       run bash scripts/install-toolchain.sh first" >&2
    exit 1
  fi
  log "==> created ${#missing[@]} keypair(s) in .keys/"
else
  log "==> .keys/ already has the role keypairs"
fi

if [ "$WITH_PROGRAM" -eq 1 ] && [ ! -f .keys/program.json ]; then
  if command -v python3 >/dev/null 2>&1; then
    python3 scripts/gen-keypairs.py .keys program >/dev/null
  else
    solana-keygen new --no-bip39-passphrase --silent --outfile .keys/program.json >/dev/null
  fi
  log "==> created .keys/program.json"
fi

if [ -f .keys/program.json ]; then
  mkdir -p target/deploy
  if [ ! -f target/deploy/asset_rental-keypair.json ]; then
    cp .keys/program.json target/deploy/asset_rental-keypair.json
    chmod 600 target/deploy/asset_rental-keypair.json
    log "==> linked target/deploy/asset_rental-keypair.json"
  fi

  if [ "$WITH_PROGRAM" -eq 1 ] && command -v anchor >/dev/null 2>&1; then
    log "==> anchor keys sync (this can change the program ID)"
    anchor keys sync
    log "    now run: bash scripts/export-clients.sh"
    log "    and update docs/CONTRACT.md, docs/EXAMPLES.md, docs/SETUP.md if the ID moved"
  fi
fi

if [ "$QUIET" -eq 0 ]; then
  echo
  printf '%-10s %-46s %s\n' "key" "address" "role"
  printf '%-10s %-46s %s\n' "---" "-------" "----"
  for name in "${ROLE_KEYS[@]}"; do
    if command -v python3 >/dev/null 2>&1; then
      address="$(python3 scripts/gen-keypairs.py .keys "$name" | awk '{print $2}')"
    else
      address="$(solana-keygen pubkey ".keys/${name}.json")"
    fi
    case "$name" in
      admin) role="config admin, dispute resolver, tx fee payer" ;;
      treasury) role="receives the platform fee" ;;
      renter) role="books rentals and escrows" ;;
      *) role="listing owner" ;;
    esac
    printf '%-10s %-46s %s\n' "$name" "$address" "$role"
  done
  echo
  echo "These are local test keys. Never commit .keys/ or reuse them on mainnet."
fi
