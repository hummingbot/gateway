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

## Script reference

| Command | Signs | Purpose |
|---|---|---|
| `pnpm swig:create` | owner | **Step 1** — create the Swig + a bounded delegate (token/System programs + SOL cap) |
| `pnpm swig:allow-program` | owner | **Step 2** — grant venues (presets) or raw program ids |
| `pnpm swig:add-token` | owner | **Step 3** — add per-mint spend caps (and top up the SOL cap) |
| `pnpm swig:fund` | owner | **Step 4** — SOL to delegate + SOL/tokens to the wallet, one tx |
| `pnpm swig:show` | — | **Step 5** — read-only live-policy + balance audit |
| `pnpm swig:add-delegate` | owner | rotate: add another bounded delegate to an existing Swig |
| `pnpm swig:revoke-delegate` | owner | kill switch: remove a delegate role |
| `pnpm swig:owner-close` | owner | close an empty Orca position the delegate can't |

## Prerequisites

- Ledger: connected, unlocked, **Solana app open**, **blind signing enabled** (the Swig
  instructions are custom-program calls the device can't decode).
- The owner (Ledger) address holds enough SOL for rent/fees plus whatever you plan to fund.
- **Network and RPC come from Gateway's own Solana config** (`conf/chains/solana.yml` →
  `defaultNetwork`, and `conf/chains/solana/<network>.yml` → `nodeURL`). The scripts read them
  automatically — no separate RPC to set. Use a private `nodeURL` there; the public one
  rate-limits hard. Override per-run with `GATEWAY_SWIG_RPC_URL` / `GATEWAY_SWIG_NETWORK`.
- Common values used in the examples:

```
USDC mint          = EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v   (6 decimals: 50 USDC = 50000000)
Meteora SOL/USDC   = 2sf5NYcY4zUPXUSmG6f66mskb24t5F8S11pC1Nz5nQT3   (CLMM pool for the test swap)
```

The **passphrase is passed via an environment variable, never a file** (it's the key that
decrypts the keystore). Export it for the session:

```bash
export GATEWAY_PASSPHRASE=<your gateway passphrase>
export GATEWAY_SWIG_OWNER_ADDRESS=<your Ledger Solana address>
```

The non-secret addresses can be persisted in **`conf/swig.env`** (gitignored, `chmod 600`),
which every `swig:*` script auto-loads — real environment variables always override the file.
`swig:create` prints the values to append (`GATEWAY_SWIG_ACCOUNT`,
`GATEWAY_SWIG_DELEGATE_ADDRESS`) so later steps and future sessions need no exports:

```bash
# conf/swig.env  — non-secrets only
GATEWAY_SWIG_OWNER_ADDRESS=<Ledger address>
GATEWAY_SWIG_ACCOUNT=<PDA, printed by swig:create>
GATEWAY_SWIG_DELEGATE_ADDRESS=<printed by swig:create>
```

> `GATEWAY_PASSPHRASE` (and any raw key) is **ignored if found in this file** — the scripts
> refuse to read secrets from disk and print a warning; always export it as an environment
> variable. `SWIG_ENV_FILE=<path>` points the scripts at a different file.
>
> Any script run with missing inputs prints exactly what's missing and a usage example —
> when in doubt, just run it.

---

## Setup — step by step

One script per owner-signed action. **Step 1 does the part that's identical in every deploy**
(create the wallet and a bounded delegate); Steps 2–4 are the deploy-specific grants and
funding. This is also the path that lets you evolve the policy later (add a venue, add a
token, top up a cap) without re-provisioning.

### Step 1 — create the wallet and its bounded delegate

```bash
pnpm swig:create
```

**2 Ledger approvals.** In one command it: registers your Ledger owner (if new), creates the
Swig account (owner = root), and adds a **fresh delegate** with the baseline policy — token +
System programs + a one-time **SOL cap** (default 0.1) — but **no venues and no spendable
mints**. The delegate can do nothing until Steps 2–3. It prints the **funds-owner address**
(fund + trade with this), the **Swig account (PDA)**, the **delegate address**, and the
**base58 id** (needed at registration). Persist the two that later steps read:

```bash
echo 'GATEWAY_SWIG_ACCOUNT=<PDA printed above>' >> conf/swig.env
echo 'GATEWAY_SWIG_DELEGATE_ADDRESS=<delegate printed above>' >> conf/swig.env
```

> **Why the SOL cap is a Step 1 basic, not a per-token choice:** swaps routinely make the
> wallet pay small lamport debits (rent when creating its token accounts, native-SOL wraps),
> and the Swig program tallies every wallet lamport decrease against the SOL cap — with none
> set, the swap executes and is then rejected post-run with `0xbbe`. So every deploy needs one;
> `swig:create` sets 0.1 SOL by default (covers ~50 account creations, and bounds the wallet
> SOL a compromised delegate could move). Override with `GATEWAY_SWIG_SOL_LIMIT=<sol>`.

### Step 2 — allow trading venues

```bash
GATEWAY_SWIG_VENUES=orca,meteora pnpm swig:allow-program
```

**1 approval** no matter how many venues in the call. Presets: `orca`, `meteora`,
`raydium-amm`, `raydium-clmm`.

**Custom programs** (a stablecoin treasury, a vault, any protocol without a preset) are
allowlisted by raw id:

```bash
GATEWAY_SWIG_PROGRAM_IDS=<programId,...> pnpm swig:allow-program
```

To find the right id(s), run the operation once from a normal wallet (or find any successful
transaction of it) and read the invoke logs on Solscan: every program it invokes must be on
the allowlist — except ComputeBudget, which stays top-level and never runs under the Swig
role. Missing one shows up later as `custom program error: 0xbbe`.

> **Jupiter:** no preset, on purpose. An aggregator routes through arbitrary programs, so a
> Jupiter wallet must stay **token-cap-only** — skip this step and rely on Step 3's caps.

### Step 3 — cap the tokens the delegate may spend

```bash
# 50 USDC one-time spend cap, one approval
GATEWAY_SWIG_TOKEN_LIMITS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v:50000000 \
  pnpm swig:add-token
```

**1 approval.** Caps are **one-time allowances**: the delegate spends them down and they're
exhausted — run this again to grant more. Base units (50 USDC with 6 decimals = `50000000`).
An un-capped mint is hard-blocked, whatever the venue allowlist says.

The SOL cap was already set in Step 1. To **top it up** later, add `GATEWAY_SWIG_SOL_LIMIT`
to this same call:

```bash
GATEWAY_SWIG_SOL_LIMIT=0.1 pnpm swig:add-token   # adds another 0.1 SOL of one-time headroom
```

### Step 4 — fund it

Funds can come from **anywhere** — only the amounts matter. `swig:fund` bundles the legs into
**one transaction** signed by a funding source you choose:

- **From a non-hardware wallet** (no device): a regular Gateway keystore wallet signs in
  process. By default it uses your `solana.defaultWallet` from config; point at another with
  `GATEWAY_SWIG_FUND_FROM=<address>`. Needs `GATEWAY_PASSPHRASE` to decrypt it.
- **From your Ledger owner:** set `GATEWAY_SWIG_FUND_FROM=<owner Ledger address>` (or leave the
  owner as the default) and approve the one transaction on the device.

```bash
# ONE transaction: 0.03 SOL to the delegate (tx fees) + 0.01 SOL headroom and 10 USDC to the Swig wallet
# Funder = solana.defaultWallet (override with GATEWAY_SWIG_FUND_FROM=<Ledger or keystore address>)
GATEWAY_SWIG_FUND_DELEGATE_SOL=0.03 \
GATEWAY_SWIG_FUND_WALLET_SOL=0.01 \
GATEWAY_SWIG_FUND_WALLET_TOKENS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v:10000000 \
  pnpm swig:fund
```

**1 signature.** All three funding legs matter: the delegate needs SOL or swaps fail at
fee-payer resolution; the Swig wallet needs the input token (within its cap); and the wallet
needs a little SOL of its own — the PDA is created holding exactly the rent-exempt minimum,
and DEX SDKs simulate with the wallet as payer, so with zero headroom every swap dies in
simulation with `InsufficientFundsForRent`. The funder must hold everything it's sending; you
can also skip this script and send the SOL/tokens from any wallet by hand.

### Step 5 — verify the policy (read-only, run anytime)

```bash
GATEWAY_SWIG_TOKEN_MINTS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v pnpm swig:show
```

No signing. Prints each role, which venue programs the delegate may use, and the **remaining**
spend cap per mint. Run it after every policy change.

---

## Register with Gateway

Start Gateway (`pnpm start --passphrase=<pass>`), then register the wallet — `swig:create`
printed every value:

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

Buy 0.05 SOL with USDC through the Swig wallet (`walletAddress` = the **funds-owner
address**). `side` refers to the **base** token: `BUY` buys SOL spending USDC, `SELL` sells
SOL for USDC — and `amount` is always denominated in the base token. Since the wallet was
funded with USDC, the test uses `BUY`:

```bash
curl -s -X POST http://localhost:15888/connectors/meteora/clmm/execute-swap \
  -H 'Content-Type: application/json' \
  -d '{
    "network": "mainnet-beta",
    "walletAddress": "<funds-owner address>",
    "baseToken": "SOL",
    "quoteToken": "USDC",
    "amount": 0.05,
    "side": "BUY",
    "poolAddress": "2sf5NYcY4zUPXUSmG6f66mskb24t5F8S11pC1Nz5nQT3",
    "slippagePct": 1
  }'
```

A 200 with a `signature` and `status: 1` (CONFIRMED) means the whole chain works. Look the
signature up on Solscan; then `pnpm swig:show` to watch the USDC cap tick down.

The liquidity lifecycle works the same way through the standard Gateway routes
(`open-position`, `add-liquidity`, `remove-liquidity`, `collect-fees`, `positions-owned`,
`close-position`) with the funds-owner address as `walletAddress` — all delegate-signed and
unattended. The one exception is closing an **Orca** position, which is owner-signed via
`pnpm swig:owner-close` (see Troubleshooting for why).

---

## Ongoing policy management

Each is **one Ledger approval**, applied to the live wallet — no re-provisioning:

| I want to… | Run |
|---|---|
| Add a venue (e.g. Raydium CLMM) | `GATEWAY_SWIG_VENUES=raydium-clmm pnpm swig:allow-program` |
| Enable a new token | `GATEWAY_SWIG_TOKEN_LIMITS=<mint>:<cap> pnpm swig:add-token` |
| Top up an exhausted cap (token or SOL) | same `swig:add-token` call again (`GATEWAY_SWIG_SOL_LIMIT` for SOL) |
| Top up funds | `pnpm swig:fund` |
| Close an empty Orca position (burn NFT, reclaim rent) | `GATEWAY_SWIG_POSITION=<address> pnpm swig:owner-close` — owner-signed; the delegate cannot (see Troubleshooting) |
| Audit what's allowed right now | `pnpm swig:show` (read-only) |

### Revoke / rotate the delegate

If the Gateway host may be compromised, or to rotate keys:

```bash
pnpm swig:revoke-delegate      # 1 approval — the delegate immediately loses all access
```

Then remove the registration (`DELETE /wallet/remove-swig`), delete the old key file from
`conf/wallets/solana/`, mint a replacement on the **same** Swig with `pnpm swig:add-delegate`,
re-grant its venues and caps (Steps 2–3), and re-register. Funds in the Swig wallet are
untouched throughout — only the owner can move them out.

---

## FAQ

### What happens if my delegate key is lost (host died, keystore deleted, passphrase forgotten)?

**Your funds are safe.** The delegate never holds the funds — the Swig wallet (a keyless PDA)
does, and the owner (your Ledger) has full authority over it regardless of what happens to the
delegate. A lost delegate only means Gateway can't trade until you replace it:

1. `pnpm swig:revoke-delegate` — remove the dead role (good hygiene; strictly required only if
   the key might be *stolen* rather than lost).
2. `pnpm swig:add-delegate` — mint a new delegate on the same Swig, then re-grant venues and
   caps (Steps 2–3).
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
remaining caps, and wallet SOL up to the remaining SOL cap** — note the caps bound the
*amount*, not the destination, so assume anything under an active cap is spendable by the
attacker. Un-capped mints, SOL beyond the cap, and every other program are hard-blocked.
This bounded blast radius is the entire point of the design.

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
transaction history (the `swig:create` transaction on Solscan); the funds-owner address and
policy are all derivable from the account itself (`pnpm swig:show`).

### Can the delegate send funds to an arbitrary address?

For **capped assets, yes — up to the cap**: the token/System programs are on the allowlist,
and caps bound the amount, not the destination. That includes wallet SOL up to the SOL cap.
For everything else, no: un-capped mints and SOL beyond the cap cannot be moved by the
delegate at all. Size every cap as "the most I'm willing to lose to a full host compromise",
not as a convenience number.

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
| `custom program error: 0xbbe` before the swap logs | swap touches a program not on the allowlist | `pnpm swig:allow-program` with that venue/program id |
| `0xbbe` AFTER the swap fully executed in the logs | wallet paid lamports (ATA rent, SOL wrap) beyond the role's SOL cap (or the cap is exhausted) | top up: `GATEWAY_SWIG_SOL_LIMIT=0.1 pnpm swig:add-token` |
| `0x7d0` (ConstraintMut) on Meteora BUY swaps | DLMM SDK marks `binArrayBitmapExtension` read-only; fixed in Gateway ≥ this branch | update Gateway / rebuild |
| Orca `close-position` fails with `SBF program panicked` (`range end index 64 out of range for slice of length 0`) | **Swig design restriction**: inside a wrapped sign, a bounded role may only change a pre-existing wallet token account's *balance* — closing it is disallowed, and Orca's close burns the pre-existing position-NFT token account. (That it *panics* instead of returning a clean error is an upstream bug.) Roles with `All` permission skip these checks, so the owner can do it. | `remove-liquidity` via Gateway (delegate) to recover funds, then `GATEWAY_SWIG_POSITION=<address> pnpm swig:owner-close` (one Ledger approval) to close the shell, burn the NFT, and refund rent |
| `AccountNotFound` / fails before program logs | delegate has 0 SOL | `pnpm swig:fund` with `GATEWAY_SWIG_FUND_DELEGATE_SOL` |
| `InsufficientFundsForRent {account_index: 0}` in simulation, or `TRANSACTION_TIMEOUT` with the tx never landing | Swig wallet PDA has no SOL headroom (created at exactly the rent floor) | `pnpm swig:fund` with `GATEWAY_SWIG_FUND_WALLET_SOL=0.01` |
| swap reverts on the token transfer | input mint un-capped or cap exhausted | `pnpm swig:add-token` for that mint |
| `Swig wallet not registered for address` | registration skipped or wrong address | register the **funds-owner address** from `swig:create` |
| `No delegate role found` | wrong delegate address, or role was revoked | check `pnpm swig:show`; re-add if needed |

`pnpm swig:show` is the first stop for any policy question — it prints what the on-chain role
actually allows right now.
