import { PublicKey } from "@solana/web3.js";

/**
 * Minimal Borsh codec for the program's instruction arguments and account
 * fields. The portal ships without a generated IDL, so this is the encoding
 * layer that keeps the browser byte-for-byte with Anchor's serialization:
 * little-endian integers, a single `0x00`/`0x01` tag for `Option`, and raw
 * 32-byte `Pubkey`/`[u8; 32]` values.
 */

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error(`hex string must be even length: ${hex}`);
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Growable little-endian writer for instruction arguments. */
export class Writer {
  private readonly buf: number[] = [];

  private push(bytes: Uint8Array): this {
    for (const b of bytes) this.buf.push(b);
    return this;
  }

  u8(value: number): this {
    this.buf.push(value & 0xff);
    return this;
  }

  bool(value: boolean): this {
    return this.u8(value ? 1 : 0);
  }

  u16(value: number): this {
    return this.u8(value).u8(value >>> 8);
  }

  private u64Bytes(value: bigint, signed: boolean): Uint8Array {
    const view = new DataView(new ArrayBuffer(8));
    if (signed) view.setBigInt64(0, value, true);
    else view.setBigUint64(0, value, true);
    return new Uint8Array(view.buffer);
  }

  u64(value: bigint | number): this {
    return this.push(this.u64Bytes(BigInt(value), false));
  }

  i64(value: bigint | number): this {
    return this.push(this.u64Bytes(BigInt(value), true));
  }

  bytes(value: Uint8Array | number[]): this {
    return this.push(value instanceof Uint8Array ? value : Uint8Array.from(value));
  }

  pubkey(value: PublicKey): this {
    return this.bytes(value.toBytes());
  }

  /** Borsh `Option`: `0x00` for none, `0x01` followed by the inner value. */
  option<T extends keyof WriterValues>(inner: T, value: WriterValues[T] | undefined | null): this {
    if (value === undefined || value === null) return this.u8(0);
    this.u8(1);
    // The literal key selects a method whose parameter is `WriterValues[T]`.
    (this[inner] as (value: WriterValues[T]) => this).call(this, value);
    return this;
  }

  build(): Uint8Array {
    return Uint8Array.from(this.buf);
  }
}

/** Value types `option` can dispatch to (method name -> its argument type). */
interface WriterValues {
  u16: number;
  u64: bigint | number;
  i64: bigint | number;
  pubkey: PublicKey;
  bytes: Uint8Array | number[];
}

/** Sequential reader over account data. */
export class Reader {
  private offset: number;

  constructor(
    private readonly view: DataView,
    start = 0
  ) {
    this.offset = start;
  }

  get position(): number {
    return this.offset;
  }

  u8(): number {
    return this.view.getUint8(this.offset++);
  }

  bool(): boolean {
    return this.u8() !== 0;
  }

  u16(): number {
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  u64(): bigint {
    const value = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    return value;
  }

  i64(): bigint {
    const value = this.view.getBigInt64(this.offset, true);
    this.offset += 8;
    return value;
  }

  bytes(length: number): Uint8Array {
    const out = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, length);
    this.offset += length;
    return out;
  }

  pubkey(): PublicKey {
    return new PublicKey(this.bytes(32));
  }
}
