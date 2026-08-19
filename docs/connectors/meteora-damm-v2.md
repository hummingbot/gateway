# Meteora DAMM v2 (AMM) Connector

DAMM v2 is Meteora's constant-product AMM, implemented by the on-chain **cp-amm** program
(`cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`) and driven by the
[`@meteora-ag/cp-amm-sdk`](https://docs.meteora.ag/developer-guides/damm-v2/typescript-sdk/getting-started).

Gateway exposes it through the unified AMM interface at `/trading/amm/*` with
`connector=meteora`, the same routes that serve every other AMM connector:

| Endpoint | Method | Notes |
|---|---|---|
| `/trading/amm/pool-info` | GET | Pool reserves, price, base (cliff) fee % |
| `/trading/amm/position-info` | GET | Wallet's aggregate liquidity in a pool + per-position `positions[]` breakdown |
| `/trading/amm/positions-owned` | GET | All of the wallet's DAMM v2 positions across pools |
| `/trading/amm/quote-swap` | GET | Exact-in (SELL) / exact-out (BUY) quote |
| `/trading/amm/execute-swap` | POST | Swap |
| `/trading/amm/quote-liquidity` | GET | Two-sided deposit quote |
| `/trading/amm/open` | POST | Open a new position (NFT) and seed it with liquidity |
| `/trading/amm/add` | POST | Add to a specific position (`positionAddress`) or open a new one |
| `/trading/amm/remove` | POST | Remove a % from a specific position (`positionAddress` **required**) |
| `/trading/amm/close` | POST | Withdraw everything and close the position, refunding its rent |
| `/trading/amm/create-pool` | POST | Create + seed a new pool |

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

Because positions are individually addressable and can differ arbitrarily in size, lock state, and
accrued fees, the AMM routes are **position-addressed** (mirroring the CLMM interface) rather than
silently defaulting to the largest position:

- **`position-info`** — there is no LP token balance to report, so the top-level amounts are the
  **aggregate** summed across all of the wallet's positions in the pool (via `getWithdrawQuote` on
  each), and `positions[]` breaks that out **per NFT** (`positionAddress`, `lpTokenAmount`, base/quote
  amounts). `lpTokenAmount` is the Q64 liquidity value converted to a decimal — clearly *not* an SPL
  token balance. `positions[]` is the discovery mechanism: read it to get the addresses to pass to
  add/remove.
- **`positions-owned`** — lists **all** of the wallet's DAMM v2 positions across every pool
  (`getPositionsByUser`, grouped by pool), each entry being that pool's `position-info`. Use it to
  discover holdings without enumerating pool addresses.
- **`remove-liquidity`** — requires a **`positionAddress`** and removes the requested percentage of
  *that position's* unlocked liquidity (100% removes the exact unlocked amount). Requiring the
  address avoids silently draining only the largest position when several exist — so "remove 100%"
  means what the caller expects. The lookup goes through the owner-filtered `getUserPositions`, which
  also proves the wallet owns the position and that it belongs to the pool.
- **`add-liquidity`** — if a **`positionAddress`** is given, liquidity is added to that specific
  position; if omitted, a **new** position NFT is minted (`createPositionAndAddLiquidity`) — we never
  silently pick an existing one. Minting requires the NFT mint keypair to co-sign; Gateway's Solana
  send path already supports ephemeral extra signers, so the keypair is generated in the route and
  passed through.

The unified `/trading/amm/*` routes carry the same `positionAddress` field (required for meteora on
remove, optional on add) and expose `positions-owned`; fungible-LP AMMs (Raydium CPMM, Uniswap V2,
Pancakeswap V2) ignore `positionAddress` and reject `positions-owned` with a clear error, since a
fungible LP balance has no enumerable positions.

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

- **`create-pool`** therefore **requires an explicit `configAddress`**. Token order is base →
  token A, quote → token B. The new pool address is derived deterministically
  (`derivePoolAddress(config, tokenAMint, tokenBMint)`) and returned along with the seed `price`.
- Discover configs with the SDK (`cpAmm.getAllConfigs()` / `getStaticConfigs()`) or the Meteora
  app, and pass one whose fee/`collectFeeMode` you want.

#### Initial price: seed on-market to avoid getting sniped
A new pool's price is set by its seed ratio. If you open it **off-market**, arbitrage/MEV bots
rebalance it to the true price within the same slot — you effectively subsidise them. `create-pool`
resolves the seed price in this priority order:

1. **`initialPrice`** (quote per base) if provided — `quoteTokenAmount = baseTokenAmount × initialPrice`.
2. **`quoteTokenAmount`** if provided — the `baseTokenAmount : quoteTokenAmount` ratio sets the price.
3. **Otherwise, the current market price is fetched** from the unified swap router
   (`/trading/router/quote-swap`, i.e. the network's configured `swapProvider` — Jupiter on Solana, which
   aggregates existing venues) via a SELL quote of a small probe (1% of `baseTokenAmount`), and the
   pool is seeded there. The probe is kept small so the quote approximates the marginal market
   price; quoting the full seed amount would bake its own price impact into the seed price and
   open the pool below market.

Only `baseTokenAmount` is required; the quote side is derived. If the base token has **no existing
market** (nothing for the router to price against), the fetch fails with a clear error asking you to
pass `initialPrice` or `quoteTokenAmount` — Gateway never guesses a price. The seed price used is
returned as `price` in the response.

  **Proposed enhancement:** a safe config auto-select that decodes each static config's base fee,
  keeps only **static-fee** configs (fee scheduler `numberOfPeriod === 0`) with
  `collectFeeMode = BothToken`, and picks the one matching a requested `feePct` (or the lowest). This
  needs per-config fee decoding (`fetchPoolFees` / the pod-aligned fee decoders) and is left out of
  the basics.

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
