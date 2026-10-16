# Pending work / handoff

Updated: 2026-10-16
Scope: the build → publish → deploy → run tail of `new_tasklist.md` (Points 3–6).
Companion file: `progress.md` (point-by-point status). Nothing here is committed yet.

Read this in three parts: **§1 what is blocking you**, **§2 why it was slow**, and
**§3 the exact diffs** made to get this far.

---

## §1 BLOCKED ON YOU — devnet has no SOL (this is the only real blocker)

Every remaining Point 5 / Point 6-devnet step needs funded devnet wallets. The
public faucet is exhausted for this machine's IP and the alternatives all need API
keys, so **retrying in-session cannot help — it is a hard daily/IP limit.**

```
$ solana airdrop 2 D3kN3a8rqjZZmkgT9HNa6MvSmXBryp58XCP2uV37LMnq --url devnet
Error: airdrop request failed. This can happen when the rate limit is reached.

$ curl -s -X POST https://api.devnet.solana.com -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"requestAirdrop","params":["D3kN3a8rqjZZmkgT9HNa6MvSmXBryp58XCP2uV37LMnq",1000000000]}'
{"jsonrpc":"2.0","error":{"code":429,
 "message":"You've either reached your airdrop limit today or the airdrop faucet has run dry.
            Please visit https://faucet.solana.com for alternate sources of test SOL"},"id":1}
```

| Endpoint tried | Result |
| --- | --- |
| `api.devnet.solana.com` | 429 daily-limit / faucet dry |
| `rpc.ankr.com/solana_devnet` | 401, needs API key |
| `solana-devnet.g.alchemy.com/v2/demo` | 429 |
| `devnet.genesysgo.net` | bad response |
| `solfaucet.com/api/request` | 404 (no such API) |
| `faucet.solana.com` | web UI only (GitHub OAuth + captcha; no browser here) |

### What I need from you

Devnet SOL at these addresses (public keys only — no secrets involved):

| Key | Address | Role |
| --- | --- | --- |
| `admin` | `D3kN3a8rqjZZmkgT9HNa6MvSmXBryp58XCP2uV37LMnq` | deploy authority + migration + test funder |
| `owner_a` | `8NJHN1kPzbKC7j5HwonjAY65rH5TdWMaevPwiGUEC8Yc` | register/settle |
| `owner_b` | `9oQip5maa54t9zVHDHt13mQuWDEQt6ALMb3dBaVg6AsX` | register/settle |
| `renter` | `BJicrqS5cSQZzoDUdTJyDdKaUrautBSEWLzbCv2qF5TW` | book/escrow |

How much and why:

- **Program deploy ≈ 3 SOL.** The `.so` is ~381 KB → ~2.66 SOL of rent plus the
  temporary buffer; the buffer is closed right after deploy.
- **`anchor test --provider.cluster devnet` ≈ 20 SOL more on `admin`.** The
  suite's `before` hook calls `fund(wallet)` three times at **5 SOL each, always
  from `admin`**, so `admin` is the bottleneck even though tasklist step 73 only
  asks for 2 SOL per wallet. (Localnet mints, so this only bites on devnet.)
- **`migrations/deploy.ts` `initialize_config`** — ~0.002 SOL of `admin`.
- Comfortable target: **~25 SOL on `admin`**. Cheaper alternative: ~3 SOL on
  `admin` plus ~10 SOL spread over `owner_a`/`owner_b`/`renter`, *and* lower the
  `fund()` amounts for devnet (see §3g).

Airdrop or transfer from any funded wallet, e.g.:

```
solana transfer D3kN3a8rqjZZmkgT9HNa6MvSmXBryp58XCP2uV37LMnq 25 --url devnet --allow-unfunded-recipient
```

Then hand it back and the remaining sequence is mechanical:

```
bash scripts/anchor.sh deploy --provider.cluster devnet    # Point 5 §75 (runs migrations/deploy.ts = §76)
bash scripts/anchor.sh test --provider.cluster devnet      # Point 6 §93
```

---

## §2 Why this took so long (and where the time actually went)

Honest accounting, because the wall-clock was mostly *not* the program:

1. **A single stale ID cost the whole first phase.** `Anchor.toml`
   `[programs.localnet]` still held `9CN7pM6aw…` while `declare_id!`,
   `[programs.devnet]`, and `clients/ts/constants.ts` were `DhbEciu…`. One `.so`
   can only declare one ID, so **every** localnet run died in the `before` hook
   with `DeclaredProgramIdMismatch (4100)` — 0/15 for causes that had nothing to
   do with the tests. Fixed in §3a.
2. **Anchor 0.30.1 + web3.js mask the real on-chain error.** Anchor wraps failed
   transactions with the legacy `new SendTransactionError(message, logs)`
   signature, but web3.js ≥1.95 expects an object
   `{ action, signature, transactionMessage, logs }`. Destructuring a string
   leaves `action === undefined`, so **every** failure in the suite surfaces as
   `Error: Unknown action 'undefined'` with the program logs discarded. I lost a
   lot of time reading that non-error. See §4 — this is the one thing I would fix
   in the harness next.
3. **A 2-second booking race, masked by (2).** Six cases booked with
   `start_ts = chainNow() + 2`; `create_rental` requires `start_ts >=
   Clock::get()`, and the tx is built *after* the timestamp is chosen, so it
   reverted with `StartInPast` — invisible because of (2). Fixed in §3f.
4. **One of those six was load-bearing.** The `replay` case used the near-future
   start, so its pre-start `cancel_rental` failed, leaving listing `l2` busy and
   cascading `ListingBusy` into every later `l2` test. One bad case looked like
   ten. Fixed in §3f.
5. **The local validator's `finalized` clock is slow.** Every RPC wait is at
   `finalized` commitment, ~10s+ per transaction on this machine, and case 11
   (`fuzz`) runs 20 create/settle/cancel/dispute sequences. Each full
   `anchor test --provider.cluster localnet` run is therefore **~15 minutes**, so
   every iteration in (1)–(4) was expensive. That is the main reason the loop was
   slow, not anything in the program.
6. **Devnet funding was a dead end, not a slow path.** The faucet is exhausted
   for this IP today; I burned time trying five alternate endpoints before
   concluding it is a hard limit (§1).

Where the remaining time should go: **not** more localnet archaeology — §4 is
optional polish, and the devnet tail is the actual deliverable.

---

## §3 Diffs made this session

14 files modified, 1 new untracked (`pending.md`). Nothing committed, nothing
pushed.

### a. Stale localnet program ID killed the whole suite

`Anchor.toml` `[programs.localnet]` `9CN7pM6aw…` → `DhbEciuQ2HDMUbQzCRnGWe15cYK9wSav9KgXP42v4DUZ`.

Same stale ID corrected in `docs/CONTRACT.md`, `docs/EXAMPLES.md`,
`docs/SETUP.md` (program-ID tables and the `solana program show …` example).

### b. `migrations/deploy.ts` stale default treasury

`DEFAULT_TREASURY` `23Y75gsoeTF68uMxPVZ6TtMfL6a73bDouxLJLRZ6kTeX` (a key from a
previous session) → current `.keys/treasury.json` =
`8tQDkhEo1EdheZyFEV8SZmFWyWhmar14JgSHpTjBfQWr`. Still overridable via `TREASURY=`.

### c. `docs/SETUP.md` wallet table had the wrong public keys

It listed a previous session's keys. Replaced with the current `.keys/` values
(table in §1).

### d. Fixtures were mislabelled `devnet` when produced on localnet

`tests/asset-rental.ts` wrote `cluster: CLUSTER`, and `CLUSTER` is the constant
`"devnet"`, so localnet runs wrote fixtures claiming to be devnet — the committed
`fixtures/*.json` were exactly that (`cluster: "devnet"` but `programId` = the old
localnet ID). Added `clusterLabel`, derived from `ANCHOR_PROVIDER_URL`
(`localnet` / `devnet` / `mainnet`), and used it for the fixture field.

### e. Pinned `@solana/web3.js` (attempted error-message fix — did **not** work)

`package.json` `"^1.95.3"` → `"1.95.3"` (resolved 1.99.0 before). **This changed
nothing**: 1.95.3 already ships the object-form `SendTransactionError`, so the
masking bug is Anchor's (§4). **Optional — revert it** if you prefer the floating
range. `package-lock.json` follows.

### f. `tests/asset-rental.ts` — the two real test bugs

- **Start-time race.** All six `chainNow() + 2` → `chainNow() + START_MARGIN`
  (new constant, `START_MARGIN = 30`, env-overridable). `waitForStart` then waits
  the margin out before any time-gated call. This is genuinely required: with 2
  seconds the tx simply arrives after `start_ts`.
- **`replay` was poisoning every later `l2` case.** Its booking now starts at
  `nowTs() + 3_600`, so it stays pre-start across the extra confirmations and its
  `cancel_rental` still succeeds, freeing `l2`.

### g. `tests/asset-rental.ts` — settle case assertion was paying a fee twice

Case 87 asserted `owner delta == priceTotal - fee - txFee`. But `rpc()` sends
with the **provider wallet (`admin`)** as fee payer, so the owner's delta is
exactly `priceTotal - fee`; the original assertion charged the owner a fee it
never pays. Now asserted exactly, plus a check that the provider wallet is the one
that paid (`admin delta <= -txFee`; compared with `<=` because `admin` also pays
for the booking earlier in the same case).

**Devnet-only note:** the suite's `before` hook calls `fund(wallet)` three times
at **5 SOL each from `admin`**. On localnet `fund()` just mints; on devnet it
spends real `admin` balance. If you want to fund the four wallets directly instead
of ~25 SOL on `admin`, lower those amounts (§1).

### h. Fixtures regenerated

`fixtures/{register,create,cancel,settle,dispute}.json` were rewritten by the
intervening localnet runs — they now carry `programId: DhbEciu…` and
`cluster: localnet`. **They must be regenerated on real devnet** (tasklist §94)
before they are meaningful for the portal/backend.

---

## §4 Open, *not* blocking (fix only if you want the DX)

1. **Un-mask on-chain errors.** This is the highest-value follow-up. Either
   `skipPreflight` + `connection.simulateTransaction(tx)` to read `value.logs`, or
   catch the tx error and re-read `connection.getTransaction(sig).meta.logMessages`.
   Without this, any future failure is again `Unknown action 'undefined'`.
2. `Anchor.toml` `[programs.devnet]`, `clients/ts/constants.ts`, and
   `declare_id!` all agree on `DhbEciu…`. If you deploy under a different keypair,
   re-run `anchor keys sync` and update `constants.ts` — `export-clients.sh`
   enforces all three matching.
3. `docs/SETUP.md` §6 deploy/config-init tx placeholders are still `(pending)`
   (tasklist §94; needs the devnet deployment).

---

## §5 Status of every remaining tasklist step

| Step | Item | Status |
| --- | --- | --- |
| §62 | `cargo test` + clean `anchor build` | **done** — 7/7, no program warnings |
| §63 | publish IDL/types (`export-clients.sh`, three-place ID check) | **done** — green |
| §75 | `anchor deploy --provider.cluster devnet` | blocked — §1 |
| §76 | migration `initialize_config` on devnet | blocked — §1 |
| §77 | live devnet register/create/settle → `fixtures/` | blocked — §1 |
| §93 | `anchor test --provider.cluster localnet` all green | see `progress.md` (run in flight) |
| §93 | `anchor test --provider.cluster devnet` | blocked — §1 |
| §94 | record deploy/config-init txs in `docs/SETUP.md` | blocked — §1 |
| §94 | commit `clients/idl`, `clients/types`, regenerated `fixtures/` | after §1 |

Fast iteration command (no `anchor test` wrapper, keeps one validator alive):

```bash
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$HOME/.avm/bin:$PATH"
solana-test-validator --ledger .anchor/test-ledger --reset \
  --mint $(solana-keygen pubkey .keys/admin.json) \
  --bpf-program DhbEciuQ2HDMUbQzCRnGWe15cYK9wSav9KgXP42v4DUZ target/deploy/asset_rental.so
ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 \
  npx ts-mocha -p ./tsconfig.json -t 1000000 tests/asset-rental.ts --grep "settle: owner"
```

(`anchor test -- <mocha args>` does **not** forward args — they go to
`cargo-build-sbf`. Boot the validator by hand to run a subset.)
