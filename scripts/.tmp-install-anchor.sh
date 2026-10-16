#!/usr/bin/env bash
# Temporary helper (deleted after setup): install Anchor CLI 0.30.1 from source
# with Rust 1.79.0, the newest toolchain compatible with its pinned `time` 0.3.x.
set -euo pipefail
. "$HOME/.cargo/env"
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
cd "$HOME"
cargo +1.79.0 install --git https://github.com/coral-xyz/anchor --tag v0.30.1 anchor-cli --locked
echo "ANCHOR_INSTALL_DONE"
