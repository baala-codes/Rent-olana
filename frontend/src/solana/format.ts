import { PublicKey } from "@solana/web3.js";

import { LAMPORTS_PER_SOL, SECONDS_PER_DAY, type RentalStatusName } from "./constants";

/** `abcd…1234` — compact address for dense rows. */
export function shortAddr(value: PublicKey | string, chars = 4): string {
  const text = typeof value === "string" ? value : value.toBase58();
  if (text.length <= chars * 2 + 1) return text;
  return `${text.slice(0, chars)}…${text.slice(-chars)}`;
}

/** Lamports -> SOL string, trailing zeros trimmed (e.g. `0.01`, `1.5`). */
export function lamportsToSol(lamports: bigint | number, maxDecimals = 9): string {
  const value = typeof lamports === "bigint" ? lamports : BigInt(Math.trunc(lamports));
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / BigInt(LAMPORTS_PER_SOL);
  const fraction = abs % BigInt(LAMPORTS_PER_SOL);
  let fractionText = fraction.toString().padStart(9, "0").replace(/0+$/, "");
  if (fractionText.length > maxDecimals) fractionText = fractionText.slice(0, maxDecimals);
  const text = fractionText ? `${whole}.${fractionText}` : whole.toString();
  return negative ? `-${text}` : text;
}

/** Human SOL string -> lamports. Accepts up to 9 decimal places. */
export function solToLamports(sol: string): bigint {
  const trimmed = sol.trim();
  if (!/^\d*(\.\d*)?$/.test(trimmed) || trimmed === "" || trimmed === ".") {
    throw new Error(`not a valid SOL amount: "${sol}"`);
  }
  const [whole, fraction = ""] = trimmed.split(".");
  const padded = fraction.padEnd(9, "0").slice(0, 9);
  return BigInt(whole || "0") * BigInt(LAMPORTS_PER_SOL) + BigInt(padded || "0");
}

/** Unix seconds -> local date-time string. */
export function formatTs(unixSeconds: bigint | number): string {
  const n = Number(unixSeconds);
  if (n === 0) return "—";
  return new Date(n * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Unix seconds -> `YYYY-MM-DD` (UTC), for `<input type="date">`. */
export function unixToDateInput(unixSeconds: bigint | number): string {
  const d = new Date(Number(unixSeconds) * 1000);
  return d.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` -> unix seconds at 00:00 UTC. */
export function dateInputToUnix(value: string): number {
  return Math.floor(new Date(`${value}T00:00:00Z`).getTime() / 1000);
}

/** `YYYY-MM-DD` -> unix seconds at 00:00 UTC, defaulting to tomorrow. */
export function defaultStartDate(): string {
  return unixToDateInput(Math.floor(Date.now() / 1000) + SECONDS_PER_DAY);
}

/** Today's `YYYY-MM-DD` (UTC). */
export function todayDateInput(): string {
  return unixToDateInput(Math.floor(Date.now() / 1000));
}

/** Days between two unix second values, rounded up. */
export function daysUntil(unixSeconds: bigint | number): number {
  const delta = Number(unixSeconds) - Math.floor(Date.now() / 1000);
  return Math.ceil(delta / SECONDS_PER_DAY);
}

export type StatusTone = "open" | "active" | "good" | "muted" | "frozen";

/** Visual tone for each rental status (drives the badge colour). */
export function statusTone(status: RentalStatusName): StatusTone {
  switch (status) {
    case "Reserved":
      return "open";
    case "Active":
      return "active";
    case "Completed":
      return "good";
    case "Cancelled":
      return "muted";
    case "Disputed":
      return "frozen";
    case "Resolved":
      return "active";
    default:
      return "muted";
  }
}

/** Short hex for a 32-byte identifier. */
export function shortId(bytes: Uint8Array, chars = 4): string {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, chars)}…${hex.slice(-chars)}`;
}
