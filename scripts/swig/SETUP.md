# Set up a Swig wallet that trades on Orca + Meteora

A simple, end-to-end guide to provision a Swig smart-wallet, register it with Gateway, fund
it, and run a test swap on Meteora. See [`../../src/wallet/swig/README.md`](../../src/wallet/swig/README.md)
for how Swig works and why.

## TL;DR — one command

`pnpm swig:setup` does everything below except final registration: it generates a fresh
delegate key into the keystore, registers your Ledger as the owner (if connected), checks the
owner's balances cover the plan, provisions the Swig on-chain, funds it, and prints the exact
`POST /wallet/add-swig` call to finish. With a Ledger owner (recommended — connect it, open the
Solana app, enable blind signing):

```bash
GATEWAY_PASSPHRASE=<your gateway passphrase> \
GATEWAY_SWIG_OWNER_ADDRESS=<your Ledger Solana address> \
GATEWAY_SWIG_RPC_URL=<your Solana mainnet RPC URL> \
GATEWAY_SWIG_TOKEN_LIMITS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v:50000000 \
GATEWAY_SWIG_FUND_DELEGATE_SOL=0.03 \
GATEWAY_SWIG_FUND_WALLET_TOKENS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v:10000000 \
  pnpm swig:setup
```

You approve ~4 transactions on the device, then run the printed registration call (Step 2
below) and the test swap (Step 3). Run it with no env vars to see full usage. The manual
step-by-step flow follows if you prefer to run each piece yourself — `pnpm swig:provision`
is the provision-only step against a delegate key you already have.

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

**Owner options** — the provisioning script accepts any of these as the owner (pick one):

| Owner type | How | Safety |
|---|---|---|
| **Hardware (Ledger)** | `GATEWAY_SWIG_OWNER_ADDRESS=<registered Ledger pubkey>` | best — key never leaves the device |
| **Keystore** | `GATEWAY_SWIG_OWNER_ADDRESS=<pubkey>` + `GATEWAY_PASSPHRASE=<pass>` | key stays encrypted on disk |
| **Raw secret** | `GATEWAY_SWIG_OWNER_KEY=<base58>` | least safe — plaintext secret |

> ⚠️ **Security note:** if you use the keystore owner (`DQcmx…`), that key sits in
> `conf/wallets/solana/` next to the delegate — anyone with the passphrase + host gets *both*
> keys. A **hardware-wallet owner avoids this entirely** (recommended). If you do use the
> keystore owner, move it to 1Password and delete it from `conf/` once you've verified the setup.

### Using a hardware wallet as owner

1. **Register the Ledger** (once): connect it, open the Solana app, then
   ```bash
   curl -s -X POST http://localhost:15888/wallet/add-hardware \
     -H 'Content-Type: application/json' \
     -d '{"chain":"solana","address":"<your Ledger Solana address>"}'
   ```
2. **Enable blind signing** in the Ledger Solana app (the Swig create/add-delegate
   instructions are custom-program calls the device can't decode).
3. In Step 1 below, set `GATEWAY_SWIG_OWNER_ADDRESS=<Ledger address>` (no passphrase needed)
   and keep the device connected — you'll **approve ~4 transactions** on it (create, add
   delegate, fund SOL, fund USDC). The Ledger address must hold the SOL + USDC to fund.

Common values used below:

```
RPC   = <your Solana mainnet RPC URL>   # e.g. a private QuickNode/Helius endpoint — keep it out of version control
USDC  = EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
POOL  = 2sf5NYcY4zUPXUSmG6f66mskb24t5F8S11pC1Nz5nQT3   (Meteora SOL/USDC CLMM)
```

---

## Step 1 — Provision + fund the Swig (you run this)

Run on your own machine. Only public output is printed. This one owner-signed step creates the
Swig, adds the restricted delegate role, and **funds** the delegate (SOL for fees) and the Swig
wallet (USDC) from the owner. Set the owner via one of the three options above — example here
uses the **keystore** owner:

```bash
GATEWAY_SWIG_OWNER_ADDRESS=DQcmxgGCEwThGCzV6NmFG2WsbUpch3HLoZAhctcgeRM9 \
GATEWAY_PASSPHRASE=<your gateway passphrase> \
GATEWAY_SWIG_DELEGATE_ADDRESS=v9Ch97Dc9xwz4tkDT65LQARRFbniTK8VHCGpxa2oW8a \
GATEWAY_SWIG_NETWORK=mainnet-beta \
GATEWAY_SWIG_RPC_URL=<your Solana mainnet RPC URL> \
GATEWAY_SWIG_TOKEN_LIMITS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v:50000000 \
GATEWAY_SWIG_FUND_DELEGATE_SOL=0.03 \
GATEWAY_SWIG_FUND_WALLET_TOKENS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v:10000000 \
  npx ts-node scripts/swig/create-swig-wallet.ts
```

- **Hardware owner:** replace the first two lines with just
  `GATEWAY_SWIG_OWNER_ADDRESS=<Ledger address>` (no passphrase), keep the device connected, and
  approve each transaction on it.
- The keystore owner is loaded from `conf/wallets/solana/<address>.json` via your passphrase.
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
