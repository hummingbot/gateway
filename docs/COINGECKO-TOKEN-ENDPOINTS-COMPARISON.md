# CoinGecko Token Endpoints Comparison for MORI

This document compares the data returned by different CoinGecko token endpoints for MORI (8ZHE4ow1a2jjxuoMfyExuNamQNALv5ekZhsBn5nMDf5e).

## Summary of Endpoints Tested

| Endpoint | Status | Access Level | Description |
|----------|---------|--------------|-------------|
| `get_address_networks_onchain_tokens` | ✅ Works | Demo/Free | Basic token data with top pools |
| `get_tokens_networks_onchain_info` | ❌ 404 Error | N/A | Token metadata not available |
| `get_tokens_networks_onchain_top_holders` | ❌ 401 Error | Analyst+ Plan | Requires paid subscription |
| `get_tokens_networks_onchain_holders_chart` | ❌ 401 Error | Analyst+ Plan | Requires paid subscription |
| `get_id_coins` | ✅ Works | Demo/Free | Comprehensive coin data |
| `get_simple_price` | ✅ Works | Demo/Free | Simple price data |

## Working Endpoints Data Comparison

### 1. `get_address_networks_onchain_tokens` (On-chain Token Data)

**Purpose**: Get token data by contract address on a specific network

**Data Returned**:
```json
{
  "address": "8ZHE4ow1a2jjxuoMfyExuNamQNALv5ekZhsBn5nMDf5e",
  "name": "MORI COIN",
  "symbol": "MORI",
  "decimals": 9,
  "image_url": "https://coin-images.coingecko.com/coins/images/66886/large/...",
  "coingecko_coin_id": "mori-coin",
  "total_supply": "999999872971128098.0",
  "normalized_total_supply": "999999872.971128",
  "price_usd": "0.02580781089",
  "fdv_usd": "25807807.615266",
  "total_reserve_in_usd": "591821.2121387322545435967",
  "volume_usd": {
    "h24": "4920559.14836859"
  },
  "market_cap_usd": null,
  "top_pools": [
    "solana_9nxAnMD7K78a9RMd2L3w8kQT5u9i7gsvV5aHiZ78sCC2",
    "solana_9TyjpguP6tZzDAYGFj6nu7Nc48FnC6cbECfYhM4onHvC",
    "solana_5BWcVqpdQ3W8aSAFgiV87BqXFsbVKNZsqQ2rxfx2vWLK"
  ]
}
```

**Key Features**:
- Basic token information (name, symbol, decimals)
- Current price and FDV
- Total liquidity across all pools
- Top 3 pools by liquidity
- 24h volume
- Links to CoinGecko coin ID for more data

### 2. `get_id_coins` (Comprehensive Coin Data)

**Purpose**: Get all metadata and market data for a coin

**Data Returned** (abbreviated):
```json
{
  "id": "mori-coin",
  "symbol": "mori",
  "name": "MORI COIN",
  "platforms": {
    "solana": "8ZHE4ow1a2jjxuoMfyExuNamQNALv5ekZhsBn5nMDf5e"
  },
  "market_data": {
    "current_price": {
      "usd": 0.02583526,
      // ... 60+ currencies
    },
    "ath": {
      "usd": 0.03133174,
      // ... with dates
    },
    "atl": {
      "usd": 0.02243492,
      // ... with dates
    },
    "price_change_24h": -0.00262592946861141,
    "price_change_percentage_24h": -9.22635,
    "total_volume": {
      "usd": 4935681,
      // ... 60+ currencies
    },
    "market_cap": null,
    "fully_diluted_valuation": {
      "usd": 26126820
    },
    "total_supply": 999999872.9711281,
    "max_supply": 1000000000,
    "circulating_supply": 0
  },
  "tickers": [
    // 7 DEX tickers with detailed trading data
  ],
  "community_data": {
    "telegram_channel_user_count": 83110
  },
  "links": {
    "homepage": ["https://morico.in/"],
    "blockchain_site": ["https://solscan.io/token/..."],
    "twitter_screen_name": "MoriCoinCrypto",
    "telegram_channel_identifier": "moricoin_official"
  }
}
```

**Key Features**:
- Prices in 60+ currencies
- All-time high/low with dates and percentages
- Price changes across multiple timeframes
- Detailed ticker data from all DEXs
- Social links and community data
- Supply information
- Sentiment data

### 3. `get_simple_price` (Quick Price Check)

**Purpose**: Get current price with optional market data

**Data Returned**:
```json
{
  "mori-coin": {
    "usd": 0.02583526,
    "usd_market_cap": 0,
    "usd_24h_vol": 4935681.237778088,
    "usd_24h_change": -9.2263504729003
  }
}
```

**Key Features**:
- Current price
- Market cap (0 due to no circulating supply data)
- 24h volume
- 24h price change percentage

## Data Richness Comparison

| Data Point | On-chain Token | Coin Data | Simple Price |
|------------|----------------|-----------|--------------|
| **Basic Info** |
| Token Address | ✅ | ✅ | ❌ |
| Name/Symbol | ✅ | ✅ | ❌ |
| Decimals | ✅ | ❌ | ❌ |
| **Pricing** |
| Current Price USD | ✅ | ✅ | ✅ |
| Multi-currency Prices | ❌ | ✅ (60+) | ✅ (configurable) |
| Price Changes | ❌ | ✅ (multiple timeframes) | ✅ (24h only) |
| ATH/ATL | ❌ | ✅ | ❌ |
| **Market Data** |
| Market Cap | ✅ (null) | ✅ | ✅ |
| FDV | ✅ | ✅ | ❌ |
| Volume 24h | ✅ | ✅ | ✅ |
| **Supply** |
| Total Supply | ✅ | ✅ | ❌ |
| Max Supply | ❌ | ✅ | ❌ |
| Circulating Supply | ❌ | ✅ | ❌ |
| **DEX/Pool Data** |
| Top Pools | ✅ (3) | ❌ | ❌ |
| Pool Liquidity | ✅ (total) | ❌ | ❌ |
| DEX Tickers | ❌ | ✅ (all) | ❌ |
| **Social/Links** |
| Website/Social | ❌ | ✅ | ❌ |
| Community Stats | ❌ | ✅ | ❌ |
| **Response Size** | Small | Very Large | Minimal |

## Access Requirements

### Free/Demo API Key Access:
1. `get_address_networks_onchain_tokens` - Basic on-chain token data
2. `get_id_coins` - Comprehensive coin data
3. `get_simple_price` - Quick price checks

### Analyst+ Plan Required:
1. `get_tokens_networks_onchain_top_holders` - Top token holders
2. `get_tokens_networks_onchain_holders_chart` - Historical holder data
3. Other advanced on-chain analytics

### Not Available (404 Errors):
1. `get_tokens_networks_onchain_info` - Token metadata endpoint

## Use Case Recommendations

### For Basic Token Information:
- Use `get_address_networks_onchain_tokens` when you have the contract address
- Provides essential data with minimal response size
- Includes top pools for liquidity analysis

### For Comprehensive Analysis:
- Use `get_id_coins` when you need full market data
- Best for detailed price analysis, historical data, and DEX activity
- Requires knowing the CoinGecko coin ID

### For Quick Price Checks:
- Use `get_simple_price` for current prices
- Supports batch requests for multiple tokens
- Minimal data transfer

### For Advanced Analytics (Paid):
- Holder distribution requires Analyst+ subscription
- Historical holder trends require Analyst+ subscription
- Most on-chain analytics beyond basic data require paid plans

## Key Findings

1. **Data Availability Varies**: Not all endpoints work for all tokens
2. **Paid Features**: Advanced on-chain analytics (holders, detailed info) require paid subscriptions
3. **Multiple Data Sources**: Same information available through different endpoints with varying detail levels
4. **Endpoint Selection**: Choose based on:
   - Data needs (basic vs comprehensive)
   - Response size constraints
   - API tier access
   - Whether you have contract address or coin ID

## Conclusion

For MORI token data:
- **Free tier** provides sufficient data for most use cases through 3 working endpoints
- **On-chain token endpoint** best for contract-based lookups with pool information
- **Coin data endpoint** best for comprehensive market analysis
- **Simple price endpoint** best for lightweight price queries
- **Advanced features** (holder analytics) require paid Analyst+ subscription