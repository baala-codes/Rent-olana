# Shared interfaces

The off-chain contract between the portal and the backend. Solana is the source
of truth for funds and rental state; nothing here may redefine fund movement.

```text
shared/
  src/metadata.ts   canonical metadata document + SHA-256 commitment
  src/api.ts        portal <-> backend DTOs (listing, rental, media, reports)
  src/search.ts     search-query parsing, defaults, and clamps
  src/categories.ts re-export of the on-chain category table
  src/index.ts      the package surface
  test/             12 tests (node:test, no network)
```

## The three rules this package enforces

1. **One metadata commitment.** `canonicalMetadata()` fixes the key order and
   trimming; `metadataHashHex()` is the SHA-256 written on chain as
   `metadata_hash`. The portal hashes before `register_asset`; the backend
   verifies before storing a document or accepting media. The same document
   always produces the same 32 bytes.
2. **Lamports never become floats.** Amounts cross the wire as decimal strings.
3. **One set of limits.** Search defaults (`limit=25`, `radiusKm=25`, `days=1`)
   and clamps are parsed once, so a radius the portal shows is the radius the
   backend applies.

## Use

```ts
import {
  canonicalMetadata,
  metadataHashHex,
  parseSearchQuery,
  searchQueryToParams,
  type ListingDTO,
} from "@asset-rental/shared";
```

The portal imports it through the `@shared` Vite/TS alias; the backend imports
the `.ts` sources directly. The package ships source, not a build.

## Tests

```bash
cd shared && npm test        # or: node --import tsx --test test/*.test.ts
```

The suite pins a fixed hash vector for a sample document. If that assertion ever
fails, the commitment changed and every listing registered under the old encoding
would stop verifying — treat it as a breaking contract change, not a test fix.
