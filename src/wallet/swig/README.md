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

Verified on mainnet (see `docs/proposals/swig-wallet-integration.md` → "Empirical security
model"). Swig is **default-deny, per mint**:

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
revocable) remains available and is documented in the design doc; it is optional given the
Swig backstop and the bounded hot-wallet balance.

## Pointers

- Design + architecture: `docs/proposals/swig-wallet-integration.md`
- Operational scripts: `scripts/swig/` (provision, register, swap, transfer, security probe)
- Code: `swig-service.ts` (SDK wrapper), `swig-signer.ts` (wrap + rebuild), `kit-instructions.ts`
