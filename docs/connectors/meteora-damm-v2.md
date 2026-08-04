# Meteora DAMM v2 (AMM) Connector

DAMM v2 is Meteora's constant-product AMM, implemented by the on-chain **cp-amm** program
(`cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`) and driven by the
[`@meteora-ag/cp-amm-sdk`](https://docs.meteora.ag/developer-guides/damm-v2/typescript-sdk/getting-started).

Gateway exposes it under the standard AMM interface at `/connectors/meteora/amm/*`, mirroring
the Raydium AMM connector:

| Endpoint | Method | Notes |
|---|---|---|
| `/connectors/meteora/amm/pool-info` | GET | Pool reserves, price, base (cliff) fee % |
| `/connectors/meteora/amm/position-info` | GET | Wallet's aggregated liquidity in a pool |
| `/connectors/meteora/amm/quote-swap` | GET | Exact-in (SELL) / exact-out (BUY) quote |
| `/connectors/meteora/amm/execute-swap` | POST | Swap |
| `/connectors/meteora/amm/quote-liquidity` | GET | Two-sided deposit quote |
| `/connectors/meteora/amm/add-liquidity` | POST | Add to (or open) a position |
| `/connectors/meteora/amm/remove-liquidity` | POST | Remove a % of position liquidity |
| `/connectors/meteora/amm/create-pool` | POST | Create + seed a new pool |

The implementation deliberately keeps to "the basics" so it fits the shared AMM schema. This
document records where DAMM v2 differs from a classic fungible-LP AMM (e.g. Raydium AMM/CPMM),
how each difference is currently mapped onto the AMM interface, and what a fuller treatment
would look like.

---

## Custom features of DAMM v2 and how they are handled

### 1. Positions are NFTs, not fungible LP tokens
A classic AMM mints a fungible LP token; your position is just your LP balance, and there is
exactly one position per (wallet, pool). DAMM v2 instead mints a **position NFT** per position,
and a wallet can hold **several positions in the same pool**. Liquidity, fees, and vesting all
live on the position account (`PositionState`), keyed by the NFT.

- **`add-liquidity`** — if the wallet already holds a position in the pool, liquidity is added to
  its **largest** position; otherwise a new position NFT is minted
  (`createPositionAndAddLiquidity`). Minting requires the NFT mint keypair to co-sign; Gateway's
  Solana send path already supports ephemeral extra signers, so the keypair is generated in the
  route and passed through.
- **`remove-liquidity`** — operates on the wallet's **largest** position and removes the requested
  percentage of its *unlocked* liquidity (100% removes the exact unlocked amount).
- **`position-info`** — there is no LP token balance to report, so amounts are **summed across all
  of the wallet's positions** in the pool (via `getWithdrawQuote` on each). `lpTokenAmount` is
  reported as the aggregate position liquidity (the Q64 liquidity value converted to a decimal),
  clearly *not* an SPL token balance.

  **Proposed enhancement:** add position-addressed routes (`positions-owned`, and
  `position`/`add`/`remove` that take a `positionAddress`), mirroring the CLMM interface, so callers
  can manage multiple positions per pool precisely instead of always defaulting to the largest.

### 2. sqrt-price / concentrated-liquidity accounting
DAMM v2 uses Uniswap-v3-style `sqrtPrice` (Q64) math with `sqrtMinPrice`/`sqrtMaxPrice` bounds,
even though the permissionless pools Gateway creates are **full-range** (min = `MIN_SQRT_PRICE`,
max = `MAX_SQRT_PRICE`), which reproduces constant-product behaviour. All conversions go through the
SDK helpers (`getPriceFromSqrtPrice`, `getDepositQuote`, `getWithdrawQuote`, `getQuote2`,
`getLiquidityDelta`) rather than reimplementing the math. `price` in `pool-info` is quote-per-base
(token B per token A).

### 3. Pool creation is config-driven, and configs can carry very high launch fees
A pool is created against a **config account** that fixes the fee schedule, `collectFeeMode`, and
price bounds. There are hundreds of permissionless static configs, and **many are token-launch
configs whose base fee starts at ~99% and decays** (fee schedulers/rate limiters). Auto-selecting
one blindly could create a pool with a punitive fee.

- **`create-pool`** therefore **requires an explicit `configAddress`**. The deposit ratio
  (`baseTokenAmount : quoteTokenAmount`) sets the initial price via
  `preparePoolCreationParams`; liquidity spans the full range. Token order is base → token A,
  quote → token B. The new pool address is derived deterministically
  (`derivePoolAddress(config, tokenAMint, tokenBMint)`) and returned.
- Discover configs with the SDK (`cpAmm.getAllConfigs()` / `getStaticConfigs()`) or the Meteora
  app, and pass one whose fee/`collectFeeMode` you want.

  **Proposed enhancement:** a safe auto-select that decodes each static config's base fee, keeps
  only **static-fee** configs (fee scheduler `numberOfPeriod === 0`) with `collectFeeMode = BothToken`,
  and picks the one matching a requested `feePct` (or the lowest). This needs per-config fee decoding
  (`fetchPoolFees` / the pod-aligned fee decoders) and is intentionally left out of the basics.

### 4. Fee model: base (cliff) fee + optional dynamic fee
The fee reported by `pool-info` is the pool's **base (cliff) fee** (`fetchPoolFees(...).cliffFeeNumerator`
→ bps → %). Pools may additionally run a **dynamic fee** and/or a **fee scheduler** that make the
effective fee vary with volatility or time, so the reported number is the representative base fee,
not necessarily the fee charged on a given swap. Swap quotes/executions always use the SDK's
`getQuote2`, which accounts for the live fee at the current slot/timestamp.

### 5. Activation clock (slot vs timestamp)
Each pool activates on either a **slot** or a **unix timestamp** (`activationType`). Remove-liquidity
and vesting math need the matching "current point", so the connector reads the current slot and
block time and picks the right one per pool.

### 6. Token-2022 support
Both sides of a pool may be Token or Token-2022 mints. The connector resolves each side's token
program from the pool's `tokenAFlag`/`tokenBFlag` (existing pools) or from the mint account owner
(pool creation), and passes it to every instruction. Transfer-fee extensions are handled by the
SDK's quote helpers.

### 7. Locks, vesting, permanent locks, rewards, split/merge
DAMM v2 positions can be time-locked, permanently locked, vested, and can accrue farming rewards;
positions can also be split or merged. **None of these are exposed** in this basic connector.
`remove-liquidity` only ever touches **unlocked** liquidity, and `remove-liquidity`/`position-info`
pass the position's vesting accounts to the SDK so locked liquidity is respected.

  **Proposed enhancement:** dedicated routes for `lock-position`, `claim-fees`, `claim-reward`, and
  `collect-fees`, plus surfacing locked/vested amounts in `position-info`.

---

## Not covered (basics scope)

- Multiple-position management per pool (add/remove always target the largest position).
- `createCustomPool` (arbitrary fee params without a preexisting config).
- Fee claiming, rewards, locking/vesting, and split/merge operations.
- Automatic config selection for `create-pool`.

These are the natural follow-ups; each is called out above next to the feature it belongs to.
