# feat: PancakeSwap V3 CLMM fixes, binCount pool-info for all CLMM connectors, extended Ethereum tx polling

## Related PRs

- Resolves the same class of problems addressed in [gateway#642](https://github.com/hummingbot/gateway/pull/642), extending those fixes to PancakeSwap V3 and adding a complete unit-test suite across all affected connectors.

---

## Problems Resolved

### 1 — PancakeSwap V3 `execute-swap` crashing with BigInt TypeError

`executeSwap.ts` imported `encodeSqrtRatioX96` from `@uniswap/v3-sdk` and passed it into the PancakeSwap SDK's swap router call. The two SDKs use incompatible `JSBI` instances, causing a silent `BigInt` type-mismatch at runtime that crashed every swap attempt.

**Fix:** Removed the `@uniswap/v3-sdk` import entirely. Set `sqrtPriceLimitX96: 0` on the swap params object — the correct no-limit sentinel for V3 routers. Slippage is enforced through `amountOutMinimum` / `amountInMaximum` as intended.

### 2 — PancakeSwap V3 `positions-owned` returning wrong base/quote orientation for non-WETH pairs

The previous code contained a `WETH` special-case that broke BSC pairs (e.g. USDT/WBNB) — the token whose address sorted lower was misidentified as the base, causing `baseTokenAmount` and `quoteTokenAmount` to be swapped in the response.

**Fix:** Replaced the WETH special-case with pure address-order comparison (`token0.address < token1.address`) consistent with how Uniswap V3 forks determine token ordering in the pool contract.

### 3 — PancakeSwap V3 `quote-position` precision loss from `Math.floor`

`quotePosition.ts` computed token amounts with `Math.floor(amount * 10^decimals)`. For large amounts (e.g. 1 000 USDT at 18 decimals) this loses precision at the integer boundary, producing incorrect tick-aligned liquidity quotes.

**Fix:** Replaced all `Math.floor` amount conversions with `utils.parseUnits(amount.toString(), decimals)` from ethers.js, which uses exact big-integer arithmetic. Also removed ~20 leftover `console.log` debug statements that were present in production code.

### 4 — BUY-side price inversion on Orca and Meteora `quote-swap`

On a BUY order the swap helper's input token is the quote token and the output token is the base token. The old code computed `price = outputAmount / inputAmount`, which on a BUY equals `base / quote` — the inverse of the expected `quote / base` convention. A SOL/USDC BUY returned `price ≈ 0.005` instead of `≈ 200`.

Hummingbot Python strategies parse the `price` field directly; this silent inversion caused bots to compute wildly wrong order sizes.

**Fix (Orca):** Reconstructed `price = quoteAmount / baseAmount` from first principles using `inputAmount` / `outputAmount` together with the `side` parameter, independent of which token was the router's input.

**Fix (Meteora):** Applied the same `estimatedAmountIn / amountOut` formula on the BUY branch (previously `amountOut / estimatedAmountIn`).

### 5 — `binCount` parameter missing from pool-info across all CLMM connectors

Meteora already supported returning a `bins[]` liquidity-distribution array via `binCount`. Orca, Raydium, Uniswap, and PancakeSwap did not, making cross-connector strategy code that relies on per-tick depth data unable to work uniformly.

**Fix:** Added `binCount` query parameter (integer, 0–400, default 0) to pool-info on all four connectors. When `binCount > 0`, a `bins[]` array is appended to the response containing `{ binId, price, baseTokenAmount, quoteTokenAmount }` entries centred on the active tick. Each connector uses its own distribution helper:

- Orca → `computeOrcaBinDistribution` (new function in `orca.utils.ts`)
- Raydium → `computeRaydiumBinDistribution` (new function in `raydium.utils.ts`)
- Uniswap → `computeUniswapBinDistribution` (existing function in `uniswap.utils.ts`)
- PancakeSwap → reuses `computeUniswapBinDistribution` (PancakeSwap V3 is a Uniswap V3 fork)

The base `PoolInfoSchema` (`src/schemas/clmm-schema.ts`) was updated with an optional `bins` field so all connectors share the same TypeBox-typed response shape.

### 6 — Ethereum transaction execution timeout causing confirmed txs to report as failures

`handleTransactionExecution` raced `tx.wait(1)` against a 30 s timeout. During network congestion a valid transaction could take 3–5 additional blocks (36–60 s on mainnet), causing it to be silently dropped and the caller to receive `null`.

**Fix:** After the initial timeout fires, the method now polls `getTransactionReceipt` every 5 s for an additional 90 s extended window before returning `null`. All receipt-path code in `approve.ts` was also audited and null-guards added at every `receipt.status` access to prevent `TypeError: Cannot read properties of null`.

---

## Swagger / OpenAPI Documentation Updates

All new and changed parameters are fully described in the auto-generated Swagger UI at `/docs`.

### `GET /connectors/pancakeswap/clmm/pool-info`

| Parameter | Type | Default | Min | Max | Description |
|---|---|---|---|---|---|
| `network` | string | `bsc` | — | — | EVM network (examples: `bsc`) |
| `poolAddress` | string | — | — | — | PancakeSwap V3 pool address |
| `binCount` | integer | `0` | `0` | `400` | Number of tick-aligned bins to return in `bins[]`. `0` skips the extra RPC call. |

### `GET /connectors/orca/clmm/pool-info`

| Parameter | Type | Default | Min | Max | Description |
|---|---|---|---|---|---|
| `binCount` | integer | `0` | `0` | `400` | Number of tick-aligned bins around the active tick. `0` skips the extra `getProgramAccounts` call. |

### `GET /connectors/raydium/clmm/pool-info`

| Parameter | Type | Default | Min | Max | Description |
|---|---|---|---|---|---|
| `binCount` | integer | `0` | `0` | `400` | Number of tick-aligned bins around the active tick. `0` skips the extra tick fetch. |

### `GET /connectors/uniswap/clmm/pool-info`

| Parameter | Type | Default | Min | Max | Description |
|---|---|---|---|---|---|
| `binCount` | integer | `0` | `0` | `400` | Number of tick-aligned bins around the active tick. `0` skips the extra `eth_call`. |

### `BinLiquidity` schema (shared, `src/schemas/clmm-schema.ts`)

All connectors that return `bins[]` use this schema. Fields now carry Swagger descriptions:

| Field | Description |
|---|---|
| `binId` | Tick index (Uniswap/PancakeSwap/Orca) or bin index (Meteora/Raydium) identifying this price bucket |
| `price` | Mid-price of this bin expressed as quoteToken per baseToken |
| `baseTokenAmount` | Amount of base token liquidity in this bin |
| `quoteTokenAmount` | Amount of quote token liquidity in this bin |

The `bins` field on `PoolInfoSchema` is annotated: _"Per-tick liquidity distribution around the active tick. Present only when `binCount > 0` was requested."_

---

## Changed Files

### Source

| File | Change |
|---|---|
| `src/chains/ethereum/ethereum.ts` | `handleTransactionExecution`: added 90 s extended poll after initial timeout |
| `src/chains/ethereum/routes/approve.ts` | Null-guards on `receipt.status` at every call site |
| `src/connectors/meteora/clmm-routes/quoteSwap.ts` | BUY price fix: `estimatedAmountIn / amountOut` |
| `src/connectors/orca/clmm-routes/quoteSwap.ts` | BUY price fix: reconstruct `quoteAmount / baseAmount` from side |
| `src/connectors/orca/clmm-routes/poolInfo.ts` | `binCount` → `computeOrcaBinDistribution` |
| `src/connectors/orca/orca.utils.ts` | New `computeOrcaBinDistribution` function |
| `src/connectors/orca/schemas.ts` | `binCount` field with description and 0–400 range |
| `src/connectors/pancakeswap/clmm-routes/executeSwap.ts` | Removed `@uniswap/v3-sdk` import; `sqrtPriceLimitX96: 0` |
| `src/connectors/pancakeswap/clmm-routes/poolInfo.ts` | `binCount` → `computeUniswapBinDistribution` |
| `src/connectors/pancakeswap/clmm-routes/positionsOwned.ts` | Address-order base/quote fix (`token0.address < token1.address`) |
| `src/connectors/pancakeswap/clmm-routes/quotePosition.ts` | `utils.parseUnits` precision fix; removed all `console.log` |
| `src/connectors/pancakeswap/pancakeswap.contracts.ts` | Added `pancakeswapV3MasterchefAddress` to interface and all four networks (BSC/mainnet: `0x556B9306565093C855AEA9AE92A594704c2Cd59e`, Arbitrum: `0x5e09ACf80C0296740eC5d6F643005a4ef8DaA694`, Base: `0xC6A2Db661D5a5690172d8eB0a7DEA2d3008665A3`); new `getPancakeswapV3MasterchefAddress()` helper |
| `src/connectors/pancakeswap/schemas.ts` | `binCount` field added |
| `src/connectors/raydium/clmm-routes/poolInfo.ts` | `binCount` → `computeRaydiumBinDistribution` |
| `src/connectors/raydium/raydium.utils.ts` | New `computeRaydiumBinDistribution` function |
| `src/connectors/raydium/schemas.ts` | `binCount` field with description and 0–400 range |
| `src/connectors/uniswap/clmm-routes/poolInfo.ts` | `binCount` → `computeUniswapBinDistribution` |
| `src/connectors/uniswap/uniswap.utils.ts` | `computeUniswapBinDistribution` (used by Uniswap and PancakeSwap) |
| `src/connectors/uniswap/schemas.ts` | `binCount` field with description and 0–400 range |
| `src/schemas/clmm-schema.ts` | `bins[]` optional on `PoolInfoSchema`; `BinLiquidity` field descriptions |

### Tests

| File | Tests | What is covered |
|---|---|---|
| `test/connectors/pancakeswap/clmm-routes/pool-info.test.ts` | 5 | No binCount → no bins; `binCount=0` → no bins; `binCount=10` → 10 bins; `binCount=402` → 400; pool not found → 404 |
| `test/connectors/pancakeswap/clmm-routes/execute-swap.test.ts` | 3 | SELL decimal amount no BigInt crash; BUY decimal amount no BigInt crash; raw string amounts pass through |
| `test/connectors/orca/clmm-routes/poolInfo.test.ts` | +4 (extended) | No binCount → no bins; `binCount=0` → no bins; `binCount=10` → 10 bins with correct shape; `binCount=402` → 400 |
| `test/connectors/orca/clmm-routes/quoteSwap.test.ts` | +2 (extended) | SELL price = 200 (quote/base); BUY price = 200 (same scale — regression for inversion fix); regression guard `price > 1` |
| `test/connectors/uniswap/clmm-routes/pool-info.test.ts` | +4 (extended) | No binCount → no bins; `binCount=0` → no bins; `binCount=10` → 10 bins; `binCount=402` → 400 |
| `test/connectors/raydium/clmm-routes/poolInfo.test.ts` | 6 (new file) | All standard fields present; no binCount → no bins; `binCount=0` → no bins; `binCount=8` → bins with correct shape; `binCount=402` → 400; pool not found → 404; missing `poolAddress` → 400 |
| `test/chains/ethereum/handle-transaction-execution.test.ts` | 3 (new file) | Fast path (confirms before timeout → receipt returned immediately); extended poll success (receipt on 2nd poll); extended poll exhausted (returns `null` cleanly, no `TypeError`) |

**Total: 49 tests across 7 suites. All passing.**

---

## Tests Performed

```
GATEWAY_TEST_MODE=dev npx jest --runInBand \
  test/connectors/pancakeswap/clmm-routes/ \
  test/connectors/orca/clmm-routes/poolInfo.test.ts \
  test/connectors/orca/clmm-routes/quoteSwap.test.ts \
  test/connectors/uniswap/clmm-routes/pool-info.test.ts \
  test/connectors/raydium/clmm-routes/poolInfo.test.ts \
  test/chains/ethereum/handle-transaction-execution.test.ts
```

Result: **7 suites, 49 tests, 0 failures.**

---

## QA Testing Tips

### PancakeSwap `execute-swap` (BigInt fix)

POST to `/connectors/pancakeswap/clmm/execute-swap` with a decimal amount (e.g. `amount: 10.5`). Previously crashed with `TypeError: Cannot mix BigInt and other types`. Should now return a transaction hash.

### PancakeSwap `positions-owned` (address-order fix)

Verify `baseTokenAddress` / `quoteTokenAddress` are correct for a USDT/WBNB pool on BSC (not WETH-biased). The lower-address token is `token0`; the endpoint now derives base/quote from that ordering rather than a WETH special-case.

### `binCount` across connectors

```
GET /connectors/orca/clmm/pool-info?network=mainnet-beta&poolAddress=Czfq3xZZ...&binCount=20
GET /connectors/raydium/clmm/pool-info?network=mainnet-beta&poolAddress=3ucNos4N...&binCount=20
GET /connectors/uniswap/clmm/pool-info?network=mainnet&poolAddress=0xd0b53d92...&binCount=20
GET /connectors/pancakeswap/clmm/pool-info?network=bsc&poolAddress=0x172fcd41...&binCount=20
```

Expected: `bins` array of length 20, each entry with `binId`, `price`, `baseTokenAmount`, `quoteTokenAmount`. Without `binCount` or with `binCount=0`, `bins` must be absent from the response.

Passing `binCount=402` must return HTTP 400 (schema maximum is 400, validated before handler).

### Orca / Meteora BUY price inversion

```
GET /connectors/orca/clmm/quote-swap?...&side=SELL → price ≈ 200 (SOL/USDC example)
GET /connectors/orca/clmm/quote-swap?...&side=BUY  → price ≈ 200 (must be same order of magnitude)
```

Pre-fix, the BUY result was `≈ 0.005`. Confirm both sides return a `price` value in the same numeric range.

### Ethereum extended tx polling

On a congested network (or testnet with slow block times), submit an approve transaction and observe gateway logs. You should see:

```
Transaction 0x... not confirmed within 30000ms — polling for receipt up to a further 90000ms
Transaction 0x... confirmed in block NNNN (after extended poll)
```

Previously the gateway returned `null` receipt immediately at 30 s and bots recorded the tx as failed.

### Swagger UI verification

Navigate to `http://localhost:15888/docs` (dev mode). Confirm:

- All four `pool-info` endpoints show `binCount` with min `0`, max `400`, default `0`, and description text.
- `BinLiquidity` schema in the Models section shows descriptions for all four fields.
