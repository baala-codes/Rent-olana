# Infrastructure

Deployment and operations for the asset-rental POC — toolchain, key setup,
devnet deploy, backend packaging, and connectivity. The portal surfaces actions
to wallets; the program holds funds; this folder makes it all reproducible.

- Provide the toolchain and key setup used by every stream
  ([`../scripts/install-toolchain.sh`](../scripts/install-toolchain.sh),
  [`../scripts/gen-keypairs.py`](../scripts/gen-keypairs.py)).
- Provide the devnet deploy runbook and the wallet-role table
  ([`../docs/SETUP.md`](../docs/SETUP.md)): the three-place program-ID rule,
  `anchor deploy`, and `initialize_config`.
- Add backend container configuration, persistent storage for the
  listing/rental mirror, and object storage for asset media.
- Configure portal/backend/RPC connectivity, HTTPS, and clock synchronization.
- Provide repeatable readiness checks and a backend recovery procedure
  (restart with persistent mirror + reconciliation against finalized reads).

Start with Solana devnet and a funded wallet set (`admin`, `treasury`,
`owner_a`, `owner_b`, `renter`). Keep backend configuration and non-secret
examples committed; keep every keypair in the gitignored `.keys/`.

The legacy Linux-VM / OpenSSH / `solana-authd` provisioning belongs to the
**archived** SSH workstream ([`../ssh/`](../ssh/)) and is **out of scope** for
this POC.

See [`new_architecture.md`](../new_architecture.md) §2.3 and §13.
