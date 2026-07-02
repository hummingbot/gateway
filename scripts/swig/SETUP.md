# Swig wallet setup guide

Provision a Swig smart-wallet for Gateway: a self-custodial, on-chain policy layer that lets
Gateway trade unattended while a compromised host can only do **allowlisted swaps up to
per-mint caps** — never drain funds. See [`../../src/wallet/swig/README.md`](../../src/wallet/swig/README.md)
for how Swig works internally.

## Security rules (read first)

- **Never paste a private key or passphrase into a chat, a commit, or a log.** Secrets go in
  environment variables on your own machine only.
- The **owner key** is your treasury key. It signs admin actions here and **never touches the
  Gateway host**. A hardware wallet (Ledger) owner is strongly recommended.
- If a key is ever exposed, **rotate it immediately** (see [Revoke / rotate](#revoke--rotate-the-delegate)).
- Gateway only ever holds the **delegate** key, which is bounded on-chain — default-deny.

## The three addresses

| Role | Has a private key? | Where it lives | What it can do |
|---|---|---|---|
| **Owner / root** | yes | your Ledger (offline) | everything: admin the policy, withdraw, revoke |
| **Delegate** | yes | Gateway keystore (`conf/wallets/solana/`, encrypted) | only allowlisted programs, only capped mints |
| **Swig wallet** (funds owner) | **no — it's a PDA** | on-chain | holds the funds; moved only via owner or delegate |

The scripts always **generate a fresh delegate key** — never reuse a trading wallet as the
delegate; the whole point is that the key Gateway holds is not a key that controls anything else.

## Prerequisites

- Ledger: connected, unlocked, **Solana app open**, **blind signing enabled** (the Swig
  instructions are custom-program calls the device can't decode).
- The owner (Ledger) address holds enough SOL for rent/fees plus whatever you plan to fund.
- A private Solana RPC URL (the public one rate-limits hard). **Never commit it.**
- Common values used in the examples:

```
USDC mint          = EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v   (6 decimals: 50 USDC = 50000000)
Meteora SOL/USDC   = 2sf5NYcY4zUPXUSmG6f66mskb24t5F8S11pC1Nz5nQT3   (CLMM pool for the test swap)
```

Every script reads the same base env vars; export them once per shell:

```bash
export GATEWAY_PASSPHRASE=<your gateway passphrase>
export GATEWAY_SWIG_OWNER_ADDRESS=<your Ledger Solana address>
export GATEWAY_SWIG_RPC_URL=<your private Solana mainnet RPC URL>
```

> Any script run with missing inputs prints exactly what's missing and a usage example —
> when in doubt, just run it.

---

## Path A — step by step (recommended)

One script per owner-signed action, **one Ledger approval each**. This is the path that lets
you evolve the policy later (add a venue, add a token, top up a cap) without re-provisioning.

### Step 1 — create the Swig wallet

```bash
pnpm swig:init
```

The Ledger approves **1 transaction** (create account, owner = root). It prints the
**Swig account (PDA)**, the **funds-owner address** (the address you fund and trade with),
and the **base58 id** (needed at registration). Export the PDA for all following steps:

```bash
export GATEWAY_SWIG_ACCOUNT=<Swig account (PDA) printed above>
```

### Step 2 — add the delegate

```bash
pnpm swig:add-delegate
```

Generates a **fresh delegate key** encrypted into the Gateway keystore (the secret is never
printed), then the Ledger approves **1 transaction** adding its role with a baseline policy:
token programs only — **no venues, no spendable mints**. The delegate can do nothing yet.

```bash
export GATEWAY_SWIG_DELEGATE_ADDRESS=<delegate address printed above>
```

### Step 3 — allow trading venues

```bash
GATEWAY_SWIG_VENUES=orca,meteora pnpm swig:allow-program
```

**1 approval** no matter how many venues in the call. Presets: `orca`, `meteora`,
`raydium-amm`, `raydium-clmm`; raw ids via `GATEWAY_SWIG_PROGRAM_IDS=<id,...>`.

> **Jupiter:** no preset, on purpose. An aggregator routes through arbitrary programs, so a
> Jupiter wallet must stay **token-cap-only** — skip this step and rely on Step 4's caps.

### Step 4 — cap the tokens the delegate may spend

```bash
# 50 USDC one-time spend cap
GATEWAY_SWIG_TOKEN_LIMITS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v:50000000 pnpm swig:add-token
```

**1 approval.** Caps are **one-time allowances**: the delegate spends them down and they're
exhausted — run this again to grant more. Base units (50 USDC with 6 decimals = `50000000`).
An un-capped mint is hard-blocked, whatever the venue allowlist says.

### Step 5 — fund it

```bash
# 0.03 SOL to the delegate (tx fees) + 10 USDC to the Swig wallet, in ONE transaction
GATEWAY_SWIG_FUND_DELEGATE_SOL=0.03 \
GATEWAY_SWIG_FUND_WALLET_TOKENS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v:10000000 \
  pnpm swig:fund
```

**1 approval.** The delegate needs SOL or swaps fail at fee-payer resolution; the Swig wallet
needs the input token (within its cap). You can also just send both from any wallet.

### Step 6 — verify the policy (read-only, run anytime)

```bash
GATEWAY_SWIG_TOKEN_MINTS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v pnpm swig:show
```

No signing. Prints each role, which venue programs the delegate may use, and the **remaining**
spend cap per mint. Run it after every policy change.

---

## Path B — one-shot (demo convenience)

`pnpm swig:setup` compresses Steps 1–5 into one command (~4 Ledger approvals): fresh delegate,
Orca + Meteora allowlist, your caps, your funding. Same on-chain result; you just can't
review between steps.

```bash
GATEWAY_SWIG_TOKEN_LIMITS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v:50000000 \
GATEWAY_SWIG_FUND_DELEGATE_SOL=0.03 \
GATEWAY_SWIG_FUND_WALLET_TOKENS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v:10000000 \
  pnpm swig:setup
```

(`pnpm swig:provision` is the legacy provision-only script for a delegate key you already have.)

---

## Register with Gateway

Start Gateway (`pnpm start --passphrase=<pass>`), then register the wallet — `swig:init` /
`swig:setup` printed every value:

```bash
curl -s -X POST http://localhost:15888/wallet/add-swig \
  -H 'Content-Type: application/json' \
  -d '{
    "network": "mainnet-beta",
    "accountAddress": "<Swig account (PDA)>",
    "ownerAddress": "<owner address>",
    "delegateAddress": "<delegate address>",
    "id": "<base58 id>",
    "passphrase": "<your gateway passphrase>"
  }'
```

Gateway verifies the delegate role exists on-chain and stores the mapping. A 200 with
`"Swig wallet registered successfully"` means you're set.

## Test swap (Meteora)

Swap ~1 USDC → SOL through the Swig wallet (`walletAddress` = the **funds-owner address**):

```bash
curl -s -X POST http://localhost:15888/connectors/meteora/clmm/execute-swap \
  -H 'Content-Type: application/json' \
  -d '{
    "network": "mainnet-beta",
    "walletAddress": "<funds-owner address>",
    "baseToken": "SOL",
    "quoteToken": "USDC",
    "amount": 1,
    "side": "SELL",
    "poolAddress": "2sf5NYcY4zUPXUSmG6f66mskb24t5F8S11pC1Nz5nQT3",
    "slippagePct": 1
  }'
```

A 200 with a `signature` and `status: 1` (CONFIRMED) means the whole chain works. Look the
signature up on Solscan; then `pnpm swig:show` to watch the USDC cap tick down.

---

## Ongoing policy management

Each is **one Ledger approval**, applied to the live wallet — no re-provisioning:

| I want to… | Run |
|---|---|
| Add a venue (e.g. Raydium CLMM) | `GATEWAY_SWIG_VENUES=raydium-clmm pnpm swig:allow-program` |
| Enable a new token | `GATEWAY_SWIG_TOKEN_LIMITS=<mint>:<cap> pnpm swig:add-token` |
| Top up an exhausted cap | same `swig:add-token` call again |
| Top up funds | `pnpm swig:fund` |
| Audit what's allowed right now | `pnpm swig:show` (read-only) |

### Revoke / rotate the delegate

If the Gateway host may be compromised, or to rotate keys:

```bash
pnpm swig:revoke-delegate      # 1 approval — the delegate immediately loses all access
```

Then remove the registration (`DELETE /wallet/remove-swig`), delete the old key file from
`conf/wallets/solana/`, and re-run Steps 2–4 for a new delegate. Funds in the Swig wallet
are untouched throughout — only the owner can move them out.

---

## FAQ

### What happens if my delegate key is lost (host died, keystore deleted, passphrase forgotten)?

**Your funds are safe.** The delegate never holds the funds — the Swig wallet (a keyless PDA)
does, and the owner (your Ledger) has full authority over it regardless of what happens to the
delegate. A lost delegate only means Gateway can't trade until you replace it:

1. `pnpm swig:revoke-delegate` — remove the dead role (good hygiene; strictly required only if
   the key might be *stolen* rather than lost).
2. `pnpm swig:add-delegate` — mint a new delegate, then re-grant venues and caps (Steps 3–4).
3. Re-register with Gateway (`DELETE /wallet/remove-swig`, then `POST /wallet/add-swig` with
   the new delegate).

The only real loss is the small fee SOL sitting on the delegate address itself (e.g. the
0.03 SOL from `swig:fund`) — with the key gone, that SOL is unrecoverable. A forgotten
Gateway passphrase is the same scenario: the keystore can't be decrypted, so treat the
delegate as lost.

### What if the delegate key is *stolen* (host compromised)?

Run `pnpm swig:revoke-delegate` from your own machine — one Ledger approval and the stolen key
loses all access, instantly and on-chain. Until you do, the damage is bounded by the policy:
the thief can only invoke the allowlisted venue programs and move **capped mints up to their
remaining caps** — note the caps bound the *amount*, not the destination, so assume anything
under an active cap is spendable by the attacker. SOL in the Swig wallet, un-capped mints,
and every other program are hard-blocked. This bounded blast radius is the entire point of
the design.

### What if I lose the Ledger (owner)?

Restore the seed phrase on a new device — the owner is the address, not the physical Ledger,
and everything keeps working. If the seed phrase itself is lost, you've lost the root
authority: no policy changes, no revoke, no owner withdrawals, ever. The delegate keeps
working within its existing caps — you could still trade and route proceeds out through
allowlisted swaps, but nothing more. Protect the seed accordingly; the owner is the single
point of ultimate control by design.

### What if I lose the Swig account address or id (e.g. `conf/` wiped)?

Nothing is lost on-chain. Gateway stores registrations in
`conf/wallets/solana/swig-wallets.json` — backing that file up is enough to re-register
anywhere. If it's gone, the Swig account address and id are recoverable from the owner's
transaction history (the `swig:init` transaction on Solscan); the funds-owner address and
policy are all derivable from the account itself (`pnpm swig:show`).

### Can the delegate send funds to an arbitrary address?

For **capped mints, yes — up to the cap**: the token programs are on the allowlist, and the
cap bounds the amount, not the destination. For everything else, no: un-capped mints and the
wallet's SOL cannot be moved by the delegate at all. Size your caps as "the most I'm willing
to lose to a full host compromise", not as a convenience number.

### How do I get funds back out to my Ledger?

The owner (root) can always move everything — that authority never expires and needs no
policy. There's no dedicated sweep script yet; the Swig SDK's `getTransferAssetsInstructions`
does it (owner-signed), or simply swap out through an allowlisted venue and withdraw. For the
delegate's leftover fee SOL: that's a normal keypair in the Gateway keystore, so any standard
transfer signed by it works.

### A cap ran out mid-strategy — is something broken?

No — caps are **one-time allowances**, spent down to zero by design. Swaps start failing on
the token transfer once exhausted. Top up with the same `pnpm swig:add-token` call (one Ledger
approval); `pnpm swig:show` shows the remaining amount per mint.

### Can I run multiple delegates on one Swig wallet?

Yes, on-chain: each `pnpm swig:add-delegate` adds an independent role with its own allowlist
and caps, revocable separately. Note that a single Gateway instance registers **one delegate
per Swig wallet** (registration is keyed by the wallet's funds-owner address), so multiple
delegates means multiple Gateway instances — e.g. a conservative delegate on one host and a
wider one on another.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| script exits asking for env vars | missing input | it lists exactly what to set; copy the printed example |
| `Ledger device is locked` | device locked / wrong app | unlock, open the Solana app |
| approval fails on device | blind signing off | enable blind signing in the Solana app settings |
| `custom program error: 0xbbe` | swap touches a program not on the allowlist | `pnpm swig:allow-program` with that venue/program id |
| `AccountNotFound` / fails before program logs | delegate has 0 SOL | `pnpm swig:fund` with `GATEWAY_SWIG_FUND_DELEGATE_SOL` |
| swap reverts on the token transfer | input mint un-capped or cap exhausted | `pnpm swig:add-token` for that mint |
| `Swig wallet not registered for address` | registration skipped or wrong address | register the **funds-owner address** from `swig:init` |
| `No delegate role found` | wrong delegate address, or role was revoked | check `pnpm swig:show`; re-add if needed |

`pnpm swig:show` is the first stop for any policy question — it prints what the on-chain role
actually allows right now.
