# Cross-venue pool normalisation: two traps

**Context:** ranking concentrated-liquidity pools from Meteora DLMM, Orca Whirlpools and
Raydium CLMM together, each read from the venue's own API. Nothing in Gateway normalises
across venues today, so neither of these is a bug report — they are the two things that
bite first when something does, and both are easy to mistake for "that venue has no good
pools."

---

## 1. Base and quote ordering is the venue's, and it decides which amount field is which

Gateway resolves `baseToken` and `quoteToken` **in the venue's own order**. It does not
impose a house convention, and the venues do not agree on one:

| Venue | Where SOL usually sits |
|---|---|
| Meteora DLMM | quote side |
| Orca Whirlpools | base side |
| Raydium CLMM | base side |

The temptation, when ranking or listing pools from several venues at once, is to require a
single orientation so the rows are comparable — "SOL is always the quote" — and drop what
does not match. Measured across ~250 SOL pools, that is not a small filter:

| | requiring one convention | matching either side |
|---|---|---|
| Orca | 1 | 14 |
| Raydium | 4 | 8 |

**This is not only a display concern.** Because base and quote resolve in the venue's
order, the orientation decides which request field an amount goes in. A caller that always
puts its SOL budget in `quoteTokenAmount` sends it to the wrong token on a pool whose SOL is
the base. The deposit is still expressible — the SOL amount goes in `baseTokenAmount`
instead — but only if the caller maps its amount to the pool's orientation.

So the useful shape is:

- **Rank on either orientation**, so a venue is not silently emptied by a convention it
  never agreed to.
- **Map amounts to each pool's own base and quote** when filling, rather than assuming one
  side.

If a future `fetch-pools` or `pool-info` normalisation imposes one convention across
venues, this is the failure it will produce: most of Orca's and Raydium's SOL pools
disappear, and the result looks indistinguishable from those venues having nothing worth
ranking. Nothing errors.

## 2. Orca publishes no pool age

Orca's API returns `tradeEnableTimestamp` as the **unix epoch on every pool** — not a
missing field, not null, but a valid-looking timestamp of 1970-01-01 that arithmetic
happily accepts.

Every Orca pool therefore looks decades old. A "pool must be older than N days" filter,
meant to screen out new pools, lets **all of Orca** through, new pools included. A "pool
must be newer than N days" filter excludes all of Orca, and the output is indistinguishable
from Orca having no qualifying pools. Neither result says that the age was unknown.

Where age matters, treat Orca as *age unknown* and decide explicitly — exempt it, or
exclude it with a stated reason. Do not let an epoch timestamp be compared as if it were
data.

---

## Why this lives in Gateway's docs

Both traps are about Gateway's model rather than any caller's. The ordering one is
Gateway's base/quote resolution showing through to whoever aggregates across venues; the
age one is the kind of per-venue field gap a unified `fetch-pools` would have to decide
about. Written down here so the next person building cross-venue ranking, a unified pool
list, or a venue-agnostic quote finds them before rediscovering them.

A related caution about yield: the venues' own yield fields are not the same quantity.
Meteora's `apr` is a daily percent, Raydium's `day.feeApr` is annualised, and Orca publishes
`yieldOverTvl`. Where Gateway passes these through — `apr` in the Meteora and Orca
`fetch-pools` results, `yieldOverTvl` in Orca's `pool-info` — it reports each venue's figure
as the venue does, without normalising it. Sorting on them directly compares different
quantities and calls the largest best; anything ranking on yield owns the normalisation.
