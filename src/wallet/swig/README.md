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

- 🔒 **Cannot** move SOL or call any non-allowlisted program (no drainer, no staking, no
  arbitrary CPI) — hard-blocked by the program allowlist.
- 🔒 **Cannot** move any token that has not been explicitly enabled on the role — even the
  token transfer itself succeeds, then Swig reverts the whole transaction.
- ⚠️ **Can** move the tokens you explicitly enabled (e.g. USDC for trading), to any
  destination, **up to their per-mint spend caps**. `tokenLimit` bounds the *amount*, not
  the destination.
- 🔁 **Revocable:** the owner rotates/removes the delegate role to cut the attacker off; the
  loss is bounded to `enabled mints × caps × hot-wallet balance`, never "all funds."

Pinning withdrawals to the owner address (`tokenDestinationLimit`) is possible but **blocks
swaps for that mint** (a swap sends tokens to the pool vault, not the owner), so it is not
used for trading mints. The practical guarantee is default-deny + per-mint caps.

## Signing-key storage

The delegate is a local **Ed25519** keypair, encrypted at rest with a passphrase-derived
key. A local key is acceptable here precisely because Swig — not key secrecy — is the
protection. For defense-in-depth the at-rest encryption should match the **keystore v3**
grade that Gateway's Ethereum wallets and Hummingbot already use:

- **Gateway Ethereum** (`ethereum.ts`): ethers `Wallet.encrypt` → keystore v3 (scrypt +
  AES-128-CTR + keccak MAC). ✅
- **Hummingbot** (`config_crypt.py`): `eth_account` keystore v3 (PBKDF2 ~1,000,000 iters /
  scrypt + MAC). ✅
- **Gateway Solana** (`solana.ts` `encrypt`): custom `aes-256-ctr` + PBKDF2 **5,000 iters**,
  **no MAC**. ⚠️ Weaker KDF and no integrity check — the target to upgrade for the Swig key.

The harder-to-steal end of the spectrum (cloud KMS / HSM / enclave, non-exportable +
revocable) is tracked as a follow-up enhancement
([hummingbot/gateway#662](https://github.com/hummingbot/gateway/issues/662)); it is optional
given the Swig backstop and the bounded hot-wallet balance. The signer is already pluggable
behind `SwigDelegateSigner` (`delegate-signer.ts`) — `local` ships now, `kms` is the seam.

## Configuring restrictions (the delegate role)

A Swig wallet's guardrails are the **delegate role's actions**: an allowlist of **programs**
the delegate may invoke and a per-mint **spend cap** on the tokens it may move. Everything
not listed is denied. These are set when the role is created (with the offline owner key) and
amended later by the owner.

The action set is built in `SwigService.buildDelegateActions` from a `SwigRoleRestrictions`:

```ts
interface SwigRoleRestrictions {
  allowedProgramIds: string[];   // every program the wrapped instructions CPI into
  tokenLimits: { mint: string; amount: bigint }[];  // per-mint one-time spend caps (base units)
}
```

`Actions.set().programLimit({ programId })…tokenLimit({ mint, amount })…get()` — drop either
and that dimension becomes default-deny.

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
delegate may move of each. A mint with no `tokenLimit` cannot be moved at all — even native
SOL is denied unless explicitly enabled. The cap bounds the amount, **not the destination**
(pinning the destination would break swaps, which send to a pool vault — see above).

To restrict Gateway to, say, **USDM1 only**, give the delegate role a single `tokenLimit` for
the USDM1 mint and nothing else: every other mint, and SOL, is then unspendable.

```ts
const restrictions = {
  allowedProgramIds: [ORCA_WHIRLPOOLS, SPL_TOKEN, TOKEN_2022, ATA_PROGRAM],
  tokenLimits: [{ mint: USDM1_MINT, amount: 1_000_000_000n }], // 1,000 USDM1 @ 6 decimals
};
```

### Applying restrictions

All role changes are **owner-authorized** (the offline root key signs the returned
instructions); the delegate can never widen its own permissions.

- **At role creation** — `SwigService.buildAddDelegateInstructions(connection, account, owner,
  delegate, restrictions)` adds the restricted delegate to a freshly created Swig.
- **Enabling a new token later** — `SwigService.buildAddTokenLimitsInstructions(connection,
  account, owner, delegate, tokenLimits)` adds per-mint caps to the existing delegate role
  (e.g. turning on a new trading pair) without touching the program allowlist.

`POST /wallet/add-swig` then registers the provisioned wallet with Gateway and verifies the
delegate role exists on-chain; it does **not** create or widen the role.

### Provisioning a fresh wallet (offline)

`scripts/swig/create-swig.ts` (`pnpm swig:create`) is Step 1 of every deploy: offline, with the
owner key kept in env (never lands on the Gateway host or in shell history), it registers the
owner, creates the Swig, and mints a **fresh** bounded delegate whose baseline is the token +
System programs plus a one-time SOL cap — no venues, no spendable mints yet. The deploy-specific
grants are separate, one owner approval each: `swig:allow-program` (venues, e.g. Orca + Meteora
Whirlpools/DLMM), `swig:add-token` (per-mint caps), then `swig:fund`. See
`scripts/swig/SETUP.md` for the full step-by-step.

```bash
GATEWAY_PASSPHRASE=<pass>                            # encrypts the freshly-generated delegate key
GATEWAY_SWIG_OWNER_ADDRESS=<Ledger or keystore owner pubkey>   # owner secret never leaves the device
GATEWAY_SWIG_NETWORK=mainnet-beta \
GATEWAY_SWIG_RPC_URL=<rpc url> \
GATEWAY_SWIG_SOL_LIMIT=0.1 \
  pnpm swig:create
```

It prints the JSON body for `POST /wallet/add-swig`. The **delegate** must hold a little SOL
to pay fees, and the **Swig wallet** must hold the input token (within its cap) for a swap to
land. A delegate with no SOL fails simulation at fee-payer resolution before reaching the
Swig program.

## Pointers

- KMS / keyless custody follow-up: [hummingbot/gateway#662](https://github.com/hummingbot/gateway/issues/662)
- Code: `swig-service.ts` (SDK wrapper + role/action builders), `swig-signer.ts` (wrap +
  rebuild), `delegate-signer.ts` (pluggable signer), `kit-instructions.ts`
- Routes: `src/wallet/routes/addSwigWallet.ts`, `removeSwigWallet.ts`
