#!/usr/bin/env bash
#
# Install the toolchain needed to build, test, and deploy the asset-rental
# program: Rust, the Solana CLI, and the pinned Anchor CLI.
#
# Linux or WSL only. Anchor has no native Windows build, so on Windows run this
# inside WSL and keep the repository on the Linux filesystem for fast builds.
# The script is idempotent: anything already present is left alone.
#
# Usage:
#   bash scripts/install-toolchain.sh
#   SOLANA_VERSION=v1.18.26 ANCHOR_VERSION=0.30.1 bash scripts/install-toolchain.sh

set -euo pipefail

SOLANA_VERSION="${SOLANA_VERSION:-v1.18.26}"
ANCHOR_VERSION="${ANCHOR_VERSION:-0.30.1}"

echo "==> Rust"
if command -v rustc >/dev/null 2>&1; then
  echo "    already installed: $(rustc --version)"
else
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs |
    sh -s -- -y --profile minimal --default-toolchain stable
fi
# shellcheck disable=SC1090
. "$HOME/.cargo/env"

echo "==> Solana CLI ${SOLANA_VERSION}"
if command -v solana >/dev/null 2>&1; then
  echo "    already installed: $(solana --version)"
else
  sh -c "$(curl -sSfL "https://release.anza.xyz/${SOLANA_VERSION}/install")"
fi
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

echo "==> avm (Anchor version manager)"
if command -v avm >/dev/null 2>&1; then
  echo "    already installed"
else
  cargo install --git https://github.com/coral-xyz/anchor avm --locked
fi

echo "==> Anchor CLI ${ANCHOR_VERSION}"
avm install "${ANCHOR_VERSION}" || echo "    (already installed, switching)"
avm use "${ANCHOR_VERSION}"
export PATH="$HOME/.avm/bin:$PATH"

# anchor 0.30.1's IDL build exports RUSTUP_TOOLCHAIN=nightly itself, and the
# current generic nightly cannot compile this workspace's locked proc-macro2.
# nightly-2025-01-15 is the newest nightly that builds the whole workspace; it is
# pinned in rust-toolchain.toml and used by scripts/anchor.sh.
echo "==> Rust nightly-2025-01-15 (host toolchain for the IDL build)"
if rustup toolchain list | grep -q '^nightly-2025-01-15'; then
  echo "    already installed"
else
  rustup toolchain install nightly-2025-01-15 --profile minimal
fi

echo
echo "==> Versions"
anchor --version
solana --version
rustc --version

cat <<EOF

Add the following to your shell profile so future shells see the toolchain:

  export PATH="\$HOME/.cargo/bin:\$HOME/.local/share/solana/install/active_release/bin:\$HOME/.avm/bin:\$PATH"

Then (use the wrapper so the IDL build picks the pinned toolchain):

  bash scripts/anchor.sh build
  bash scripts/anchor.sh test --provider.cluster localnet

or the equivalent npm scripts: \`npm run build\`, \`npm run test:localnet\`.
Calling \`anchor build\` directly fails at the IDL step unless RUSTUP_TOOLCHAIN is
set (see the "Toolchain pin" section of docs/SETUP.md).
EOF
