# OKX DEX Aggregator Router Connector

The [OKX DEX aggregator](https://web3.okx.com/dex-swap) (part of OKX OnchainOS) routes swaps
across Solana DEX liquidity. Like every router connector it is reached through the unified
trading routes, naming `okx` as the `connector`:

- `GET  /trading/router/quote-swap`
- `POST /trading/router/execute-quote`
- `POST /trading/router/execute-swap`

Network support: `mainnet-beta` only (OKX `chainIndex` 501).

## Getting API credentials

OKX requires **three credentials** — an API key, a secret key, and a passphrase — used to
HMAC-sign every request. Creating them is self-serve and free; only email and phone
verification are needed to start.

1. Create an OKX account and sign in to the developer portal:
   https://web3.okx.com/build/dev-portal
2. Verify email and phone. That alone puts the account on the **Trial** tier.
3. Create a **project** (up to three projects per account).
4. In the project, open the **API keys** page and click **Create API key** (up to three keys
   per project). Enter a name and choose a **passphrase**.
5. Save all three values — the **API key**, the system-generated **secret key** (shown only
   at creation), and your **passphrase**. OKX cannot recover the passphrase; without it the
   key is unusable.
6. Add them to `conf/connectors/okx.yml`:

```yaml
apiKey: 'your-okx-api-key'
secretKey: 'your-okx-secret-key'
passphrase: 'your-okx-passphrase'
```

The connector fails fast with a clear error if any of the three is missing. Treat them as
credentials: keep them out of version control (`conf/` is gitignored) and rotate them if
exposed.

### What a Trial key can actually do

The trial is **60 days at 1 request/second**, raisable to 5 RPS on review. That ceiling,
not the expiry, is what usually bites: a bot sweeping quotes across several connectors
exceeds 1 RPS on its own. Continuing past 60 days means completing KYC in the developer
portal to reach the **Start-up** tier, which is where usable rate limits are. Start-up has
no per-call charge, but partners who take a fee on swaps enter a revenue-share where OKX
retains 20% of it.

Worth knowing before spending time on a 401: OKX's own client library sends a fifth header,
`OK-ACCESS-PROJECT`, carrying the project ID. This connector does not, and has no config
field for one — that library targets the v5 API, while this connector calls v6, whose quote
reference lists only the four headers below. If signed requests are rejected once
credentials are populated, add the project ID before investigating anything else.

## How requests are signed

Every request sends the headers `OK-ACCESS-KEY`, `OK-ACCESS-PASSPHRASE`,
`OK-ACCESS-TIMESTAMP` (ISO 8601), and `OK-ACCESS-SIGN`, where the signature is:

```
base64(HMAC-SHA256(timestamp + method + requestPathWithQuery, secretKey))
```

The connector serializes the query string itself so the signed string is byte-identical to
the request path (see `okx.ts:signedHeaders`).

## Configuration (`conf/connectors/okx.yml`)

| Field | Description |
|---|---|
| `slippagePct` | Default slippage percentage for swaps (e.g., `1` = 1%) |
| `apiKey` / `secretKey` / `passphrase` | OKX developer portal credentials (all required) |
| `computeUnitPrice` | Solana priority fee in micro-lamports; `0` = let OKX choose |

## Behavior notes

- **Flow:** `quote-swap` calls the wallet-free `GET /api/v6/dex/aggregator/quote` and caches
  the request parameters under a `quoteId`. Because OKX's executable transaction is
  wallet-bound, `execute-quote` re-fetches `GET /api/v6/dex/aggregator/swap` with the
  executing wallet (fresh route at execution, bounded by `slippagePercent`), then sends the
  returned transaction unsigned through Gateway's wallet-aware signer.
- **BUY orders:** served natively with `swapMode=exactOut` where OKX supports it; otherwise,
  with `approximateIfNoExactOut` true (default), the input is approximated from a sell-leg
  exactIn quote and the response is flagged `approximation: true`.

## References

- DEX API reference: https://web3.okx.com/onchainos/dev-docs/trade/dex-api-reference
- Developer portal guide: https://web3.okx.com/onchainos/dev-docs/home/developer-portal
- Authentication: https://web3.okx.com/onchainos/dev-docs/home/api-access-and-usage
- Tiers and fees: https://web3.okx.com/build/dev-docs/dex-api/dex-api-fee
- Quote endpoint: https://web3.okx.com/build/dev-docs/wallet-api/dex-get-quote
- Swap endpoint: https://web3.okx.com/build/dev-docs/wallet-api/dex-swap
