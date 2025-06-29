# CoinGecko Tools to Endpoints Mapping

This document shows the exact 1:1 mapping between CoinGecko MCP tools and their corresponding API endpoints.

## Summary

- **Total Tools**: 46
- **Total Endpoints**: 46
- **Mapping**: Exact 1:1 correspondence

When using Gateway MCP with CoinGecko:
- **Tool name format**: `coingecko_[endpoint_name]`
- **Endpoint name format**: `[endpoint_name]`

## Complete Mapping Table

| # | Tool Name | Endpoint Name | Category | Description |
|---|-----------|---------------|----------|-------------|
| 1 | `coingecko_get_asset_platforms` | `get_asset_platforms` | asset_platforms | Query all blockchain platforms |
| 2 | `coingecko_get_id_coins` | `get_id_coins` | coins | Get comprehensive coin metadata and market data |
| 3 | `coingecko_get_list_coins_categories` | `get_list_coins_categories` | coins.categories | List all coin categories |
| 4 | `coingecko_get_coins_list` | `get_coins_list` | coins.list | List all supported coins |
| 5 | `coingecko_get_new_coins_list` | `get_new_coins_list` | coins.list | Get 200 newest coins |
| 6 | `coingecko_get_coins_markets` | `get_coins_markets` | coins.markets | Get market data for all coins |
| 7 | `coingecko_get_coins_top_gainers_losers` | `get_coins_top_gainers_losers` | coins.top_gainers_losers | Top 30 gainers/losers |
| 8 | `coingecko_get_coins_contract` | `get_coins_contract` | coins.contract | Get coin by contract address |
| 9 | `coingecko_get_range_contract_coins_market_chart` | `get_range_contract_coins_market_chart` | coins.contract.market_chart | Historical chart by contract |
| 10 | `coingecko_get_coins_history` | `get_coins_history` | coins.history | Historical data at specific date |
| 11 | `coingecko_get_range_coins_market_chart` | `get_range_coins_market_chart` | coins.market_chart | Historical price charts |
| 12 | `coingecko_get_range_coins_ohlc` | `get_range_coins_ohlc` | coins.ohlc | OHLC candlestick data |
| 13 | `coingecko_get_global` | `get_global` | global | Global crypto market data |
| 14 | `coingecko_get_id_nfts` | `get_id_nfts` | nfts | NFT collection data |
| 15 | `coingecko_get_list_nfts` | `get_list_nfts` | nfts | List all NFT collections |
| 16 | `coingecko_get_nfts_market_chart` | `get_nfts_market_chart` | nfts.market_chart | NFT historical market data |
| 17 | `coingecko_get_onchain_categories` | `get_onchain_categories` | onchain.categories | Pool categories |
| 18 | `coingecko_get_pools_onchain_categories` | `get_pools_onchain_categories` | onchain.categories | Pools by category |
| 19 | `coingecko_get_onchain_networks` | `get_onchain_networks` | onchain.networks | Supported networks |
| 20 | `coingecko_get_networks_onchain_new_pools` | `get_networks_onchain_new_pools` | onchain.networks.new_pools | New pools (all networks) |
| 21 | `coingecko_get_network_networks_onchain_new_pools` | `get_network_networks_onchain_new_pools` | onchain.networks.new_pools | New pools (specific network) |
| 22 | `coingecko_get_networks_onchain_trending_pools` | `get_networks_onchain_trending_pools` | onchain.networks.trending_pools | Trending pools (all) |
| 23 | `coingecko_get_network_networks_onchain_trending_pools` | `get_network_networks_onchain_trending_pools` | onchain.networks.trending_pools | Trending pools (network) |
| 24 | `coingecko_get_networks_onchain_dexes` | `get_networks_onchain_dexes` | onchain.networks.dexes | DEXs on network |
| 25 | `coingecko_get_pools_networks_onchain_dexes` | `get_pools_networks_onchain_dexes` | onchain.networks.dexes | DEX pools |
| 26 | `coingecko_get_networks_onchain_pools` | `get_networks_onchain_pools` | onchain.networks.pools | Top pools on network |
| 27 | `coingecko_get_address_networks_onchain_pools` | `get_address_networks_onchain_pools` | onchain.networks.pools | Specific pool data |
| 28 | `coingecko_get_pools_networks_onchain_info` | `get_pools_networks_onchain_info` | onchain.networks.pools.info | Pool metadata |
| 29 | `coingecko_get_timeframe_pools_networks_onchain_ohlcv` | `get_timeframe_pools_networks_onchain_ohlcv` | onchain.networks.pools.ohlcv | Pool OHLCV charts |
| 30 | `coingecko_get_pools_networks_onchain_trades` | `get_pools_networks_onchain_trades` | onchain.networks.pools.trades | Pool trades |
| 31 | `coingecko_get_address_networks_onchain_tokens` | `get_address_networks_onchain_tokens` | onchain.networks.tokens | Token data by address |
| 32 | `coingecko_get_tokens_networks_onchain_info` | `get_tokens_networks_onchain_info` | onchain.networks.tokens.info | Token metadata |
| 33 | `coingecko_get_tokens_networks_onchain_top_holders` | `get_tokens_networks_onchain_top_holders` | onchain.networks.tokens.top_holders | Top token holders |
| 34 | `coingecko_get_tokens_networks_onchain_holders_chart` | `get_tokens_networks_onchain_holders_chart` | onchain.networks.tokens.holders_chart | Holders history |
| 35 | `coingecko_get_timeframe_tokens_networks_onchain_ohlcv` | `get_timeframe_tokens_networks_onchain_ohlcv` | onchain.networks.tokens.ohlcv | Token OHLCV |
| 36 | `coingecko_get_tokens_networks_onchain_pools` | `get_tokens_networks_onchain_pools` | onchain.networks.tokens.pools | Pools for token |
| 37 | `coingecko_get_tokens_networks_onchain_trades` | `get_tokens_networks_onchain_trades` | onchain.networks.tokens.trades | Token trades |
| 38 | `coingecko_get_pools_onchain_megafilter` | `get_pools_onchain_megafilter` | onchain.pools.megafilter | Advanced pool filter |
| 39 | `coingecko_get_pools_onchain_trending_search` | `get_pools_onchain_trending_search` | onchain.pools.trending_search | Trending pool searches |
| 40 | `coingecko_get_search_onchain_pools` | `get_search_onchain_pools` | onchain.search.pools | Search pools |
| 41 | `coingecko_get_addresses_networks_simple_onchain_token_price` | `get_addresses_networks_simple_onchain_token_price` | onchain.simple.networks.token_price | Token price |
| 42 | `coingecko_get_search` | `get_search` | search | Search coins/markets |
| 43 | `coingecko_get_search_trending` | `get_search_trending` | search.trending | Trending searches |
| 44 | `coingecko_get_simple_price` | `get_simple_price` | simple.price | Simple price query |
| 45 | `coingecko_get_simple_supported_vs_currencies` | `get_simple_supported_vs_currencies` | simple.supported_vs_currencies | Supported currencies |
| 46 | `coingecko_get_id_simple_token_price` | `get_id_simple_token_price` | simple.token_price | Token price by contract |

## Category Breakdown

| Category | Count | Percentage |
|----------|-------|------------|
| On-chain/GeckoTerminal | 25 | 54.3% |
| Coins & Market Data | 11 | 23.9% |
| NFTs | 3 | 6.5% |
| Simple Price | 3 | 6.5% |
| Search | 2 | 4.3% |
| Asset Platforms | 1 | 2.2% |
| Global | 1 | 2.2% |

## Usage Examples

### Direct Tool Usage (All Tools Mode)
```javascript
// Use the tool directly
coingecko_get_simple_price({
  ids: "bitcoin,ethereum",
  vs_currencies: "usd"
})
```

### Dynamic Tool Usage (Dynamic Mode)
```javascript
// Same functionality via dynamic tool
coingecko_invoke_api_endpoint({
  endpoint_name: "get_simple_price",
  args: {
    ids: "bitcoin,ethereum",
    vs_currencies: "usd"
  }
})
```

## Notes

1. **Tool Naming Convention**: All tools follow the pattern `coingecko_[endpoint_name]`
2. **Resource Path**: The endpoint's resource path (e.g., `simple.price`) indicates the API structure
3. **No Missing Tools**: Every endpoint has a corresponding tool and vice versa
4. **GeckoTerminal Focus**: Over 50% of tools are for on-chain/DEX data via GeckoTerminal
5. **API Key Required**: Most endpoints require a CoinGecko API key for access