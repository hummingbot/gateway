# feat: PancakeSwap V3 MasterChef NFT Staking — 4 routes, ABI, unit tests

## Dependency

**Full integration testing requires [gateway#646](https://github.com/hummingbot/gateway/pull/646) to be merged first.**
PR #646 provides the PancakeSwap CLMM foundation this branch builds on:
the `pancakeswapV3MasterchefAddress` contract addresses, the `positions-owned`
address-order fix, the `executeSwap` BigInt fix, and the `quotePosition` precision
fix. The MasterChef staking routes are non-functional without those pieces in place.

---

## Related PRs

- [gateway#638](https://github.com/hummingbot/gateway/pull/638) — original combined PR that fengtality reviewed; this branch is the MasterChef-only split he requested
- [gateway#646](https://github.com/hummingbot/gateway/pull/646) — required parent branch (PancakeSwap V3 CLMM fixes + contract addresses)

---

## What This PR Does

Implements the four PancakeSwap V3 MasterChef NFT staking endpoints that were
requested as part of #638's scope split, incorporating all of fengtality's
blocking and important review comments.

MasterChef V3 is PancakeSwap's yield-farming contract. Liquidity providers
deposit their V3 NFT position into MasterChef to earn CAKE token rewards while
the position remains active. This PR adds the complete stake → check → unstake →
close lifecycle to Gateway.

---

## Problems Resolved from fengtality's Review of #638

### 🔴 Blocking — Fixed

**1. `poolId === 0` falsely rejected valid MasterChef pool #0**

`v3PoolAddressPid` is a Solidity `mapping(address => uint256)` that returns `0`
for both unregistered addresses *and* legitimately registered pid-0 pools (the
CAKE/WBNB pool on BSC is typically pid 0). The original code threw an error
whenever the mapping returned 0, making it impossible to stake into the first
registered pool.

Fix: `getV3PoolIdFromMasterChef()` now calls `poolInfo(0).v3Pool` when the
mapping returns 0 and checks whether the returned address matches the requested
pool address. Only a mismatch is treated as unregistered.

**2. All 4 route handlers used `reply.status(500).send` instead of `fastify.httpErrors.*`**

This collapsed 400-class precondition failures (not approved, not staked,
zero-liquidity, pool not registered) into opaque 500s that Hummingbot strategies
could not distinguish from server crashes.

Fix: All handlers use `fastify.httpErrors.badRequest()` for caller-fixable
conditions and `fastify.httpErrors.internalServerError()` for unexpected failures.

### 🟡 Important — Fixed

**3. `unstakeNft` had no precondition check that the NFT was actually staked**

Calling `masterChef.withdraw(tokenId, ...)` when the NFT is not staked produced
an opaque ethers revert with no user-friendly message.

Fix: `unstakeNft()` calls `ownerOf(tokenId)` on the NFT manager before
submitting the withdrawal. If the owner is not the MasterChef contract address,
it throws a descriptive error (HTTP 400) before any on-chain call is attempted.

**4. `setTimeout(2000)` between unstake and close in `masterchef-unstake-and-close`**

BSC block time is ~3 s, so a 2000 ms delay is shorter than one block — the NFT
would frequently not yet be back in the wallet when `closePosition` was called,
causing the close to revert.

Fix: `unstakeNft()` already awaits `tx.wait(1)` on the withdrawal receipt before
returning. No sleep is needed; close is submitted only after on-chain confirmation.

**5. `isBaseToken0` used WETH as the "wrapped native" heuristic**

On BSC the wrapped native is WBNB, not WETH, causing base/quote token orientation
to invert for BSC pairs.

Fix: `stakeNft()` uses pure address-order comparison
(`token0.address < token1.address`) — the canonical Uniswap V3 fork convention,
already applied to `positionsOwned` in #646.

### 🟢 Nits — Fixed

**6. TypeBox schemas were defined inline inside route files**

Fix: All four request/response schema pairs live in
`src/connectors/pancakeswap/schemas.ts`, consistent with the rest of the
connector. Route files import them by name.

---

## Why `masterchef-knows-pool` Exists

The `POST /masterchef-knows-pool` endpoint answers one specific pre-flight
question before a stake attempt: *is this V3 pool registered in MasterChef V3?*

Only pools explicitly added by the MasterChef owner earn CAKE rewards. A wallet
can hold a valid V3 NFT position in a pool that has never been registered —
attempting to stake it will revert on-chain with no meaningful message. By calling
`masterchef-knows-pool` first, a Hummingbot strategy or operator can:

1. Confirm the pool is eligible before paying gas on a doomed stake transaction.
2. Retrieve the numeric `pid` (pool ID) for display or logging.
3. Correctly handle pid 0 — the CAKE/WBNB pool, which maps to zero in the
   `v3PoolAddressPid` mapping just like an unregistered pool.

The endpoint is read-only (no wallet required, no gas) and is intentionally
separate from `masterchef-stake` so strategies can query it independently.

---

## New Endpoints

All routes are registered under `/connectors/pancakeswap/nft-staking/`.

| Route | Method | Purpose |
|---|---|---|
| `masterchef-knows-pool` | POST | Check whether a V3 pool is registered in MasterChef V3; returns `registered` boolean and `pid` |
| `masterchef-stake` | POST | Transfer a V3 NFT position into MasterChef via `safeTransferFrom` to begin CAKE reward accrual |
| `masterchef-unstake` | POST | Call `withdraw(tokenId, wallet)` to return the NFT and harvest all accumulated CAKE in one transaction |
| `masterchef-unstake-and-close` | POST | Convenience: unstake (confirmed on-chain) then immediately close the V3 position, removing liquidity and collecting fees |

---

## Pre-flight Requirements for Staking

Before calling `masterchef-stake` the caller must:

1. **Verify the pool is registered** — call `masterchef-knows-pool` first.
2. **Approve MasterChef for NFT transfers** — call `setApprovalForAll(masterchefAddress, true)` on the NonfungiblePositionManager contract (`0xEfF92A263d31888d860bD50809A8D171709b7b1c` on BSC). This is a one-time approval per wallet.
3. **Confirm the position has non-zero liquidity** — staking an empty position reverts.

---

## Changed Files

### New Files

| File | Purpose |
|---|---|
| `src/connectors/pancakeswap/PancakeswapV3Masterchef.abi.json` | Complete 363-entry ABI including `poolInfo`, `userPositionInfos`, `withdraw`, `v3PoolAddressPid`, all events |
| `src/connectors/pancakeswap/nft-staking/index.ts` | Route registration barrel |
| `src/connectors/pancakeswap/nft-staking/masterchef-knows-pool.ts` | `POST /masterchef-knows-pool` handler |
| `src/connectors/pancakeswap/nft-staking/masterchef-stake.ts` | `POST /masterchef-stake` handler |
| `src/connectors/pancakeswap/nft-staking/masterchef-unstake.ts` | `POST /masterchef-unstake` handler |
| `src/connectors/pancakeswap/nft-staking/masterchef-unstake-and-close.ts` | `POST /masterchef-unstake-and-close` handler |
| `test/connectors/pancakeswap/nft-staking/masterchef-knows-pool.test.ts` | Unit tests — knows-pool |
| `test/connectors/pancakeswap/nft-staking/masterchef-stake.test.ts` | Unit tests — stake |
| `test/connectors/pancakeswap/nft-staking/masterchef-unstake.test.ts` | Unit tests — unstake |
| `test/connectors/pancakeswap/nft-staking/masterchef-unstake-and-close.test.ts` | Unit tests — unstake-and-close |

### Modified Files

| File | Change |
|---|---|
| `src/connectors/pancakeswap/pancakeswap.ts` | Added `masterChef` Contract property; `init()` instantiates it; added `getV3PoolIdFromMasterChef()`, `getPoolMasterchefData()`, `stakeNft()`, `unstakeNft()` methods with all fengtality fixes applied |
| `src/connectors/pancakeswap/pancakeswap.routes.ts` | Added `pancakeswapNftStakingRoutesWrapper` and `nftStaking` key in exports |
| `src/connectors/pancakeswap/schemas.ts` | Added all four request/response TypeBox schema pairs for MasterChef endpoints |

---

## Swagger / OpenAPI Documentation

All four endpoints are fully documented in the auto-generated Swagger UI at `/docs`.

### `POST /connectors/pancakeswap/nft-staking/masterchef-knows-pool`

**Summary:** Check whether a V3 pool is registered in MasterChef

**Description:** Returns the MasterChef pool ID and registration status for a
PancakeSwap V3 pool address. Use this before staking to verify the pool is
eligible for CAKE rewards. Correctly handles pid-0 (e.g. the CAKE/WBNB pool on
BSC) — the `v3PoolAddressPid` mapping returns 0 for both unregistered addresses
and the legitimately registered pool at index 0; this endpoint resolves the
ambiguity via a secondary `poolInfo(0).v3Pool` check.

| Field | Type | Default | Description |
|---|---|---|---|
| `network` | string | `bsc` | EVM network — `bsc`, `mainnet`, `arbitrum`, `base` |
| `poolAddress` | string | — | PancakeSwap V3 pool address to check |
| **`registered`** | boolean | — | Whether the pool is registered in MasterChef V3 |
| **`pid`** | number? | — | MasterChef pool ID (only present when `registered: true`) |

### `POST /connectors/pancakeswap/nft-staking/masterchef-stake`

**Summary:** Stake a V3 NFT position into MasterChef for CAKE rewards

**Description:** Transfers a PancakeSwap V3 NFT position to the MasterChef V3
contract via `safeTransferFrom`, registering the deposit and beginning CAKE
reward accrual. The wallet must own the NFT and have approved the MasterChef
address (or `setApprovalForAll`). The pool must be registered in MasterChef
and the position must have non-zero liquidity. Returns 400 for all
caller-fixable precondition failures (not owned, not approved, not registered,
zero liquidity).

| Field | Type | Default | Description |
|---|---|---|---|
| `network` | string | `bsc` | EVM network |
| `walletAddress` | string | — | Wallet that owns the NFT |
| `tokenId` | string | — | NFT position token ID to stake |
| **`signature`** | string | — | Transaction hash |
| **`status`** | number | — | `1` = success |
| **`fee`** | string | — | Gas fee paid in wei |

### `POST /connectors/pancakeswap/nft-staking/masterchef-unstake`

**Summary:** Unstake a V3 NFT position from MasterChef and harvest CAKE

**Description:** Calls MasterChef V3 `withdraw()`, which returns the NFT to the
wallet and harvests all accumulated CAKE rewards in a single transaction. The NFT
must currently be staked (owned by the MasterChef contract) — checked via
`ownerOf()` before any on-chain call, returning HTTP 400 if not staked. The NFT
is confirmed back in the caller's wallet when this call resolves.

| Field | Type | Default | Description |
|---|---|---|---|
| `network` | string | `bsc` | EVM network |
| `walletAddress` | string | — | Wallet address to receive the NFT and rewards |
| `tokenId` | string | — | NFT position token ID to unstake |
| **`signature`** | string | — | Transaction hash |
| **`status`** | number | — | `1` = success |
| **`fee`** | string | — | Gas fee paid in wei |

### `POST /connectors/pancakeswap/nft-staking/masterchef-unstake-and-close`

**Summary:** Unstake a V3 NFT from MasterChef and close the position

**Description:** Two-step operation: (1) unstakes the NFT from MasterChef V3 and
harvests CAKE — awaiting on-chain confirmation via `tx.wait(1)` before
proceeding — then (2) closes the V3 position (removes all liquidity, collects
fees, burns the NFT). If unstake succeeds but close fails, the error message
includes the unstake transaction hash so the caller can recover manually.

| Field | Type | Default | Description |
|---|---|---|---|
| `network` | string | `bsc` | EVM network |
| `walletAddress` | string | — | Wallet address |
| `tokenId` | string | — | NFT position token ID |
| **`unstakeSignature`** | string | — | Transaction hash of the unstake step |
| **`closeSignature`** | string | — | Transaction hash of the close step |
| **`status`** | number | — | Final status (`1` = success) |
| **`fee`** | string | — | Gas fee paid for the unstake step in wei |

---

## Unit Tests

35 tests across 4 suites. All passing.

```
GATEWAY_TEST_MODE=dev npx jest --runInBand test/connectors/pancakeswap/nft-staking/
```

| Suite | Tests | Coverage |
|---|---|---|
| `masterchef-knows-pool.test.ts` | 8 | Happy path (pid > 0); pid-0 registered; pid-0 unregistered; network default; missing `poolAddress`; empty body; network forwarded correctly |
| `masterchef-stake.test.ts` | 9 | Happy path; network default; missing `tokenId`; missing `walletAddress`; empty body; NFT not owned (400); MasterChef not approved (400); pool not registered (400); zero liquidity (400); RPC error (500) |
| `masterchef-unstake.test.ts` | 9 | Happy path; zero CAKE reward; network default; missing `tokenId`; missing `walletAddress`; empty body; NFT not staked (400); wallet not found (400); RPC error (500) |
| `masterchef-unstake-and-close.test.ts` | 9 | Happy path; call order enforced (unstake before close, no setTimeout); network default; missing `tokenId`; missing `walletAddress`; empty body; NFT not staked — close not called (400); unstake OK but close fails — error includes unstake tx hash (500); wallet not found (400) |

---

## Integration Testing

The following manual steps require [gateway#646](https://github.com/hummingbot/gateway/pull/646) merged and
a running Gateway instance pointed at BSC.

### Prerequisites

```bash
# 1. Start Gateway
pnpm start --passphrase=<PASSPHRASE> --dev

# 2. Add wallet
curl -X POST http://localhost:15888/wallet/add \
  -H "Content-Type: application/json" \
  -d '{"chain":"ethereum","network":"bsc","privateKey":"<YOUR_KEY>"}'

# 3. One-time: approve MasterChef for NFT transfers
#    Call setApprovalForAll(0x556B9306565093C855AEA9AE92A594704c2Cd59e, true)
#    on the NonfungiblePositionManager (0xEfF92A263d31888d860bD50809A8D171709b7b1c)
```

### Test 1 — Check pool registration

```bash
curl -X POST http://localhost:15888/connectors/pancakeswap/nft-staking/masterchef-knows-pool \
  -H "Content-Type: application/json" \
  -d '{"network":"bsc","poolAddress":"<YOUR_POOL_ADDRESS>"}'
# Expected: {"registered":true,"pid":N}  or  {"registered":false}
```

### Test 2 — Stake NFT

```bash
curl -X POST http://localhost:15888/connectors/pancakeswap/nft-staking/masterchef-stake \
  -H "Content-Type: application/json" \
  -d '{"network":"bsc","walletAddress":"<YOUR_WALLET>","tokenId":"<YOUR_NFT_ID>"}'
# Expected: {"signature":"0x...","status":1,"tokenId":"...","fee":"..."}
```

### Test 3 — Unstake NFT

```bash
curl -X POST http://localhost:15888/connectors/pancakeswap/nft-staking/masterchef-unstake \
  -H "Content-Type: application/json" \
  -d '{"network":"bsc","walletAddress":"<YOUR_WALLET>","tokenId":"<YOUR_NFT_ID>"}'
# Expected: {"signature":"0x...","status":1,"tokenId":"...","fee":"..."}
```

### Test 4 — Unstake and close in one call

```bash
curl -X POST http://localhost:15888/connectors/pancakeswap/nft-staking/masterchef-unstake-and-close \
  -H "Content-Type: application/json" \
  -d '{"network":"bsc","walletAddress":"<YOUR_WALLET>","tokenId":"<YOUR_NFT_ID>"}'
# Expected: {"unstakeSignature":"0x...","closeSignature":"0x...","status":1,...}
```

### Expected Error Scenarios

**NFT not staked (attempting to unstake a wallet-held position):**

```json
{"statusCode":400,"error":"Bad Request","message":"NFT 1234 is not staked in MasterChef (current owner: 0xWallet...). You must stake the position first."}
```

**Pool not registered (attempting to stake into an unregistered pool):**

```json
{"statusCode":400,"error":"Bad Request","message":"Pool 0x... is not registered in MasterChef V3"}
```

**MasterChef not approved for NFT transfer:**

```json
{"statusCode":400,"error":"Bad Request","message":"Insufficient NFT approval. Please approve the position NFT (1234) for the Pancakeswap Position Manager (0x556B9306565093C855AEA9AE92A594704c2Cd59e)"}
```

---

## Backwards Compatibility

All changes are additive:

- New routes under a new `/nft-staking/` sub-path — no existing routes modified.
- `pancakeswap.routes.ts` adds `nftStaking` key alongside `router`, `amm`, `clmm` — no key renamed or removed.
- `pancakeswap.ts` adds new public methods and a private `masterChef` property — no existing method signatures changed.
- `schemas.ts` additions only — no existing schema types mutated.

---

## Developer Notes

**`.github/copilot-instructions.md`** contains the same content as `CLAUDE.md`.
Both files carry agent directives to keep them in sync. VS Code with a GitHub
Copilot account picks up `copilot-instructions.md` automatically, removing the
need to reference `CLAUDE.md` explicitly in AI prompts. The lenses added to both
files provide better code-review framing for any AI assistant working in this
repo.
