# Media storage: on-chain versus off-chain

The program deliberately stores only a 32-byte `metadata_hash` and a category
code per listing. The document (name, description, photo URLs, coarse location)
stays off-chain, and the hash commits to its canonical JSON.

## What an on-chain image would cost

Solana charges rent-exempt lamports per byte. At the current rate on this
deployment (`solana rent <bytes>`):

| Data | Rent-exempt minimum |
| --- | --- |
| 1 KB | ~0.00585 SOL |
| 10 KB | ~0.0527 SOL |
| 100 KB | ~0.521 SOL |
| 1 MB | ~5.33 SOL |

Add transaction fees and the fact that a transaction is capped at 1,232 bytes,
so a photo has to be split across many accounts and many transactions. A 100 KB
photo is roughly half a SOL of locked rent **per listing**; a 1 MB photo is
several SOL. That is not a cheap media store, and it grows with every listing.

It also does not give you what you probably want in Explorer: Solana Explorer
shows program account bytes as data, not as an `<img>`. Explorer renders an image
for token metadata (an NFT) or for the program-level `security.txt` logo, not for
arbitrary bytes stored in a custom account. This POC intentionally has no NFT
per listing (see the root README).

## Recommended shape

Keep the existing split:

1. `metadata_hash` on-chain (32 bytes, already done).
2. Media bytes off-chain, addressed by a URL that is part of the hashed document.
3. The backend indexes the document so renters can find it.

Storage options, roughly cheapest to most permanent:

| Option | Notes |
| --- | --- |
| Existing backend (`MEDIA_DIR`) | Free, simple, content-addressed files. Must be on a persistent volume and backed up. |
| S3 / Cloudflare R2 / Supabase Storage | Cheap, durable object storage; serve through a CDN. Good fit for the Vercel portal. |
| IPFS (Pinata, web3.storage) | Content-addressed URLs; pinning is a recurring cost. |
| Arweave via Irys | Pay once for permanent storage; suitable for images you never want to lose. |

Whichever you choose, store the resulting `https://…` URL in the metadata
document. Because the canonical document is hashed on-chain, changing the image
or URL changes the hash and must be committed with `update_asset` (the portal
already does this).

## If you need something on-chain

- **Per-listing metadata:** the current `metadata_hash` is the right anchor. A
  future version could add a short `metadata_uri` field (for example 64 bytes,
  about `0.001 SOL` of rent per listing) to `AssetListing`, but that changes the
  account layout and requires a program upgrade plus an account migration.
- **Program identity:** `security.json` (seed `security`) can include a `logo`
  URL so Explorer shows a program icon. That is program-level, not per-listing.
- **Thumbnails:** a 1–2 KB WebP thumbnail is technically affordable
  (~0.006–0.012 SOL), but it is a tiny image and still needs a program change and
  a redeploy. Not recommended for this POC.

## Backend durability

`backend/var/mirror.sqlite` and `backend/var/media/` are **not** rebuildable from
chain. The chain rows re-sync, but documents and photos are lost if the volume is
deleted. Use a persistent volume and back it up, or move media to object storage
before scaling beyond a demo.
