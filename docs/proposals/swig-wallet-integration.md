# Swig Smart-Wallet Integration (Privy Alternative)

Status: **proposed / experimental** · Branch: `feat/swig-wallet` · Chain: Solana only

## Goal

Add a Solana **smart-contract wallet** as an alternative to Privy for unattended
market-making. The wallet is owned by us (the key that created it) and is constrained
on-chain so a delegated "Gateway" authority can **only**:

1. interact with the **Orca Whirlpools** program (swaps / LP), and
2. move tokens back to the **owner** wallet,

with on-chain **spend caps** per mint. Everything else is denied by the program that
holds the funds — not by an off-chain policy engine.

This is the structural fix our Privy docs deferred (`PRIVY-PRODUCTION.md` §6/§7.3): a
Privy Solana policy matches *programs by ID only* and cannot inspect token movement
inside a DEX swap's CPIs. An on-chain wallet enforces real token spend/destination
limits across CPIs.

We use **[Swig](https://github.com/anagrambuild/swig-wallet)**, an already-deployed
single program on mainnet (`swigypWHEksbC64pWKwah1WTeh9JXwx8H1rJHLdbQMB`). We write
**no on-chain code** — Gateway is a pure TypeScript client of Swig's `@swig-wallet/classic`
SDK. (No Pinocchio, no Anchor: those are only for authoring an on-chain program, which
we are not doing.)

## How Swig differs from Privy (the key design point)

Privy plugs into Gateway as a **pure signer**: a Privy wallet *is* a normal Solana
keypair account, so a connector builds an ordinary transaction with the wallet as fee
payer + token authority, and Privy just returns a signature. Drop-in at
`signTransactionByType`.

Swig **cannot** work that way. A Swig wallet is a **PDA**; it has no private key and
cannot produce an Ed25519 signature. To act as the wallet you must **wrap** the inner
instruction(s) in Swig's `sign` instruction. On-chain, the Swig program checks the
calling authority's role/permissions and then **executes the inner instruction via CPI,
signing as the PDA**. The outer transaction is paid for and signed by the *authority
keypair* (the Gateway delegate), not the PDA.

Consequences for the integration:

| | Privy | Swig |
|---|---|---|
| Wallet account | normal keypair account | program-derived address (PDA) |
| Who signs the tx | the wallet (in Privy TEE) | the **authority keypair** Gateway holds |
| Fee payer | the wallet | the authority keypair (or a paymaster) |
| Token account owner | the wallet | the **Swig PDA** |
| Policy enforcement | off-chain in Privy TEE | **on-chain** in the Swig program |
| Integration seam | signer (`signTransactionByType`) | **instruction wrapping** before signing |

Because the seam is instruction-wrapping rather than signing, the connector-built
transaction's instructions must be extracted, wrapped, and re-assembled into a new
transaction signed by the authority key. That is the core of the work.

### Why ATAs still line up

Connectors derive token accounts and the swap "user authority" from the `address` we
pass them. If we register the **Swig PDA** as the wallet address, connectors naturally
build instructions whose token accounts are owned by the PDA and whose authority is the
PDA — exactly what Swig's `sign` wrapper expects. So no connector code changes; the work
is concentrated at the signing chokepoints.

## Wallet / role design

- **Root role (owner):** `Actions.set().all()`, authority = owner key. Kept **offline**
  (same posture as today's Privy owner key — never on the Gateway host). Used only to
  create the wallet and add/modify roles.
- **Delegate role (Gateway):** authority = a key Gateway holds (encrypted in the keystore,
  same as a local wallet). Actions:
  - program restriction scoped to the **Orca Whirlpools** program (+ Token / Token-2022,
    Associated-Token, ComputeBudget as needed),
  - `tokenRecurringLimit({ mint, amount })` caps per traded mint,
  - `tokenDestinationLimit` pinned to the owner's ATA for withdrawals.

Residual risk (documented, accepted for the experiment): Swig's program restriction is
program-ID granular, so it does **not** pin a specific Orca *pool*. The spend caps +
destination limit bound the blast radius of a rigged-pool attack; true per-pool pinning
would require a custom program (out of scope — see the earlier Option B analysis).

## Gateway changes (as implemented on `feat/swig-wallet`)

All additive; mirrors the Privy layout under `src/wallet/`.

1. **`src/wallet/swig/swig-service.ts`** — wraps `@swig-wallet/classic` (lazy `require`,
   like the Privy service). Methods: `buildCreateInstruction` (owner-root create),
   `buildAddDelegateInstructions` (restricted delegate role, owner-signed), `fetchSwig`,
   `getWalletAddress`, `wrapInstructions` (Swig `sign` for the delegate role), `requireRole`.
2. **`src/wallet/swig/swig-signer.ts`** — `SwigSolanaSigner.rebuildAndSign(tx)`: decompose
   a connector tx into instructions (resolving Address Lookup Tables for versioned txs),
   keep ComputeBudget top-level, wrap the rest, and recompile a **v0** transaction with the
   delegate keypair as fee payer + signer. Handles both legacy and versioned input.
3. **`src/wallet/swig/kit-instructions.ts`** — `kitInstructionToWeb3`: convert `@solana/kit`
   instructions (Orca v4) to `@solana/web3.js` so they can be wrapped by the classic SDK.
4. **`src/wallet/swig/index.ts`** — barrel exports.
5. **`src/wallet/utils.ts`** — registry mirroring Privy: `swig-wallets.json` storing
   `{ address, accountAddress, ownerAddress, delegateAddress, id, addedAt }`; `getSwigWallets`,
   `isSwigWallet`, `getSwigWalletByAddress`, etc. `getWallets` reports `swigWalletAddresses`.
6. **`src/chains/solana/solana.ts`**:
   - add `'swig'` to `SolanaWalletType`; `getWalletType`/`isSwigWallet` resolve it,
   - `rebuildAndSignSwigTransaction(tx, address)` — load the delegate keypair from the
     keystore and rebuild+wrap+sign via `SwigSolanaSigner`,
   - `sendAndConfirmTransactionForWallet` intercepts swig wallets (rebuild → broadcast → confirm),
   - `signTransactionByType` and `getSolanaKitSigner` throw clear "use rebuild" errors for swig.
7. **Orca swap (`src/connectors/orca/clmm-routes/executeSwap.ts`)** — for a swig wallet,
   build the swap with a kit **no-op signer** for the Swig wallet address (so it is the token
   authority), convert the kit instructions to web3.js, and route through
   `sendAndConfirmTransactionForWallet` (which wraps + signs with the delegate).
8. **Routes** `src/wallet/routes/addSwigWallet.ts` (register an existing Swig PDA; verifies the
   delegate role on-chain and derives the funds-owner address) and `removeSwigWallet.ts`;
   registered in `wallet.routes.ts`.
9. **Provisioning** `scripts/swig/create-swig-wallet.ts` — run **offline** with the owner key:
   creates the Swig and adds the restricted delegate role, prints the registration payload.
   This is where the owner key is used; it never touches the Gateway host.
10. **Tests** `test/wallet/swig-*.test.ts` — kit→web3 conversion, service create/role logic
    (real SDK, no network), and the rebuild/sign path (mocked SDK + connection).

## Scope / boundaries (honest)

- **Orca is the first target** (the live USDM1/SPCX venue). Its swap path is fully wired.
- **Jupiter is intentionally NOT integrated yet.** The generic signer already handles
  versioned + ALT transactions (the hard part of a Jupiter integration), but `executeQuote`
  is left untouched per the current focus. Note: restricting an aggregator like Jupiter by
  program ID is impractical (it routes dynamically) — only the token spend caps would bound it.
- Other legacy connectors (Meteora, Raydium, Orca LP) work through the same
  `sendAndConfirmTransactionForWallet` chokepoint, but are not the focus and are unverified.
## Mainnet validation (2026-06-29)

Validated end-to-end on Solana mainnet with a real wallet (`DQcm…`), via the operational
scripts under `scripts/swig/`:

- **Provision** (`create-swig-wallet.ts` / `mainnet-test.ts`) — created a Swig, added a
  restricted delegate role, owner-signed.
- **Pure web3.js transfer** (`mainnet-continue.ts`) — a restricted delegate moved USDC out
  of the Swig wallet via `getSignInstructions`; Swig executed it via CPI as the PDA.
  Proves the core wrap/rebuild/delegate-sign path with no kit involved.
- **Orca swap** (`orca-register.ts` + `orca-swap-test.ts`) — the real `executeSwap`
  connector ran its swig branch (no-op signer → `kitInstructionToWeb3` → wrap → delegate
  sign). Bought JUP for USDC on the JUP/USDC whirlpool. Proves the kit-bridge path.
- **Token-2022** (`usdm1-check.ts`) — a delegate-signed USDM1 (Token-2022) transfer through
  the Swig wallet, after enabling USDM1 on the role.
- **Admin role update** (`add-usdm1.ts`) — owner-signed `getUpdateAuthorityInstructions`
  added a USDM1 spend cap to the existing delegate role.

## Empirical security model (verified on mainnet via `security-check.ts` / `dest-and-cleanup.ts`)

Swig is **default-deny, per mint**. Verdicts came from the on-chain Swig program logs:

| Delegate attempts to… | Result | Why |
|---|---|---|
| Drain SOL via the System program (not allowlisted) | **BLOCKED** (`0xbbe`, System never invoked) | program allowlist |
| Move a token with **no per-mint cap** on the role (USDM1 pre-enable) | **BLOCKED** (`0xbbe`) — the Token-2022 CPI *succeeds*, then Swig reverts the whole tx | default-deny per mint |
| Move an **enabled, capped** mint (USDC) to the owner | allowed | permitted mint |
| Move an **enabled, capped** mint (USDC) to a **stranger** | **allowed** | `tokenLimit` caps the *amount*, not the *destination* |

Implications:

- **SOL, arbitrary programs, and un-enabled tokens are hard-blocked.** A compromised
  delegate can only touch the specific mints you explicitly enabled, up to their caps. The
  blast radius equals the enabled mints × their caps.
- **For an enabled mint, the destination is NOT pinned** (we use `tokenLimit`). To restrict
  withdrawals to the owner you'd use `tokenDestinationLimit` — but that **blocks swaps for
  that mint** (a swap sends tokens to the pool vault, not the owner). So "swap freely on
  Orca" and "withdraw only to the owner" are mutually exclusive per mint with generic Swig
  actions. The practical guarantee is default-deny + per-mint caps (bounded blast radius).
- Enabling a token for trading is an **admin action** (owner-signed role update), not
  something the delegate can do.

## Key custody: signing without a private key on the server

Two tiers, with different key-handling requirements:

- **Admin tier (root / owner)** — creates the Swig and adds/rotates/updates delegate roles
  and the allowlist/caps. Uses a private key, but **rarely**, so it stays **offline** (a
  hardware wallet or an air-gapped admin machine). Protect it like a treasury key.
- **Signing tier (delegate)** — signs every trade and must **not** be a raw private key on
  the Gateway host. A Swig authority is just "something that can produce a valid signature
  for the role"; Swig doesn't care how. The delegate signer is **pluggable** (implemented:
  `SwigDelegateSigner`, `src/wallet/swig/delegate-signer.ts`), with the registry recording
  `delegateSigner: 'local' | 'kms'`:

  1. **`local` (implemented)** — the Ed25519 key is decrypted from Gateway's keystore and
     signs in-process. Simple; the raw key is on the host (encrypted). Fine for development.
  2. **`kms` (documented seam) — Cloud KMS / HSM (AWS KMS, GCP KMS, CloudHSM, YubiHSM).** A
     secp256r1/secp256k1 (or Ed25519) Swig authority backed by `createSecp256r1AuthorityInfo`
     / `createSecp256k1AuthorityInfo` + a `SigningFn` that calls the KMS. The server holds
     only IAM/SA creds to *request* a signature; the key is non-exportable. This is the
     production "zero raw key on the host" mode — **self-custodial, no third-party SaaS.**
  3. **Session keys** (`getCreateSessionInstructions`) — the long-lived KMS authority mints a
     short-lived session key that expires after N slots; limits the exposure window.

  > **No third-party custody.** An earlier draft recommended a Privy/Turnkey MPC authority as
  > the delegate. That has been dropped: Gateway no longer depends on a SaaS for custody. A
  > TEE/MPC vendor *could* be slotted in as another `SwigDelegateSigner` backend, but the
  > supported production path is **KMS** (see
  > [`wallet-architecture-roadmap.md`](./wallet-architecture-roadmap.md)).

  **Recommendation:** delegate signing via a **cloud KMS/HSM** Swig authority — non-exportable
  key, no raw key on the host, no third-party custodian.

  **Implementation note:** the seam is localized and already in place. `SwigSolanaSigner`
  takes a `SwigDelegateSigner` and calls `delegate.sign(outer)` on the rebuilt
  `VersionedTransaction`; `Solana.getSwigDelegateSigner` resolves the backend from the
  registry (`local` implemented, `kms` throws a clear "not implemented" until a backend is
  added). The wrap/rebuild is identical across backends — only the signature source changes.

## License note

The two Swig artifacts have **different** licenses, and the distinction matters:

- **`@swig-wallet/classic` (+ `@swig-wallet/coder`, `@swig-wallet/lib`) — the TS SDK we
  import and ship — is Apache-2.0** (verified in the npm package metadata and the upstream
  `swig-ts` `LICENSE.txt`). Same license as Gateway (Apache-2.0); fully permissive, no
  copyleft obligation beyond attribution. This is the only Swig code that ends up in
  Gateway's distribution.
- **The Swig on-chain program (Rust, `swigypW…`) is AGPL-3.0.** Gateway does **not** bundle,
  link, or distribute it — it sends instructions to the single instance Anagram already
  deployed to mainnet, over RPC. AGPL's obligations attach to *distributing* the work or
  *running a modified copy* and serving users (the §13 network clause); a client calling a
  separately-deployed program over RPC is not linking and does not become a derivative work,
  so the program's AGPL imposes nothing on Gateway. (Same posture as any Solana client of any
  on-chain program, or any app calling an AGPL SaaS API.)

**Net: no copyleft reach into Gateway.** Not a merge blocker. For belt-and-suspenders on an
upstream PR, the Foundation may have counsel confirm the standard "RPC client of an AGPL
program is not a derivative work" reading, but the facts are clean.
