# Swig smart-wallet signing

This module lets Gateway trade through a **Swig** smart-contract wallet on Solana instead
of a plain keypair. It exists for one security goal.

## Security goal

> **Limit the blast radius if the trading server is breached.** This is an algo-trading
> bot: it must sign transactions autonomously, so a signing key necessarily lives on the
> server. The goal is **not** to make that key unstealable — it is to ensure that an
> attacker who obtains the signing key **cannot take all our funds.** The Swig wallet is
> the on-chain guardrail that bounds what the signing key is allowed to do.

A normal hot wallet fails this goal: whoever holds the key can move everything. A Swig
wallet does not — the signing key is a *restricted delegate*, and the Swig program enforces
limits on-chain at execution time.

## Trust / capital model

| Key | Location | Used for | If compromised |
|---|---|---|---|
| **Owner / root** | offline (hardware wallet / treasury machine) | create the wallet; add/rotate delegates; edit the allowlist & spend caps (rare, admin-only) | catastrophic — protect like a treasury key |
| **Delegate (signing)** | on the trading server, encrypted at rest | signs every trade autonomously | **bounded** by the Swig role — see below |

Keep only **working capital** in the hot Swig wallet; the bulk stays in an owner-controlled
treasury (e.g. a Squads multisig). The delegate can only ever touch the hot wallet, within
its on-chain limits.

## What an attacker who steals the delegate key can / cannot do

Verified on mainnet. Swig is **default-deny, per mint**:

- 🔒 **Cannot** call any non-allowlisted program (no drainer, no staking, no arbitrary CPI)
  — hard-blocked by the program allowlist.
- 🔒 **Cannot** move any un-capped token — even the transfer itself succeeds, then Swig
  reverts the whole transaction. SOL beyond the role's SOL cap is blocked the same way.
- ⚠️ **Can** move the tokens you explicitly enabled (e.g. USDC for trading) up to their
  per-mint spend caps, **and** wallet SOL up to a small one-time **SOL cap** (every deploy
  sets one — default 0.1 SOL — because swaps make the wallet pay lamports for ATA rent and
  native-SOL wraps). Caps bound the *amount*, not the destination.
- 🔁 **Revocable:** the owner rotates/removes the delegate role to cut the attacker off; the
  loss is bounded to `enabled mints × caps + the SOL cap`, within the hot-wallet balance —
  never "all funds."

Pinning withdrawals to the owner address (`tokenDestinationLimit`) is possible but **blocks
swaps for that mint** (a swap sends tokens to the pool vault, not the owner), so it is not
used for trading mints. The practical guarantee is default-deny + per-mint caps.

## Signing-key storage

The delegate is a local **Ed25519** keypair, encrypted at rest with a passphrase-derived
key. A local key is acceptable here precisely because Swig — not key secrecy — is the
protection. For defense-in-depth the at-rest encryption is now at/above the **keystore v3**
grade that Gateway's Ethereum wallets and Hummingbot use:

- **Gateway Ethereum** (`ethereum.ts`): ethers `Wallet.encrypt` → keystore v3 (scrypt +
  AES-128-CTR + keccak MAC). ✅
- **Hummingbot** (`config_crypt.py`): `eth_account` keystore v3 (PBKDF2 ~1,000,000 iters /
  scrypt + MAC). ✅
- **Gateway Solana** (`services/secure-keystore.ts`): **scrypt** (N=2¹⁷ ≈ 128 MB, the OWASP
  minimum) **+ AES-256-GCM** — authenticated encryption, so a wrong passphrase or a tampered
  file fails loudly (the GCM tag is the integrity check). Shipped in **#659**; the old
  PBKDF2-5,000 / AES-256-CTR / no-MAC format survives only as a read-only path and is
  auto-migrated to the hardened format on the next decrypt. ✅

The harder-to-steal end of the spectrum (cloud KMS / HSM / enclave, non-exportable +
revocable) is tracked as a follow-up enhancement
([hummingbot/gateway#662](https://github.com/hummingbot/gateway/issues/662)); it is optional
given the Swig backstop and the bounded hot-wallet balance. The signer is already pluggable
behind `SwigDelegateSigner` (`delegate-signer.ts`) — `local` ships now, `kms` is the seam.

## Configuring restrictions (the delegate role)

A Swig wallet's guardrails are the **delegate role's actions**: an allowlist of **programs**
the delegate may invoke, a per-mint **spend cap** on the tokens it may move, and a one-time
**SOL cap** for wallet-paid rent/wraps. Everything not listed is denied. These are set when
the role is created (with the offline owner key) and amended later by the owner.

The action set is built in `SwigService.buildDelegateActions` from a `SwigRoleRestrictions`:

```ts
interface SwigRoleRestrictions {
  allowedProgramIds: string[];   // every program the wrapped instructions CPI into
  tokenLimits: { mint: string; amount: bigint }[];  // per-mint one-time spend caps (base units)
  solLimitLamports?: bigint;     // one-time SOL cap: wallet-paid ATA rent + native-SOL wraps
}
```

`Actions.set().programLimit({ programId })…tokenLimit({ mint, amount })…solLimit({ amount })…get()`
— drop a dimension and it becomes default-deny (an absent `solLimit` blocks every wallet-paid
lamport debit, so swaps that create an ATA or wrap SOL revert post-execution with `0xbbe`).

### Program restrictions

The Swig program checks **every** program the wrapped inner instructions touch against
`allowedProgramIds`. A single DEX swap CPIs into more than just the DEX: it also hits the SPL
Token program (and Token-2022 / the ATA program when an account must be created). **Miss one
and the whole `sign` reverts** (`0xbbe`). So the allowlist must be the *complete* set of
programs a route invokes, not just the connector's own program.

**Determine the exact set empirically — do not guess.** Simulate the route's transaction once
(e.g. against a permissive role, or read the connector's built instructions) and collect the
`programId` of every instruction, including inner CPIs. Use that set verbatim. Programs are
network-specific, so derive them per network rather than hardcoding.

As a starting reference, a route typically needs its connector program **plus** the token
programs:

| Needed by | Program |
|---|---|
| All token transfers | SPL Token (`Tokenkeg…`), Token-2022 (`TokenzQd…`) as applicable |
| ATA creation | Associated Token Account (`ATokenGP…`) |
| Orca swaps / LP | Orca Whirlpools program |
| Meteora swaps / LP | Meteora DLMM program |
| Raydium swaps / LP | Raydium CLMM / AMM program(s) for the route |

> **Jupiter is the exception.** The aggregator routes through *many* programs that vary per
> quote, so a program-restricted role will block it. A Swig wallet used with Jupiter needs a
> **token-cap-only role** (`allowedProgramIds` broad / unrestricted, `tokenLimits` set). The
> per-mint caps still bound the blast radius — an attacker can only move the enabled mints, up
> to their caps, even though the program set is open.

### Token restrictions

`tokenLimits` enables specific mints for spending and caps the **amount** (in base units) the
delegate may move of each. A mint with no `tokenLimit` cannot be moved at all. Native SOL is
governed separately by `solLimitLamports` (the SOL cap): the delegate may spend wallet SOL up
to that cap and no further — it exists so swaps can pay ATA rent and wrap SOL, not to move
capital. The caps bound the amount, **not the destination** (pinning the destination would
break swaps, which send to a pool vault — see above).

> **Caps are one-time budgets, not per-transaction limits.** Every successful transaction
> permanently decrements the remaining allowance (the Swig program's fixed `SolLimit` /
> `TokenLimit` actions are non-replenishing), and **rent paid for accounts the wallet creates
> (ATAs, position accounts, position NFT mints) debits the SOL cap too** — position management
> therefore consumes noticeably more SOL cap than swapping. When a cap runs dry the Swig
> program rejects the sign with `0xbc3` (`PermissionDeniedInsufficientBalance`). Watch
> remaining allowances with `pnpm swig:show` and top up with `pnpm swig:add-token`.

To restrict Gateway to, say, **USDM1 only**, give the delegate role a single `tokenLimit` for
the USDM1 mint and nothing else: every other mint is then unspendable, and SOL only to the
small rent/wrap cap.

```ts
const restrictions = {
  allowedProgramIds: [ORCA_WHIRLPOOLS, SPL_TOKEN, TOKEN_2022, ATA_PROGRAM, SYSTEM_PROGRAM],
  tokenLimits: [{ mint: USDM1_MINT, amount: 1_000_000_000n }], // 1,000 USDM1 @ 6 decimals
  solLimitLamports: 100_000_000n, // 0.1 SOL cap for ATA rent / native-SOL wraps
};
```

### Applying restrictions

All role changes are **owner-authorized** (the offline root key signs the returned
instructions); the delegate can never widen its own permissions.

- **At role creation** — `SwigService.buildAddDelegateInstructions(connection, account, owner,
  delegate, restrictions)` adds the restricted delegate (programs + token caps + SOL cap) to a
  freshly created Swig. This backs `pnpm swig:create` / `swig:add-delegate`.
- **Enabling a new token later** — `SwigService.buildAddTokenLimitsInstructions(...)` adds
  per-mint caps to the existing role (e.g. a new trading pair) without touching the allowlist
  (`swig:add-token`).
- **Allowing a new venue** — `SwigService.buildAddProgramLimitsInstructions(...)` extends the
  program allowlist (`swig:allow-program`).
- **Topping up the SOL cap** — `SwigService.buildAddSolLimitInstructions(...)` adds one-time SOL
  headroom (`swig:add-token` with a SOL amount).
- **Revoking** — `SwigService.buildRemoveDelegateInstructions(...)` removes the role entirely
  (`swig:revoke-delegate`).

`POST /wallet/add-swig` then registers the provisioned wallet with Gateway and verifies the
delegate role exists on-chain; it does **not** create or widen the role.

### Provisioning a fresh wallet (offline)

`scripts/swig/create-swig.ts` (`pnpm swig:create`) is Step 1 of every deploy: offline, with the
owner key kept in env (never lands on the Gateway host or in shell history), it registers the
owner, creates the Swig, and mints a **fresh** bounded delegate whose baseline is the token +
System programs plus a one-time SOL cap — no venues, no spendable mints yet. The deploy-specific
grants are separate, one owner approval each: `swig:allow-program` (venues, e.g. Orca + Meteora
Whirlpools/DLMM), `swig:add-token` (per-mint caps), then `swig:fund`. Network and RPC come from
Gateway's Solana config; the passphrase is passed via env, never a file. See
[`../../../scripts/swig/SETUP.md`](../../../scripts/swig/SETUP.md) for the full step-by-step.

It prints the JSON body for `POST /wallet/add-swig`. The **delegate** must hold a little SOL
to pay fees, and the **Swig wallet** must hold the input token (within its cap) for a swap to
land. A delegate with no SOL fails simulation at fee-payer resolution before reaching the
Swig program.

## Known limitations

- **Jupiter** needs a token-cap-only role (no program allowlist) — see the exception note
  under Program restrictions.
- **Position rent drains the SOL cap.** Opening a position pays rent from the wallet
  (a Meteora DLMM position is ~8 KB ≈ 0.057 SOL; Orca/Raydium positions are smaller), and
  every lamport leaving the wallet debits the one-time SOL cap. Closing a position refunds
  the rent to the wallet but does **not** restore the cap — an automated open/close
  rebalancing loop therefore consumes SOL cap on every cycle and needs periodic owner-signed
  top-ups (`pnpm swig:add-token`).
- Meteora DLMM positions hold at most **69 bins** regardless of wallet type (a program
  limit, not a Swig one — wider ranges fail with `InvalidPositionWidth` or
  `Failed to reallocate account data`). Gateway validates this on
  `/connectors/meteora/clmm/open-position` and returns the max price range for the pool.

## Pointers

- KMS / keyless custody follow-up: [hummingbot/gateway#662](https://github.com/hummingbot/gateway/issues/662)
- Code: `swig-service.ts` (SDK wrapper + role/action builders), `swig-signer.ts` (wrap +
  rebuild), `delegate-signer.ts` (pluggable signer), `kit-instructions.ts`
- Routes: `src/wallet/routes/addSwigWallet.ts`, `removeSwigWallet.ts`
