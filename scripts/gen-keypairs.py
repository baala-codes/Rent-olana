#!/usr/bin/env python3
"""Generate Solana keypairs without the Solana CLI.

Produces the exact JSON keypair format used by `solana-keygen` (a flat array of
64 integers: the 32-byte Ed25519 seed followed by the 32-byte public key), and
prints the base58 public key for each generated key.

Usage:
    python3 scripts/gen-keypairs.py <out-dir> <name> [<name> ...]

Example:
    python3 scripts/gen-keypairs.py .keys admin treasury owner_a owner_b renter program

Existing files are never overwritten, so the script is safe to re-run. It is a
pure-stdlib fallback for environments that do not have `solana-keygen` on PATH;
if you do have the Solana CLI, prefer `solana-keygen new --no-bip39-passphrase`.

The Ed25519 routines below are the RFC 8032 reference implementation.
"""

import hashlib
import json
import os
import sys

# --- Ed25519 (RFC 8032 reference implementation) -----------------------------

_q = 2**255 - 19
_l = 2**252 + 27742317777372353535851937790883648493
_B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def _h(m: bytes) -> bytes:
    return hashlib.sha512(m).digest()


def _expmod(b: int, e: int, m: int) -> int:
    if e == 0:
        return 1
    t = _expmod(b, e // 2, m) ** 2 % m
    if e & 1:
        t = (t * b) % m
    return t


def _inv(x: int) -> int:
    return _expmod(x, _q - 2, _q)


_d = -121665 * _inv(121666) % _q
_I = _expmod(2, (_q - 1) // 4, _q)


def _xrecover(y: int) -> int:
    xx = (y * y - 1) * _inv(_d * y * y + 1)
    x = _expmod(xx, (_q + 3) // 8, _q)
    if (x * x - xx) % _q != 0:
        x = (x * _I) % _q
    if x % 2 != 0:
        x = _q - x
    return x


_By = 4 * _inv(5) % _q
_B = [_xrecover(_By) % _q, _By % _q]


def _edwards(p, q):
    x1, y1 = p
    x2, y2 = q
    k = _d * x1 * x2 * y1 * y2
    x3 = (x1 * y2 + x2 * y1) * _inv(1 + k)
    y3 = (y1 * y2 + x1 * x2) * _inv(1 - k)
    return [x3 % _q, y3 % _q]


def _scalarmult(p, e):
    q = [0, 1]
    while e > 0:
        if e & 1:
            q = _edwards(q, p)
        p = _edwards(p, p)
        e >>= 1
    return q


def _encodepoint(p) -> bytes:
    x, y = p
    bits = y | ((x & 1) << 255)
    return bits.to_bytes(32, "little")


def public_key(seed: bytes) -> bytes:
    """Derive the 32-byte Ed25519 public key for a 32-byte seed."""
    digest = _h(seed)
    scalar = 2**254 + sum(
        2**i * ((digest[i // 8] >> (i % 8)) & 1) for i in range(3, 254)
    )
    return _encodepoint(_scalarmult(_B, scalar))


# --- base58 ------------------------------------------------------------------


def b58encode(raw: bytes) -> str:
    n = int.from_bytes(raw, "big")
    out = ""
    while n > 0:
        n, rem = divmod(n, 58)
        out = _B58_ALPHABET[rem] + out
    pad = 0
    for byte in raw:
        if byte == 0:
            pad += 1
        else:
            break
    return "1" * pad + out


# --- main --------------------------------------------------------------------


def main(argv) -> int:
    if len(argv) < 3:
        print(__doc__)
        return 2

    out_dir, names = argv[1], argv[2:]
    os.makedirs(out_dir, exist_ok=True)

    for name in names:
        path = os.path.join(out_dir, f"{name}.json")
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as handle:
                raw = bytes(json.load(handle))
            print(f"{name}: {b58encode(raw[32:])}  (existing, left untouched)")
            continue

        seed = os.urandom(32)
        raw = seed + public_key(seed)
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(list(raw), handle)
        os.chmod(path, 0o600)
        print(f"{name}: {b58encode(raw[32:])}  -> {path}")

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
