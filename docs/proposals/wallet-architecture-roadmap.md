# Wallet architecture roadmap — policy layer vs. signer layer

Status: **research / direction** · Companion to
[`swig-wallet-integration.md`](./swig-wallet-integration.md) and
[`swig-completion-plan.md`](./swig-completion-plan.md)

This revisits the Swig-vs-Privy question after a fair objection: **Privy also keeps a
secret on the Gateway host, and both Privy and Swig are policy engines that restrict what
that secret can move.** That objection is correct, and it reframes the whole decision.

## Correction: neither Privy nor Swig is "keyless on the host"

What Gateway actually stores for **Privy** (`src/wallet/privy/privy-service.ts:101-102`):

- `GATEWAY_PRIVY_APP_SECRET` (env) and `GATEWAY_PRIVY_AUTHORIZATION_KEY` (env, base64 PKCS8
  P-256 private key). Together these **command** Privy's TEE-held wallet key to sign within
  the Privy policy.

What Gateway stores for **Swig** (today): the **delegate Ed25519 key**, in the
scrypt+AES-256-GCM keystore, which signs within the Swig on-chain policy.

So both designs hold an on-host secret that produces **policy-bounded** signatures. The
earlier "Privy = keyless, Swig = key-on-host" framing was wrong. The honest differences:

| Axis | Privy | Swig (local delegate, today) |
|---|---|---|
| Can the raw signing key be **exfiltrated**? | No — key stays in Privy's TEE; host holds only credentials that command it | **Yes** — delegate key is on the host (until backed by KMS) |
| At-rest protection of the host secret | **Plaintext env vars** | **scrypt + AES-256-GCM keystore** (needs passphrase) |
| Policy location / strength — **Solana** | off-chain, **program-ID only**; blind to token movement inside swap CPIs | **on-chain**, per-mint caps + program allowlist, enforced across CPIs |
| Policy location / strength — **EVM** | off-chain, but **strong**: `to` + `calldata` ABI conditions ⇒ per-pool restriction | n/a (Solana only) |
| Revocation | central, instant (Privy) | on-chain owner tx |
| Custody model | SaaS vendor (TEE/MPC) | self-custodial; SDK is **Apache-2.0**, the deployed program is AGPL-3.0 (RPC client, no copyleft reach) |

Two non-obvious takeaways:

1. **At rest, Swig's local delegate is arguably *better* protected** than Privy's plaintext
   env secrets — it's behind the hardened keystore + passphrase. Privy's edge is that the
   *raw key* can't be carried off and reused after revocation; an exfiltrated Swig delegate
   can. That edge disappears once the Swig delegate is a KMS/TEE signer.
2. **Privy is weak exactly where Swig is strong (Solana) and strong exactly where Swig
   doesn't exist (EVM).** That asymmetry is the whole answer.

## The clean abstraction: two orthogonal layers

The mistake was treating Privy and Swig as competing *wallets*. They live on different layers:

- **Policy layer** — *what can the signer do once it signs?* On-chain, self-custodial.
  - Solana → **Swig** (program allowlist + per-mint caps).
  - EVM → **ERC-4337 / EIP-7702 smart account** with session-key + spending-limit modules
    (does not exist in Gateway yet; see roadmap).
- **Signer / custody layer** — *where does the secret that signs live?* Pluggable.
  - `local` (encrypted keystore) · `kms` (AWS/GCP KMS, non-exportable). No third-party SaaS
    custody (a TEE/MPC vendor like Privy/Turnkey *could* slot in here as another backend, but
    we deliberately don't depend on one).

These compose. A production Solana wallet = **Swig policy + KMS signer**. A production EVM
wallet = **4337 policy + KMS signer**. The signer is just one column; the policy layer is
independent of it.

## Decision (final): drop Privy entirely — no SaaS custody dependency

An earlier draft of this doc proposed keeping Privy for EVM (its `to`+`calldata` policy is
strong there). We rejected that: it keeps Gateway tied to a third-party SaaS for custody,
and the signer/custody layer should be **self-custodial and vendor-neutral** on both chains.

- **Privy is removed.** [PR #649](https://github.com/hummingbot/gateway/pull/649) is closed;
  the Privy backend (service, EVM/Solana signers, routes, `@privy-io/node`) is deleted. The
  generic wallet-type signing seam it introduced is kept — that's vendor-neutral
  infrastructure Swig and the EVM AA work both use.
- **Signer/custody layer = `local | kms` only.** No third-party custody. `local` is the
  encrypted keystore (dev); `kms` is a cloud KMS/HSM (production "no raw key on host"),
  implemented as a documented seam now.
- **Policy layer is on-chain on both chains:** Swig on Solana (this PR), ERC-4337/EIP-7702
  on EVM (follow-up PR). Each is self-custodial; neither needs a wallet vendor in the trade
  path.

Net: **Solana via Swig now; EVM via native account abstraction next; KMS for keyless
custody on both. Zero Privy.**

## EVM roadmap: ERC-4337 / EIP-7702 as the Swig analog

The structural equivalent of Swig on EVM is a **smart contract account** whose on-chain
modules enforce a delegate's permissions. The standards stack is mature as of 2026:

- **ERC-4337** (final, Mar 2023) — off-chain side: `UserOperation`, bundlers, the singleton
  `EntryPoint`. ~2.4B userops and ~62M active smart accounts across EVM chains by early 2026.
- **EIP-7702** (live in Pectra, **May 7 2025**) — lets an **existing EOA** delegate to
  contract code while keeping its address/key. Directly relevant: **Gateway's EVM wallets are
  EOAs today**, so 7702 grants them smart-account powers (session keys, allowlists, batching)
  with no address migration. ~14M EOAs had signed a 7702 authorization by April 2026.
- **ERC-7579** (modular smart accounts) — common `installModule`/`uninstallModule` interface
  with four module types: **validators, executors, fallback handlers, hooks**. Session keys
  and spend limits are *validator/hook modules*.
- **ERC-7715 + ERC-7710** (permissions) — `wallet_grantPermissions` (request side) + on-chain
  delegation interface. A scoped, time-bounded session key restricted to specific target
  contracts, selectors, and max value — the EVM analog of Swig's program allowlist + per-mint
  caps. Production implementations exist (MetaMask Delegation Toolkit, Coinbase Smart Wallet,
  Rhinestone, Biconomy); the EIP isn't Final yet.

**The EVM analog of Swig's guarantee** (default-deny program + per-mint caps) is a
**session-key / smart-session module** that restricts the delegate to: allowlisted target
contracts (the DEX router/pool), allowlisted function selectors, and per-token spending
limits over a time window. Same shape, enforced on-chain.

**We would not author contracts.** Use an audited stack: **Safe + Safe7579**, **ZeroDev
Kernel**, **Biconomy Nexus**, **Alchemy Modular Account**, or **Rhinestone Smart Sessions**
(a 7579 session-key module that works across these accounts). The Gateway work is a
connector/signer integration, analogous to the Swig signer: build the connector tx, wrap it
as a `UserOperation` (or a 7702-delegated call) validated by the session-key module, and
submit via a bundler.

Trade-offs to weigh before this phase: bundler/paymaster infra dependency (or self-bundle),
gas overhead vs. plain EOAs, and which account implementation to standardize on.

## Recommended sequencing

| Phase | Scope | Custody (signer) | Policy | New deps |
|---|---|---|---|---|
| **0 — done** | Keystore hardening (#659) | local | — | — |
| **0.5 — done** | Remove Privy entirely; close #649 | — | — | (removes `@privy-io/node`) |
| **1 — Swig Solana** (PR 1, on #659) | Swig (Orca-only) + pluggable `local`/`kms` signer | `local` (impl) · `kms` (seam) | Swig on-chain | `@swig-wallet/classic` (Apache-2.0) |
| **2 — Native EVM AA** (PR 2, on PR 1) | ERC-4337/EIP-7702 smart account + 7579 session-key module, same pluggable signer | `local`/`kms` | on-chain (session keys + spend limits) | a 4337 stack + bundler |
| **3 — KMS backend** *(either PR or follow-up)* | Implement the `kms` signer (AWS/GCP) — true "no key on host" | **KMS** | — | a KMS SDK |
| **4 — unify** *(baked in)* | The `local`/`kms` signer is shared by both Swig and the 4337 account from the start; session keys cap exposure windows | KMS | both on-chain | — |

The end state is symmetric and self-custodial: **on-chain policy on both chains** (Swig /
4337), with the **signer** a swappable `local`/`kms` backend chosen per the operator's custody
preference — and **no wallet vendor in the trade path**.

## Sources

- ERC-4337 (account abstraction) — https://docs.erc4337.io/smart-accounts/index.html
- ERC-7579 modular smart accounts — https://eco.com/support/en/articles/11890018-erc-7579-the-modular-smart-account-standard-explained
- EIP-7702 (Pectra) — https://ethereum.org/roadmap/pectra/7702/ · https://www.alchemy.com/blog/eip-7702-ethereum-pectra-hardfork
- ERC-7715 wallet permissions / sessions — https://eco.com/support/en/articles/11953354-erc-7715-explained-wallet-permissions-sessions-and-subscriptions · https://docs.metamask.io/smart-accounts-kit/concepts/advanced-permissions/
- Rhinestone Smart Sessions (7579 session keys) — https://docs.rhinestone.dev/smart-wallet/smart-sessions/overview
- Turnkey, account abstraction 4337 → 7702 — https://www.turnkey.com/blog/account-abstraction-erc-4337-eip-7702
- AA adoption stats (2026) — https://blockeden.xyz/blog/2026/01/20/account-abstraction-smart-wallets-erc-4337-eip-7702-mainstream/
