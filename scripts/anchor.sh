#!/usr/bin/env bash
#
# Wrapper around the `anchor` CLI that pins the Rust toolchain its IDL build
# needs. Prefer this over calling `anchor` directly (package.json does).
#
# Why: anchor 0.30.1's IDL build sets `RUSTFLAGS=--cfg procmacro2_semver_exempt`
# and exports `RUSTUP_TOOLCHAIN=nightly` when that variable is not already set.
# The current generic `nightly` cannot compile the `proc-macro2 1.0.94` pinned in
# Cargo.lock (`proc_macro::SourceFile` was removed from rustc), and stable/newer
# toolchains break `ark-bn254`. `nightly-2025-01-15` is the newest nightly that
# builds the whole workspace, so we pin it here.
#
# Any RUSTUP_TOOLCHAIN already present in the environment wins, so this can be
# overridden explicitly.
#
# Usage:
#   bash scripts/anchor.sh build
#   bash scripts/anchor.sh test --provider.cluster devnet
#   bash scripts/anchor.sh deploy --provider.cluster devnet

set -euo pipefail

export RUSTUP_TOOLCHAIN="${RUSTUP_TOOLCHAIN:-nightly-2025-01-15}"

exec anchor "$@"
