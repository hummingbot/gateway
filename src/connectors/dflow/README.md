# DFlow Router Connector

[DFlow](https://dflow.net) is a low-latency DEX aggregator built for Solana. Like every
router connector it is reached through the unified trading routes, naming `dflow` as the
`connector`:

- `GET  /trading/router/quote-swap`
- `POST /trading/router/execute-quote`
- `POST /trading/router/execute-swap`

Network support: `mainnet-beta` only.

## Getting API credentials

DFlow authenticates with a single API key sent via the `x-api-key` header.

**Development (no key required):** without an API key configured, this connector uses the
public dev endpoint `https://dev-quote-api.dflow.net`. It is rate-limited and not suitable
for production or bot trading.

**Production:**

1. Go to the API key page: https://pond.dflow.net/build/api-key
2. Fill out the application form (or contact `hello@dflow.net` directly).
3. DFlow typically responds within 2–5 days with an API key that has higher rate limits.
4. Add the key to `conf/connectors/dflow.yml`:

```yaml
apiKey: 'your-dflow-api-key'
```

With a key configured, the connector switches to the production endpoint
`https://quote-api.dflow.net`.

Treat the key as a credential: keep it out of version control (`conf/` is gitignored) and
rotate it if it is ever exposed.

## Configuration (`conf/connectors/dflow.yml`)

| Field | Description |
|---|---|
| `slippagePct` | Default slippage percentage for swaps (e.g., `1` = 1%) |
| `apiKey` | DFlow API key; empty = keyless dev endpoint |
| `computeUnitPriceMicroLamports` | Priority fee in micro-lamports; `0` = let DFlow choose (`prioritizationFeeLamports: auto`) |
| `dynamicComputeUnitLimit` | Let DFlow simulate to set the compute unit limit |

## Behavior notes

- **Flow:** `quote-swap` calls DFlow's `GET /quote` and caches the quote response under a
  `quoteId`; `execute-quote` posts it to `POST /swap` with the executing wallet, receives a
  base64 transaction, and sends it unsigned through Gateway's wallet-aware signer (local
  keypair or Ledger).
- **BUY orders:** DFlow is ExactIn-only (the API silently ignores a `swapMode` parameter and
  quotes ExactIn — verified against the live API). With `approximateIfNoExactOut` true
  (default), the required input is approximated from a sell-leg ExactIn quote and the
  response is flagged `approximation: true` (the base amount received is an estimate, not
  exact); with it false, BUY requests fail with a clear error.

## References

- Trading API introduction: https://pond.dflow.net/resources/trading-api/introduction
- Quote endpoint reference: https://pond.dflow.net/resources/trading-api/imperative/quote
- Swap endpoint reference: https://pond.dflow.net/resources/trading-api/imperative/swap
- API key guide: https://pond.dflow.net/build/recipes/api-keys
