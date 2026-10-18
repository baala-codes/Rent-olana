/**
 * Wallet authentication for off-chain writes.
 *
 * The chain proves who owns a listing; the backend needs the same proof before
 * it stores that listing's metadata or media. A request carries:
 *
 *   x-wallet      base58 public key
 *   x-issued-at   Unix seconds (accepted within +/- 5 minutes)
 *   x-nonce       16+ random characters, single-use
 *   x-signature   base58 Ed25519 signature over the canonical message
 *
 * Canonical message (UTF-8, newline separated):
 *
 *   asset-rental:v1
 *   <METHOD>
 *   <path>
 *   <sha256 hex of the raw body bytes, e3b0c442... for an empty body>
 *   <issued-at>
 *   <nonce>
 *
 * Ed25519 verification uses Node's crypto with a raw 32-byte key wrapped in the
 * fixed SPKI prefix. No shared secret and no session: the signature bounds this
 * one request, and the nonce stops a replay of it.
 */

import { createHash, createPublicKey, verify } from "node:crypto";

import type { MirrorDb } from "./db.ts";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const MAX_SKEW_SECONDS = 300;

export class AuthError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export function base58Decode(value: string): Uint8Array {
  if (value.length === 0) throw new AuthError(401, "empty base58 value");
  let number = 0n;
  for (const character of value) {
    const index = ALPHABET.indexOf(character);
    if (index < 0) throw new AuthError(401, "invalid base58 character");
    number = number * 58n + BigInt(index);
  }
  const bytes: number[] = [];
  while (number > 0n) {
    bytes.unshift(Number(number % 256n));
    number /= 256n;
  }
  for (const character of value) {
    if (character !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

export function base58Encode(bytes: Uint8Array): string {
  let number = 0n;
  for (const byte of bytes) number = number * 256n + BigInt(byte);
  let out = "";
  while (number > 0n) {
    out = ALPHABET[Number(number % 58n)] + out;
    number /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = `1${out}`;
  }
  return out;
}

export interface AuthHeaders {
  wallet: string;
  issuedAt: number;
  nonce: string;
  signature: string;
}

export interface AuthRequest {
  method: string;
  path: string;
  /** Raw body bytes; for JSON pass the exact UTF-8 text that was sent. */
  body: string | Uint8Array;
}

export function authMessage(
  request: AuthRequest,
  issuedAt: number,
  nonce: string
): string {
  const bodyHash = createHash("sha256").update(request.body).digest("hex");
  return [
    "asset-rental:v1",
    request.method.toUpperCase(),
    request.path,
    bodyHash,
    String(issuedAt),
    nonce,
  ].join("\n");
}

/** Verify the Ed25519 signature over the canonical message. */
export function verifyAuthSignature(headers: AuthHeaders, request: AuthRequest): void {
  let publicKeyBytes: Uint8Array;
  let signatureBytes: Uint8Array;
  try {
    publicKeyBytes = base58Decode(headers.wallet);
    signatureBytes = base58Decode(headers.signature);
  } catch (error) {
    throw new AuthError(401, error instanceof Error ? error.message : "invalid encoding");
  }
  if (publicKeyBytes.length !== 32) throw new AuthError(401, "wallet must be a 32-byte public key");
  if (signatureBytes.length !== 64) throw new AuthError(401, "signature must be 64 bytes");

  const publicKey = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyBytes)]),
    format: "der",
    type: "spki",
  });

  const message = Buffer.from(authMessage(request, headers.issuedAt, headers.nonce), "utf8");
  if (!verify(null, message, publicKey, Buffer.from(signatureBytes))) {
    throw new AuthError(401, "signature does not match the request");
  }
}

export interface ParsedRequest extends AuthRequest {
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Authenticate a write request and return the signer's base58 wallet.
 *
 * `now` is injectable so tests can pin the clock.
 */
export function authenticate(
  db: MirrorDb,
  request: ParsedRequest,
  now: () => number = () => Math.floor(Date.now() / 1000)
): string {
  const header = (name: string): string | null => {
    const value = request.headers[name];
    const single = Array.isArray(value) ? value[0] : value;
    return typeof single === "string" && single.trim() !== "" ? single.trim() : null;
  };

  const wallet = header("x-wallet");
  const issuedAtRaw = header("x-issued-at");
  const nonce = header("x-nonce");
  const signature = header("x-signature");

  if (!wallet || !issuedAtRaw || !nonce || !signature) {
    throw new AuthError(401, "missing wallet authentication headers");
  }
  if (nonce.length < 16 || nonce.length > 128) {
    throw new AuthError(401, "nonce must be 16-128 characters");
  }

  const issuedAt = Number(issuedAtRaw);
  if (!Number.isInteger(issuedAt)) throw new AuthError(401, "x-issued-at must be Unix seconds");

  const timestamp = now();
  if (Math.abs(timestamp - issuedAt) > MAX_SKEW_SECONDS) {
    throw new AuthError(401, "signed request is expired or too far in the future");
  }

  verifyAuthSignature({ wallet, issuedAt, nonce, signature }, request);

  // Single-use nonce, scoped to the signer. Checked after the signature so an
  // attacker cannot burn nonces for a wallet they do not control.
  if (!db.useNonce(nonce, wallet, timestamp)) {
    throw new AuthError(401, "nonce has already been used");
  }

  return wallet;
}
