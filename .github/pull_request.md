# feat: Wallet Multi-Network Support (BSC + all EVM networks)

**Branch:** `feat-multichain-wallets` → `development`

---

## Summary

Adds per-network wallet registration so the same EVM address can be tracked across
multiple networks (mainnet, BSC, Arbitrum, Base, etc.) without conflict. Introduces
a `/wallet/balance` endpoint, chain-singleton cache eviction, and BSC Swagger examples
across all routes. All changes are backwards-compatible — no existing Hummingbot Python
strategies are affected.

---

## Checklist

- [x] Code builds clean (`pnpm build`)
- [x] All new functionality has Jest tests (86 passing, 5 suites)
- [x] `walletAddresses: string[]` field unchanged (Hummingbot lens)
- [x] No raw errors thrown from route handlers — all use `fastify.httpErrors.*`
- [x] Legacy wallet file format (`{encryptedKey, network}` raw string) handled transparently
- [x] Swagger examples updated to include BSC across all EVM routes
- [x] Swagger `servers[0]` is `{url: '/'}` so "Try it out" works at any mapped port
- [x] `CLAUDE.md` and `.github/copilot-instructions.md` kept in sync
- [x] OpenAPI lens and GitHub lens added to both instruction files
- [x] `lfj-schema.json` added to `src/templates/namespace/` so Docker builds succeed

---

## What Changed

### 1. Network-Aware Wallet Storage

**Before:** One wallet file per address, single `network` string, no cross-network tracking.

**After:** Same wallet file, `networks: string[]` array, primary network at `networks[0]`.
Registering the same address for a new network merges the entry rather than overwriting it.

```json
// Old format (still read transparently)
{ "encryptedKey": "...", "network": "mainnet" }

// New format written on every add/create
{ "encryptedKey": "...", "network": "bsc", "networks": ["bsc", "mainnet"] }
```

Files affected:

- `src/wallet/utils.ts` — `addWallet`, `createWallet`, `readWalletFileData`, `getWallets`
- `src/wallet/schemas.ts` — `WalletEntrySchema` gains `networks[]`; `AddWalletRequestSchema`
  `chain` made Optional with `chainNetwork` as alternative; handler-level guard requires
  at least one of the two (throws `400` if both omitted)

### 2. New `/wallet/balance` Endpoint

`POST /wallet/balance` — returns token balances for any address without requiring
the wallet to be registered.

**Network resolution:**

1. If `network` / `chainNetwork` is provided — use it directly.
2. If omitted and the address is in the wallet store — use its primary registered network.
3. Otherwise — default to `mainnet` (Ethereum) or `mainnet-beta` (Solana).

```bash
# Ethereum mainnet (network omitted — defaults automatically)
curl -X POST http://localhost:15888/wallet/balance \
  -H "Content-Type: application/json" \
  -d '{"chain":"ethereum","address":"0xYourAddress"}'

# BSC — explicit network
curl -X POST http://localhost:15888/wallet/balance \
  -H "Content-Type: application/json" \
  -d '{"chain":"ethereum","network":"bsc","address":"0xYourAddress","tokens":["BNB","CAKE"]}'

# BSC — chainNetwork shorthand
curl -X POST http://localhost:15888/wallet/balance \
  -H "Content-Type: application/json" \
  -d '{"chainNetwork":"ethereum-bsc","address":"0xYourAddress"}'
```

Files affected: `src/wallet/routes/balance.ts`, `src/wallet/wallet.routes.ts`

### 3. Chain Singleton Cache Eviction

`Ethereum.resetInstance(network)` and `Solana.resetInstance(network)` evict a
cached provider so the next call to `getInstance()` picks up the updated `nodeURL`
without a server restart.

`POST /config/update` now calls `resetInstance` automatically when `nodeURL` changes
for either chain.

Files affected: `src/chains/ethereum/ethereum.ts`, `src/chains/solana/solana.ts`,
`src/config/routes/updateConfig.ts`

### 4. `chainNetwork` Shorthand Across All Wallet Routes

All wallet routes (`/add`, `/create`, `/balance`, `/hardware/add`) now accept
`chainNetwork: "ethereum-bsc"` as an alternative to supplying `chain` + `network`
separately. Parsing rule: `parts = value.split('-'); chain = parts[0]; network = parts.slice(1).join('-')`.

### 5. BSC Swagger Documentation + Relative Server URL

All EVM `network` field examples now include BSC alongside mainnet:

```
['mainnet', 'bsc', 'arbitrum', 'base', 'polygon', 'avalanche']
```

All `chainNetwork` examples put `ethereum-bsc` immediately after `ethereum-mainnet`:

```
['ethereum-mainnet', 'ethereum-bsc', 'ethereum-arbitrum', 'solana-mainnet-beta']
```

`servers[0]` in the OpenAPI spec is `{url: '/'}` so Swagger UI "Try it out" sends
requests relative to whatever host/port it is served from, eliminating CORS errors
when the container is mapped to a non-default port.

Files affected: `src/app.ts`, `src/schemas/amm-schema.ts`, `src/schemas/clmm-schema.ts`,
`src/schemas/chain-schema.ts`, `src/tokens/schemas.ts`, `src/pools/schemas.ts`

### 6. `chainNetwork` Routing Infrastructure

`poolInfo` routes for both Uniswap and PancakeSwap now parse `chainNetwork` at the
handler level, enabling the same connector endpoint to serve multiple EVM networks.

Files affected: `src/connectors/uniswap/amm-routes/poolInfo.ts`,
`src/connectors/uniswap/clmm-routes/poolInfo.ts`,
`src/connectors/pancakeswap/amm-routes/poolInfo.ts`,
`src/connectors/pancakeswap/clmm-routes/poolInfo.ts`

### 7. Corrupt Wallet File Warning

`getWallets` previously swallowed read errors silently. It now emits `logger.warn`
with the file path and reason, then defaults to the chain's primary network, so
operators are notified of potentially misrouted wallets.

### 8. LFJ Namespace Schema

`src/templates/namespace/lfj-schema.json` added so Docker image builds correctly
include the LFJ connector config schema (was present in `conf/` but missing from
the build-time templates directory).

Files affected: `src/templates/namespace/lfj-schema.json`

---

## Backwards Compatibility

| Field / Behaviour | Status |
|---|---|
| `walletAddresses: string[]` in GET /wallet response | ✅ Unchanged |
| Legacy `{encryptedKey, network}` file format | ✅ Read transparently |
| Legacy raw-string encrypted wallet files | ✅ Read transparently |
| Existing `/wallet/add` callers supplying `chain` | ✅ Unchanged |
| Default network (mainnet / mainnet-beta) when `network` omitted | ✅ Unchanged |
| Hummingbot Python strategy wallet parsing | ✅ `walletAddresses` and `address` fields unchanged |

---

## Files Changed

```
src/wallet/
  routes/balance.ts          NEW — /wallet/balance endpoint
  routes/addWallet.ts        Updated schema desc + examples
  routes/createWallet.ts     Updated schema desc + examples
  routes/getWallets.ts       Updated schema desc
  routes/addHardwareWallet.ts chainNetwork support
  schemas.ts                 WalletEntrySchema, AddWalletRequestSchema,
                             CreateWalletRequestSchema, WalletBalanceRequestSchema
  utils.ts                   addWallet, createWallet, getWallets, getWalletBalance,
                             readWalletFileData, resetInstance guards, logger.warn
  wallet.routes.ts           Register /balance route

src/chains/
  ethereum/ethereum.ts       +resetInstance(network)
  solana/solana.ts           +resetInstance(network)

src/config/
  routes/updateConfig.ts     Auto-evict chain singletons on nodeURL change

src/schemas/
  amm-schema.ts              BSC in all network/chainNetwork examples
  clmm-schema.ts             BSC in all network/chainNetwork examples
  chain-schema.ts            BSC in all network/chainNetwork examples

src/tokens/schemas.ts        BSC in network examples
src/pools/schemas.ts         BSC in network/chainNetwork examples

src/templates/namespace/
  lfj-schema.json            NEW — required for Docker image build

src/app.ts                   servers[0] = {url: '/'} for portable Swagger UI

src/connectors/
  uniswap/amm-routes/poolInfo.ts    chainNetwork parsing
  uniswap/clmm-routes/poolInfo.ts   chainNetwork parsing
  pancakeswap/amm-routes/poolInfo.ts chainNetwork parsing
  pancakeswap/clmm-routes/poolInfo.ts chainNetwork parsing

.github/copilot-instructions.md    +OpenAPI lens, +GitHub lens (9 lenses total)
CLAUDE.md                          +OpenAPI lens, +GitHub lens (9 lenses total)
docker-compose.yml                 Build from local source (Dockerfile)

test/wallet/
  wallet-balance.test.ts          22 tests (balance + edge cases + missing params)
  wallet-new-routes.test.ts       34 tests (create/show-key/send/remove/setDefault/list)
  wallet-multinetwork.test.ts     12 tests
  wallet-network-support.test.ts  18 tests
  hardware-wallet.routes.test.ts  (pre-existing, all pass)

test/connectors/
  chain-network-parsing.test.ts           NEW
  chain-network-routing.test.ts           NEW
  pool-info-chain-network.test.ts         NEW
  chain-network-routing-integration.test.ts NEW
```

---

## Test Coverage

### `test/wallet/wallet-balance.test.ts` (22 tests)

**Happy paths**

- Returns balances for Ethereum mainnet with explicit `network`
- Returns balances for BSC via `network: bsc`
- Returns balances for BSC via `chainNetwork: ethereum-bsc`
- Returns balances for Solana `mainnet-beta`
- Returns balances via `chainNetwork: solana-mainnet-beta`
- `tokens[]` array forwarded correctly to chain `getBalances`
- `timestamp` is within current execution window
- `chain + address` only (no `network`) → defaults to `mainnet` automatically
- `chain=solana + address` only → defaults to `mainnet-beta` automatically
- `chainNetwork: ethereum-mainnet` → resolves `network` to `mainnet`

**Edge cases**

- Token filter with explicit tokens array calls chain with that list
- Address in wallet store with BSC primary network auto-resolves without explicit `network`

**Missing / invalid parameters**

- Missing `address` → 400
- Missing both `chain` and `chainNetwork` → 400
- `chain: bitcoin` (unrecognized) → 400
- `chainNetwork: ethereummainnet` (no hyphen) → 400
- Chain RPC error → 500 with message

---

### `test/wallet/wallet-new-routes.test.ts` (34 tests)

**POST /wallet/create** (5 tests)

- Creates Solana wallet, returns address
- Creates Ethereum wallet, returns checksummed `0x` address
- `setDefault: true` accepted without error
- `chain: invalid-chain` → 400
- Empty body → 400

**POST /wallet/show-private-key** (6 tests)

- Returns private key for Solana wallet with correct passphrase
- Returns private key for Ethereum wallet with correct passphrase
- Wrong passphrase → 401
- Missing passphrase → 400
- Wallet file not found → 404
- Invalid chain → 400

**POST /wallet/send** (7 tests)

- Sends native SOL successfully
- Sends SOL with explicit `token: 'SOL'`
- Negative amount → 400
- Invalid recipient address → 500
- Invalid sender address → 500
- Missing required fields → 400
- Token not found → 400
- Invalid chain → 400

**DELETE /wallet/remove** (6 tests)

- Removes existing Ethereum wallet → 200 + message
- Removes existing Solana wallet → 200 + message
- Unrecognized chain → 400
- Missing address → 400
- Missing chain → 400
- Wallet file not found → 4xx

**POST /wallet/setDefault** (5 tests)

- Sets default for Ethereum → 200
- Sets default for Solana → 200
- Unrecognized chain → 400
- Missing address → 400
- Missing chain → 400

**GET /wallet/** (2 tests)

- Empty wallet store → `walletAddresses: []` on every chain entry
- `walletAddresses` is always `string[]` — never objects

**Integration** (1 test)

- Create wallet → show private key round-trip

---

### `test/wallet/wallet-multinetwork.test.ts` (12 tests)

- Same address registered for mainnet then BSC — `networks` merges correctly
- `walletDetails` entry contains `networks: ['mainnet', 'bsc']` in registration order
- `walletAddresses` (backwards-compat string[]) contains address exactly once
- Legacy `{encryptedKey, network}` file reads and converts to `networks: ['mainnet']`
- Legacy raw-string file reads and defaults to `['mainnet']`
- Re-registering same address + same network is idempotent
- Hardware wallet entries appear in `hardwareWalletDetails` with correct `networks`

---

### `test/wallet/wallet-network-support.test.ts` (18 tests)

**Happy paths** — BSC stored, `chainNetwork` parsed, `solana-mainnet-beta` multi-hyphen,
`chainNetwork` overrides `network`, defaults to `mainnet` / `mainnet-beta`

**Edge cases** — Corrupt wallet file → `logger.warn`, address-format filtering

**Missing / invalid** — No chain + no chainNetwork → 400, `chain: bitcoin` → 400,
`chainNetwork: ethereummainnet` → 400, missing `privateKey` → 400,
empty `/wallet/create` body → 400, `chain: tron` → 400

---

## Developer Testing

### Start gateway (dev / HTTP mode)

```bash
# Option A — Docker (recommended, builds locally)
docker compose up --build

# Option B — pnpm
pnpm build && pnpm start --passphrase=a --dev
```

### Swagger UI

Open <http://localhost:15888/docs> — all wallet routes are under the `/wallet` tag.
"Try it out" works correctly because `servers[0]` is the relative URL `"/"`.

### Add wallet to BSC

```bash
curl -X POST http://localhost:15888/wallet/add \
  -H "Content-Type: application/json" \
  -d '{"chain":"ethereum","network":"bsc","privateKey":"<YOUR_KEY>"}'
# → {"address":"0x...","network":"bsc"}
```

### Add same wallet to Ethereum mainnet (network merge)

```bash
curl -X POST http://localhost:15888/wallet/add \
  -H "Content-Type: application/json" \
  -d '{"chain":"ethereum","network":"mainnet","privateKey":"<SAME_KEY>"}'
# → {"address":"0x...","network":"mainnet"}
```

### Verify both networks are stored

```bash
curl http://localhost:15888/wallet/
# walletDetails[0].networks → ["bsc","mainnet"]
# walletAddresses[0]        → "0x..." (appears once — backwards compat)
```

### Check balance (network auto-resolved from wallet store)

```bash
curl -X POST http://localhost:15888/wallet/balance \
  -H "Content-Type: application/json" \
  -d '{"chain":"ethereum","address":"0x..."}'
# Network resolved from wallet store primary network (bsc) or defaults to mainnet
```

### Verify 400 on missing chain

```bash
curl -X POST http://localhost:15888/wallet/add \
  -H "Content-Type: application/json" \
  -d '{"privateKey":"0x0000000000000000000000000000000000000000000000000000000000000001"}'
# → 400 {"message":"Either \"chain\" or \"chainNetwork\" is required"}
```

---

## QA Tips

- Test all three network-supply methods: `network`, `chainNetwork`, and omitted (auto-detect).
- Manually create a legacy wallet file (raw encrypted string, no JSON wrapper) and
  verify GET `/wallet/` still lists it under the correct chain.
- To simulate a corrupted wallet file: `chmod 000` the `.json` file and call GET `/wallet/` —
  a `WARN` line should appear in `logs/` and the address should still be listed with
  the chain default network.
- Register the same private key for both `mainnet` and `bsc`, then call GET `/wallet/` and
  confirm the address appears once in `walletAddresses` and once in `walletDetails`
  with `networks: ["mainnet","bsc"]`.
- Confirm `walletAddresses` is always `string[]` (never objects) — this is the field
  Hummingbot Python strategies consume.
- Swagger "Try it out": use `{"chain":"ethereum","address":"0xYourAddress"}` for
  `/wallet/balance` — `network` is optional and defaults to `mainnet`.
