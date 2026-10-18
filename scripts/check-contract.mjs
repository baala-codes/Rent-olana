#!/usr/bin/env node
/**
 * Contract drift check.
 *
 * Fails when any of these disagree:
 *   - the program ID in `declare_id!`, `Anchor.toml` (devnet + localnet), the
 *     published IDL, the generated client constants, and `docs/CONTRACT.md`;
 *   - `clients/ts/generated.ts` versus a fresh generation from the IDL;
 *   - the instruction set in the IDL versus the builders in `clients/ts/wire.ts`;
 *   - the account set in the IDL versus the decoders in `clients/ts/wire.ts`.
 *
 * Usage: node scripts/check-contract.mjs
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), "utf8");
const problems = [];

const generated = spawnSync(process.execPath, ["scripts/gen-client-constants.mjs", "--check"], {
  cwd: ROOT,
  encoding: "utf8",
});
if (generated.status !== 0) {
  problems.push((generated.stderr || generated.stdout).trim());
}

const idl = JSON.parse(read("clients/idl/asset_rental.json"));

/** Anchor: first 8 bytes of sha256("<kind>:<name>"), lowercase hex. */
const anchorDiscriminator = (kind, name) =>
  createHash("sha256").update(`${kind}:${name}`).digest("hex").slice(0, 16);

for (const ix of idl.instructions) {
  const expected = anchorDiscriminator("global", ix.name);
  const actual = (ix.discriminator ?? [])
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  if (actual !== expected) {
    problems.push(`IDL discriminator for instruction "${ix.name}" is ${actual}, expected ${expected}`);
  }
}
for (const account of idl.accounts) {
  const expected = anchorDiscriminator("account", account.name);
  const actual = (account.discriminator ?? [])
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  if (actual !== expected) {
    problems.push(`IDL discriminator for account "${account.name}" is ${actual}, expected ${expected}`);
  }
}
const generatedSource = read("clients/ts/generated.ts");
const generatedAddress = generatedSource.match(/IDL_ADDRESS = "([1-9A-HJ-NP-Za-km-z]+)"/)?.[1];
const libRs = read("programs/asset-rental/src/lib.rs");
const anchorToml = read("Anchor.toml");
const docsContract = read("docs/CONTRACT.md");

const declared = libRs.match(/declare_id!\("([1-9A-HJ-NP-Za-km-z]+)"\)/)?.[1];
const anchorIds = [...anchorToml.matchAll(/^asset_rental = "([1-9A-HJ-NP-Za-km-z]+)"$/gm)].map(
  (match) => match[1]
);
const docsId = docsContract.match(/\| Program ID \| `([1-9A-HJ-NP-Za-km-z]+)` \|/)?.[1];

const ids = {
  "programs/asset-rental/src/lib.rs": declared,
  "clients/idl/asset_rental.json": idl.address,
  "clients/ts/generated.ts": generatedAddress,
  "docs/CONTRACT.md": docsId,
};
for (const [index, id] of anchorIds.entries()) {
  ids[`Anchor.toml[${index}]`] = id;
}

const unique = new Set(Object.values(ids));
if (unique.size !== 1 || unique.has(undefined)) {
  problems.push(
    "program ID mismatch:\n" +
      Object.entries(ids)
        .map(([where, id]) => `    ${where}: ${id ?? "<missing>"}`)
        .join("\n")
  );
}

// Instruction builders: each IDL instruction must appear as
// `programInstruction("<name>"` in the wire module.
const wire = read("clients/ts/wire.ts");
const built = new Set([...wire.matchAll(/programInstruction\(\s*"([a-z_]+)"/g)].map((m) => m[1]));
for (const ix of idl.instructions) {
  if (!built.has(ix.name)) problems.push(`clients/ts/wire.ts has no builder for "${ix.name}"`);
}
const idlIxNames = new Set(idl.instructions.map((ix) => ix.name));
for (const name of built) {
  if (!idlIxNames.has(name)) problems.push(`clients/ts/wire.ts builds unknown instruction "${name}"`);
}

// Account decoders: each IDL account must have a `decode<Name>` export.
for (const account of idl.accounts) {
  if (!new RegExp(`export function decode${account.name}\\b`).test(wire)) {
    problems.push(`clients/ts/wire.ts has no decoder for "${account.name}"`);
  }
}

// Program ID count sanity: the three places the deploy docs call out.
if (anchorIds.length !== 2) {
  problems.push(`Anchor.toml should declare devnet and localnet, found ${anchorIds.length} entries`);
}

if (problems.length > 0) {
  console.error("contract check failed:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `contract check passed: ${idl.instructions.length} instructions, ${idl.accounts.length} accounts, program ${idl.address}`
);
