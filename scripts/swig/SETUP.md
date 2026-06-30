# Set up a Swig wallet that trades on Orca + Meteora

A simple, end-to-end guide to provision a Swig smart-wallet, register it with Gateway, fund
it, and run a test swap on Meteora. See [`../../src/wallet/swig/README.md`](../../src/wallet/swig/README.md)
for how Swig works and why.

## Security rules (read first)

- **Never paste a private key or passphrase into a chat, a commit, or a log.** Secrets go in
  environment variables on your own machine only.
- The **owner key** is your treasury key. It signs once here and **never touches the Gateway
  host**. Keep it in 1Password; load it into the env var only for the moment you run step 1.
- If a key is ever exposed, **rotate it immediately**.
- Gateway only ever holds the **delegate** key, which is bounded on-chain (allowlisted
  programs + per-mint spend caps) — a compromised host can only swap on the allowed venues up
  to the caps.

## What you'll end up with

A Swig wallet whose delegate role allows **Orca + Meteora swaps** and can spend **USDC up to a
cap**, signed by Gateway with a delegate key, while the owner key stays offline.

## The two keys

The design needs exactly two distinct keys. The **owner** also funds (it already holds SOL +
USDC) — no separate funding wallet is needed.

| Role | Address (this setup) | Where it lives |
|---|---|---|
| **Owner / root** — creates the wallet, admin, and funds it | `DQcmxgGCEwThGCzV6NmFG2WsbUpch3HLoZAhctcgeRM9` | encrypted in this Gateway's keystore (`conf/wallets/solana/`) |
| **Delegate** — the key Gateway signs with, bounded on-chain | `v9Ch97Dc9xwz4tkDT65LQARRFbniTK8VHCGpxa2oW8a` | this Gateway's keystore |

They must be different keys: the whole point is that the key Gateway holds (delegate) is *not*
the key that controls everything (owner).

> ⚠️ **Security note:** the owner key is currently in `conf/wallets/solana/` alongside the
> delegate. That weakens the Swig guarantee — anyone with the passphrase + host gets *both*
> keys and can drain everything. After you've verified the setup, **move the owner key to
> 1Password and delete it from `conf/`** so it's truly offline.

Common values used below:

```
RPC   = https://greatest-virulent-water.solana-mainnet.quiknode.pro/126039d23539f652e6c848093477fcfcf5ca96d3/
USDC  = EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
POOL  = 2sf5NYcY4zUPXUSmG6f66mskb24t5F8S11pC1Nz5nQT3   (Meteora SOL/USDC CLMM)
```

---

## Step 1 — Provision + fund the Swig (you run this, with the owner key)

Run on your own machine. The owner key is read **straight from the encrypted keystore** using
your Gateway passphrase — it never leaves the file. Only public output is printed. This **also
funds** the delegate (SOL for fees) and the Swig wallet (USDC) from the owner, so it's the
only owner-signed step.

```bash
GATEWAY_SWIG_OWNER_ADDRESS=DQcmxgGCEwThGCzV6NmFG2WsbUpch3HLoZAhctcgeRM9 \
GATEWAY_PASSPHRASE=<your gateway passphrase> \
GATEWAY_SWIG_DELEGATE_ADDRESS=v9Ch97Dc9xwz4tkDT65LQARRFbniTK8VHCGpxa2oW8a \
GATEWAY_SWIG_NETWORK=mainnet-beta \
GATEWAY_SWIG_RPC_URL=https://greatest-virulent-water.solana-mainnet.quiknode.pro/126039d23539f652e6c848093477fcfcf5ca96d3/ \
GATEWAY_SWIG_TOKEN_LIMITS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v:50000000 \
GATEWAY_SWIG_FUND_DELEGATE_SOL=0.03 \
GATEWAY_SWIG_FUND_WALLET_TOKENS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v:10000000 \
  npx ts-node scripts/swig/create-swig-wallet.ts
```

- The owner key is loaded from `conf/wallets/solana/DQcmx….json` via your passphrase. (If you
  ever have it as a raw secret instead, use `GATEWAY_SWIG_OWNER_KEY=<base58>` and drop the
  address + passphrase.)
- `GATEWAY_SWIG_TOKEN_LIMITS` — the on-chain **spend cap**, `mint:amount` in base units.
  `50000000` = **50 USDC** (6 decimals) one-time cap.
- `GATEWAY_SWIG_FUND_DELEGATE_SOL=0.03` — owner sends 0.03 SOL to the delegate for fees.
- `GATEWAY_SWIG_FUND_WALLET_TOKENS=…:10000000` — owner sends **10 USDC** to the new Swig wallet
  (base units, same convention as the cap). Omit either funding var to skip that transfer.
- The default program allowlist already covers Orca + Meteora. Add more venues with
  `GATEWAY_SWIG_ALLOWED_PROGRAMS=<id,id>`.
- The owner (`DQcmx…`) pays rent + the funding transfers — it currently holds ~0.31 SOL and
  ~266 USDC, which is plenty.

It prints a JSON block like:

```json
{
  "network": "mainnet-beta",
  "accountAddress": "<swig PDA>",
  "address": "<NEW SWIG WALLET ADDRESS>",
  "ownerAddress": "DQcmxgGCEwThGCzV6NmFG2WsbUpch3HLoZAhctcgeRM9",
  "delegateAddress": "v9Ch97Dc9xwz4tkDT65LQARRFbniTK8VHCGpxa2oW8a",
  "id": "<base58 id>"
}
```

**Keep that JSON** — you need it for step 2, and the `address` field is the wallet you fund and trade with.

---

## Step 2 — Register it with Gateway

Start Gateway (`pnpm start --passphrase=<your gateway passphrase>`), then POST the JSON from
step 1, adding your Gateway passphrase:

```bash
curl -s -X POST http://localhost:15888/wallet/add-swig \
  -H 'Content-Type: application/json' \
  -d '{
    "network": "mainnet-beta",
    "accountAddress": "<swig PDA from step 1>",
    "ownerAddress": "DQcmxgGCEwThGCzV6NmFG2WsbUpch3HLoZAhctcgeRM9",
    "delegateAddress": "v9Ch97Dc9xwz4tkDT65LQARRFbniTK8VHCGpxa2oW8a",
    "id": "<id from step 1>",
    "passphrase": "<your gateway passphrase>"
  }'
```

Gateway verifies the delegate role exists on-chain and stores the mapping. A 200 with
`"Swig wallet registered successfully"` means you're set.

> Funding done in step 1: the **delegate** needs SOL or the swap fails at fee-payer resolution
> before it ever reaches the Swig program; the **Swig wallet** needs the input token (USDC)
> within its cap. To fund separately instead, just send those two amounts from any wallet.

---

## Step 3 — Test swap on Meteora

Swap ~1 USDC → SOL on the Meteora SOL/USDC pool, signed through the Swig wallet:

```bash
curl -s -X POST http://localhost:15888/connectors/meteora/clmm/execute-swap \
  -H 'Content-Type: application/json' \
  -d '{
    "network": "mainnet-beta",
    "walletAddress": "<new Swig address>",
    "baseToken": "SOL",
    "quoteToken": "USDC",
    "amount": 1,
    "side": "SELL",
    "poolAddress": "2sf5NYcY4zUPXUSmG6f66mskb24t5F8S11pC1Nz5nQT3",
    "slippagePct": 1
  }'
```

`side: SELL` here sells the quote (USDC) for the base (SOL). A 200 with a `signature` and
`status: 1` (CONFIRMED) means **Swig + Meteora works**. Look the signature up on Solscan.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `custom program error: 0xbbe` | a program the swap touches isn't on the delegate allowlist | re-provision (step 1) with that program id in `GATEWAY_SWIG_ALLOWED_PROGRAMS` |
| `AccountNotFound` / fails before any program logs | delegate has 0 SOL (can't pay fees) | fund the delegate with SOL (step 1's `GATEWAY_SWIG_FUND_DELEGATE_SOL`) |
| swap reverts on the token transfer | input mint not capped, or cap too low | re-provision with the mint in `GATEWAY_SWIG_TOKEN_LIMITS`, or raise the cap |
| `Swig wallet not registered for address` | step 2 skipped or wrong `address` | register the wallet's funds-owner `address` from step 1 |
| `No delegate role found` at register | wrong `delegateAddress`, or provisioning didn't finish | re-check step 1 output; the delegate must match |

To inspect what a wallet's delegate role actually allows, fetch the Swig account and call
`actions.canUseProgram(...)` / `actions.canSpendToken(...)` (see `SwigService`).
