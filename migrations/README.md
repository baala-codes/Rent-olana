# Migrations

Anchor's deploy hook. `anchor deploy` runs `deploy.ts` once after the program is
deployed, which is the natural place to run post-deploy setup such as
initializing the singleton `PlatformConfig`.

```bash
anchor deploy --provider.cluster devnet
```

For the asset-rental POC the intended setup is:

```ts
initialize_config(treasury, 250) // signed by the admin wallet
```

This creates `PlatformConfig` (PDA `[b"config"]`) with the treasury address, a
250 bps (2.5%) fee, and `paused = false`. It is a one-time call: a second
`initialize_config` fails because the config account already exists.

Keep the admin wallet as the provider wallet here, and remember that the
program ID must already be consistent across `declare_id!`, `Anchor.toml`, and
`clients/ts/constants.ts` before deploying — see
[`../docs/SETUP.md`](../docs/SETUP.md).

