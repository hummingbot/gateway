# Finishing the Swig Integration — completion plan & decision

Status: **experimental, mainnet-validated core** · Branch: `feat/swig-solana` (on top of #659)
Relates to: [PR #659 (keystore hardening — PR 1 base)](https://github.com/hummingbot/gateway/pull/659).
Decision authority: [`wallet-architecture-roadmap.md`](./wallet-architecture-roadmap.md).

> **Superseded framing note.** An earlier version of this doc asked "replace Privy or
> supplement it?" and recommended *supplement*. That decision was **reversed**: Privy is
> removed entirely (no SaaS custody dependency), [PR #649 is
> closed](https://github.com/hummingbot/gateway/pull/649), and the signer/custody layer is
> now `local | kms` only. See the roadmap for the full rationale. This doc is kept for the
> still-valid gap list below.

This is the follow-on to [`swig-wallet-integration.md`](./swig-wallet-integration.md) (what
Swig is and how it's wired). Here: **what's left to make Swig production-ready, in priority
order.**

---

## TL;DR

- **Privy removed; Swig is the Solana wallet.** No third-party custody. The signer backend is
  pluggable — `local` (encrypted keystore, implemented) or `kms` (cloud KMS/HSM, documented
  seam). PR 1 ships Swig (Solana) on top of #659; PR 2 adds EVM account abstraction reusing
  the same signer.
- **Swig is the on-chain authorization layer** (per-mint spend caps + program allowlist that
  hold *across a swap's CPIs*). Custody (where the key lives) is a separate, swappable layer.
- **The gap that matters most: the `kms` signer.** With the `local` backend the delegate key
  is on the host (encrypted); only a KMS backend fully meets the README goal ("no stealable
  key on the server"). The interface is in place — implementing a KMS backend is a drop-in.
- Everything else (more connectors, Orca-only scoping, lockfile hygiene) is incremental. The
  AGPL concern flagged earlier was a false alarm — the SDK is Apache-2.0 (see gap #3).

---

## Where things stand (after merging the keystore fix)

The keystore hardening from #659 (scrypt + AES-256-GCM, loopback-by-default bind, opt-in
API auth, 0600 key files) is now merged into `feat/swig-wallet`. Typecheck is clean; the 9
Swig unit tests pass.

**Done and mainnet-validated** (see the integration doc's validation table):

- Core wrap/rebuild/delegate-sign path (`SwigSolanaSigner.rebuildAndSign`), legacy + v0 + ALT.
- Orca `executeSwap` swig branch (kit no-op signer → `kitInstructionToWeb3` → wrap → sign).
- Token-2022 (USDM1) transfers and an owner-signed admin role update.
- Empirical security model: default-deny per mint; SOL / un-allowlisted programs / un-capped
  mints hard-blocked (`0xbbe`); capped mints reach any destination (amount-capped, not
  destination-pinned).
- `POST /wallet/add-swig` (register an offline-provisioned Swig; verifies the delegate role
  on-chain) and `remove-swig`; registry in `swig-wallets.json`.
- Offline provisioning script (`scripts/swig/create-swig-wallet.ts`) — owner key never
  touches the host.

**Not done / unverified** — the gap list below.

---

## The decision (see the roadmap for the full argument)

The custody-vs-policy analysis and the decision to **drop Privy entirely** live in
[`wallet-architecture-roadmap.md`](./wallet-architecture-roadmap.md). In short: Privy and Swig
were never competing wallets — Swig is the **policy** layer (what a signature is allowed to
do, on-chain) and custody (**where the key lives**) is a separate, swappable layer. Rather
than depend on a SaaS for custody, Gateway uses a `local | kms` signer behind both Swig
(Solana) and the EVM account-abstraction work. Privy is removed; #649 is closed.

### License (verified — not a blocker)

The **TS SDK we import and ship (`@swig-wallet/classic` + `coder` + `lib`) is Apache-2.0** —
same as Gateway. Only the **on-chain program is AGPL-3.0**, and Gateway is merely an RPC
client of a separately-deployed instance (no bundling, no modification), so the program's
AGPL imposes nothing on Gateway. See gap #3 for the full reasoning.

---

## Gap list — what's left, in priority order

### 1. Keyless delegate signer — *interface done; KMS backend is the remaining blocker*

**Done:** the delegate signer is now pluggable behind `SwigDelegateSigner`
(`src/wallet/swig/delegate-signer.ts`). The swig registry records
`delegateSigner: 'local' | 'kms'`; `Solana.getSwigDelegateSigner` resolves it. The `local`
backend (`LocalKeystoreDelegateSigner`) is implemented; the wrap/rebuild logic is identical
regardless of backend.

**Remaining:** with `local`, the delegate key is still on the host (encrypted), so the README
goal ("no stealable key on the server") is only met once a **`kms` backend** exists.

- Implement a `SwigDelegateSigner` whose `sign()` calls a cloud KMS/HSM. AWS KMS (P-256,
  `secp256r1` Swig authority via `createSecp256r1AuthorityInfo` + a `SigningFn`) or GCP KMS
  (Ed25519) — the choice sets the delegate's on-chain authority type. Gateway then holds only
  IAM/SA creds, never the raw key. Wire it into `Solana.getSwigDelegateSigner` (the `'kms'`
  case currently throws a clear "not implemented" error).
- Optional: **session keys** (`getCreateSessionInstructions`) to cap the exposure window of
  any single signing key.
- **Acceptance:** a full Orca swap through a Swig wallet whose delegate key is *not present on
  the host* (KMS), verified on mainnet.

### 2. Connector coverage — *wired everywhere; mainnet-verify the rest*

All Solana connectors are now wired through the single wallet-type-agnostic chokepoint
(`Solana.sendAndConfirmTransactionForWallet`): swaps on Orca, Meteora, Raydium (AMM+CLMM) and
Jupiter, plus add/remove-liquidity, open/close-position and collect-fees on the CLMM venues.
Connectors carry **no per-wallet-type branching** — they build with the wallet's public key
and call the chokepoint.

Only **Orca swap** is mainnet-verified. Remaining work is **verification, not wiring**:
- Mainnet-test each path with a Swig wallet, prioritising (a) native-SOL wrap/unwrap routes
  and (b) `openPosition` (ephemeral position-mint co-signer surviving the wrap/rebuild — passed
  via the chokepoint's `extraSigners`).
- **Jupiter** needs a **token-cap-only** Swig role (program-restricted roles block an
  aggregator); per-mint caps still bound the blast radius. Documented in the integration doc.

### 3. License — *verified Apache-2.0; not a blocker*

Verified against npm metadata + the upstream `swig-ts` `LICENSE.txt`:

- **SDK we import and ship** (`@swig-wallet/classic`, `@swig-wallet/coder`, `@swig-wallet/lib`)
  → **Apache-2.0**, identical to Gateway. Permissive, no copyleft. This is the only Swig code
  in Gateway's distribution.
- **On-chain program** (Rust, `swigypW…`) → **AGPL-3.0**, but Gateway only sends instructions
  to a separately-deployed instance over RPC. AGPL attaches to *distributing* the work or
  *running a modified copy* and serving users (§13); an RPC client is not linking and is not a
  derivative work, so the program's AGPL imposes nothing on Gateway.

No copyleft reach into Gateway → **not a merge blocker.** Optional belt-and-suspenders: have
the Foundation's counsel confirm the standard "RPC client of an AGPL program isn't a
derivative work" reading before the upstream PR.

### 4. Lockfile hygiene — *required before any PR*

`pnpm-lock.yaml` was regenerated wholesale in the WIP commit (~7.5k lines churned), likely by
a different pnpm version. Regenerate cleanly with the repo's pinned pnpm so the diff is just
`@swig-wallet/classic` and its transitive deps, not a reformat.

### 5. Decouple from Privy — *DONE*

Privy is removed from the codebase entirely (service, signers, routes, `@privy-io/node`).
The PR-1 branch `feat/swig-solana` is built directly on #659's keystore branch, so its diff
contains zero Privy. The generic wallet-type signing seam is kept (vendor-neutral).

### 6. Docs & operator runbook — *small*

- A `POST /wallet/add-swig` walkthrough + the offline `create-swig-wallet.ts` provisioning
  flow (owner key on an air-gapped machine).
- State the v1 guarantee plainly: **default-deny per mint, amount-capped, Orca swaps only;
  destination is not pinned; delegate signer = local (dev) / KMS (prod).**

### 7. CI-appropriate tests — *small*

Unit tests (mocked SDK/connection) exist and pass. Mainnet flows can't run in CI; keep them
as the `scripts/swig/` harness and reference them from the PR's manual test plan.

---

## Suggested sequencing

1. **Done:** keystore fix merged; Privy removed; pluggable `local`/`kms` signer in place.
2. **Before PR 1:** scope to Orca + throw elsewhere (#2a). (Lockfile #4 done; license #3
   verified Apache-2.0 — no action needed.)
3. **PR 1 (Solana, Orca-only):** Swig on-chain policy + `local` signer, on top of #659.
4. **PR 2 (EVM, builds on PR 1):** native ERC-4337/EIP-7702 account abstraction reusing the
   same pluggable signer.
5. **KMS backend (either PR or follow-up):** implement the `kms` signer for true keyless
   custody.
6. **Later (optional):** session keys; more connectors as each is verified on mainnet.
