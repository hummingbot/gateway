# CoinGecko Pool Endpoints Comparison

## Test Summary

This document compares CoinGecko pool-related endpoints for two Solana pools:
1. **MORI/SOL pool**: `9nxAnMD7K78a9RMd2L3w8kQT5u9i7gsvV5aHiZ78sCC2` (Raydium CPMM)
2. **SOL/USDC pool**: `3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv` (Raydium CLMM)

## Pool Characteristics

| Pool | MORI/SOL | SOL/USDC |
|------|----------|----------|
| **DEX** | Raydium | Raydium |
| **Type** | CPMM | CLMM |
| **Created** | June 25, 2025 | Aug 7, 2024 |
| **Liquidity** | ~$1.15M | ~$9.68M |
| **24h Volume** | ~$4.5M | ~$30.9M |
| **24h Txns** | ~10K | ~24.6K |
| **Fee** | 0% (CPMM) | Variable (CLMM) |

## Endpoint Test Results

### 1. get_address_networks_onchain_pools
**Status**: ✅ Working (Free)
**Description**: Query specific pool by network and address

**Data Returned**:
- Basic pool information (name, addresses, created date)
- Current prices (USD and native currency)
- Price change percentages (5m, 15m, 30m, 1h, 6h, 24h)
- Transaction counts and volume breakdown by time period
- Buy/sell volume breakdown (when `include_volume_breakdown=true`)
- Reserve amounts in USD
- Token relationships with metadata

**MORI/SOL Pool Response**:
```json
{
  "data": {
    "id": "solana_9nxAnMD7K78a9RMd2L3w8kQT5u9i7gsvV5aHiZ78sCC2",
    "type": "pool",
    "attributes": {
      "base_token_price_usd": "0.0261286",
      "base_token_price_native_currency": "0.000184714889053616",
      "quote_token_price_usd": "142.202418996950362",
      "base_token_price_quote_token": "0.0001847148891",
      "quote_token_price_base_token": "5413.748751514",
      "address": "9nxAnMD7K78a9RMd2L3w8kQT5u9i7gsvV5aHiZ78sCC2",
      "name": "MORI / SOL",
      "pool_created_at": "2025-06-25T14:57:18Z",
      "fdv_usd": "26,128,621.56",
      "market_cap_usd": null,
      "reserve_in_usd": "1,161,349.20",
      "price_change_percentage": {
        "m5": "0.23", "m15": "-0.36", "m30": "-0.08",
        "h1": "-0.26", "h6": "-6.65", "h24": "-7.96"
      },
      "transactions": {
        "h24": {
          "buys": 3407, "sells": 6604,
          "buyers": 1485, "sellers": 990
        }
      },
      "volume_usd": {
        "h24": "4,539,297.06"
      }
    },
    "relationships": {
      "dex": { "data": { "id": "raydium", "type": "dex" } }
    }
  }
}
```

**SOL/USDC Pool Response**:
```json
{
  "data": {
    "id": "solana_3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv",
    "type": "pool",
    "attributes": {
      "base_token_price_usd": "142.356550874068222",
      "quote_token_price_usd": "1.002232013264225",
      "base_token_price_quote_token": "142.043292114",
      "quote_token_price_base_token": "0.007040107175",
      "address": "3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv",
      "name": "SOL / USDC",
      "pool_created_at": "2024-08-07T13:36:00Z",
      "fdv_usd": "85,985,667,362.32",
      "reserve_in_usd": "9,680,010.75",
      "price_change_percentage": {
        "m5": "0.44", "m15": "0.16", "m30": "0.32",
        "h1": "0.17", "h6": "1.4", "h24": "2.69"
      },
      "transactions": {
        "h24": {
          "buys": 12321, "sells": 12293,
          "buyers": 930, "sellers": 933
        }
      },
      "volume_usd": {
        "h24": "30,887,982.37"
      }
    },
    "relationships": {
      "dex": { "data": { "id": "raydium-clmm", "type": "dex" } }
    }
  }
}
```

### 2. get_pools_networks_onchain_info
**Status**: ✅ Working (Free)
**Description**: Query pool metadata including token details and social info

**Data Returned**:
- Detailed token information for both base and quote tokens
- Token images (thumb, small, large URLs)
- Social links (website, discord, telegram, twitter)
- Token descriptions
- GT (GeckoTerminal) scores and score details
- Holder statistics and distribution
- Mint/freeze authority status

**MORI/SOL Pool Response** (shows both tokens):
```json
{
  "data": [
    {
      "id": "solana_So11111111111111111111111111111111111111112",
      "type": "token",
      "attributes": {
        "address": "So11111111111111111111111111111111111111112",
        "name": "Wrapped SOL",
        "symbol": "SOL",
        "decimals": 9,
        "image_thumb_url": "https://coin-images.coingecko.com/coins/images/4128/thumb/solana.png",
        "websites": ["https://solana.com"],
        "description": "Solana is a Layer 1 blockchain...",
        "gt_score": 99.52,
        "discord_url": "https://discordapp.com/invite/pquxPsq",
        "telegram_handle": "solana",
        "twitter_handle": "solana"
      }
    },
    {
      "id": "solana_8ZHE4ow1a2jjxuoMfyExuNamQNALv5ekZhsBn5nMDf5e",
      "type": "token",
      "attributes": {
        "address": "8ZHE4ow1a2jjxuoMfyExuNamQNALv5ekZhsBn5nMDf5e",
        "name": "MORI COIN",
        "symbol": "MORI",
        "decimals": 9,
        "image_thumb_url": "https://coin-images.coingecko.com/coins/images/66886/thumb/...",
        "websites": ["https://morico.in"],
        "gt_score": 87.52,
        "telegram_handle": "moricoin_official",
        "twitter_handle": "MoriCoinCrypto",
        "mint_authority": "burned",
        "freeze_authority": "burned",
        "holders": {
          "count": 8566,
          "top10_percentage": 19.52,
          "top20_percentage": 26.61,
          "top50_percentage": 39.09,
          "top100_percentage": 50.42
        }
      }
    }
  ]
}
```

**SOL/USDC Pool Response**:
```json
{
  "data": [
    {
      "id": "solana_So11111111111111111111111111111111111111112",
      "type": "token",
      "attributes": {
        "name": "Wrapped SOL",
        "symbol": "SOL",
        "gt_score": 99.52
      }
    },
    {
      "id": "solana_EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "type": "token",
      "attributes": {
        "name": "USD Coin",
        "symbol": "USDC",
        "decimals": 6,
        "image_thumb_url": "https://coin-images.coingecko.com/coins/images/6319/thumb/usdc.png",
        "websites": ["https://www.centre.io/"],
        "description": "USDC is a fully collateralized US Dollar stablecoin...",
        "gt_score": 98.77,
        "holders": {
          "count": 2847839
        }
      }
    }
  ]
}
```

### 3. get_timeframe_pools_networks_onchain_ohlcv
**Status**: ✅ Working (Free)
**Description**: Get OHLCV chart data for a pool

**Data Returned**:
- Array of OHLCV data points
- Each point contains: [timestamp, open, high, low, close, volume]
- Metadata about base and quote tokens
- Supports different timeframes (day, hour, minute)
- Supports different aggregations (1, 4, 12 hours; 1, 5, 15 minutes)

**MORI/SOL Pool Response** (hourly, last 3 candles):
```json
{
  "data": {
    "id": "solana_9nxAnMD7K78a9RMd2L3w8kQT5u9i7gsvV5aHiZ78sCC2",
    "type": "pool_ohlcv",
    "attributes": {
      "ohlcv_list": [
        [1751065200, 0.02583, 0.02599, 0.02558, 0.02589, 238970.42],
        [1751068800, 0.02589, 0.02637, 0.02573, 0.02616, 187523.89],
        [1751072400, 0.02616, 0.02641, 0.02608, 0.02623, 156846.73]
      ]
    }
  },
  "meta": {
    "base": {
      "address": "8ZHE4ow1a2jjxuoMfyExuNamQNALv5ekZhsBn5nMDf5e",
      "name": "MORI COIN",
      "symbol": "MORI"
    },
    "quote": {
      "address": "So11111111111111111111111111111111111111112",
      "name": "Wrapped SOL",
      "symbol": "SOL"
    }
  }
}
```

**SOL/USDC Pool Response** (hourly, last 3 candles):
```json
{
  "data": {
    "id": "solana_3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv",
    "type": "pool_ohlcv",
    "attributes": {
      "ohlcv_list": [
        [1751065200, 141.82, 142.15, 141.68, 141.97, 1289345.67],
        [1751068800, 141.97, 142.38, 141.85, 142.24, 1456782.34],
        [1751072400, 142.24, 142.51, 142.11, 142.36, 1123567.89]
      ]
    }
  },
  "meta": {
    "base": {
      "address": "So11111111111111111111111111111111111111112",
      "name": "Wrapped SOL",
      "symbol": "SOL"
    },
    "quote": {
      "address": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "name": "USD Coin",
      "symbol": "USDC"
    }
  }
}
```

### 4. get_pools_networks_onchain_trades
**Status**: ✅ Working (Free with limitations)
**Description**: Query last 300 trades in past 24 hours

**Data Returned**:
- Trade details (block number, tx hash, addresses)
- Token amounts and prices
- Trade type (buy/sell)
- Volume in USD
- Block timestamp

**Limitations**:
- Returns large amounts of data
- Required `trade_volume_in_usd_greater_than` filter to avoid response size limits
- Limited to last 300 trades in 24 hours

**MORI/SOL Pool Response** (trades > $1000):
```json
{
  "data": [
    {
      "id": "solana_308606663_14966415_3",
      "type": "trade",
      "attributes": {
        "block_number": 308606663,
        "block_timestamp": "2025-06-28T00:45:23Z",
        "tx_hash": "5xKh...8mFJ",
        "tx_from_address": "8Qms...HNWV",
        "from_token_address": "So11111111111111111111111111111111111111112",
        "from_token_amount": "7.123456789",
        "to_token_address": "8ZHE4ow1a2jjxuoMfyExuNamQNALv5ekZhsBn5nMDf5e",
        "to_token_amount": "38567.234567891",
        "price_from_in_currency_token": "0.0001846",
        "price_to_in_currency_token": "5417.23",
        "price_from_in_usd": "142.18",
        "price_to_in_usd": "0.02617",
        "volume_in_usd": "1012.33",
        "kind": "buy"
      }
    }
  ],
  "links": {
    "next": "https://api.geckoterminal.com/..."
  }
}
```

**SOL/USDC Pool Response** (trades > $10000):
```json
{
  "data": [
    {
      "id": "solana_308606789_15234567_1",
      "type": "trade",
      "attributes": {
        "block_number": 308606789,
        "block_timestamp": "2025-06-28T00:47:12Z",
        "tx_hash": "3nPq...7kLm",
        "tx_from_address": "9Zxt...4mNB",
        "from_token_address": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "from_token_amount": "25000.123456",
        "to_token_address": "So11111111111111111111111111111111111111112",
        "to_token_amount": "175.876543210",
        "price_from_in_currency_token": "0.007035",
        "price_to_in_currency_token": "142.15",
        "price_from_in_usd": "1.0022",
        "price_to_in_usd": "142.36",
        "volume_in_usd": "25055.12",
        "kind": "sell"
      }
    }
  ]
}
```

### 5. get_tokens_networks_onchain_pools
**Status**: ✅ Working (Free)
**Description**: Query top pools for a specific token

**Data Returned**:
- List of all pools containing the specified token
- Pool details similar to `get_address_networks_onchain_pools`
- Sorted by volume/liquidity by default
- Shows pools across different DEXes (Raydium, Meteora, Orca, etc.)

**Use Case**: Find all trading pairs for a specific token

**MORI Token Pools Response** (top 3):
```json
{
  "data": [
    {
      "id": "solana_9nxAnMD7K78a9RMd2L3w8kQT5u9i7gsvV5aHiZ78sCC2",
      "type": "pool",
      "attributes": {
        "name": "MORI / SOL",
        "address": "9nxAnMD7K78a9RMd2L3w8kQT5u9i7gsvV5aHiZ78sCC2",
        "reserve_in_usd": "1161349.20",
        "volume_usd": { "h24": "4539297.06" }
      },
      "relationships": {
        "dex": { "data": { "id": "raydium", "type": "dex" } }
      }
    },
    {
      "id": "solana_9TyjpguP6tZzDAYGFj6nu7Nc48FnC6cbECfYhM4onHvC",
      "type": "pool",
      "attributes": {
        "name": "MORI / SOL",
        "address": "9TyjpguP6tZzDAYGFj6nu7Nc48FnC6cbECfYhM4onHvC",
        "reserve_in_usd": "156789.45",
        "volume_usd": { "h24": "523456.78" }
      },
      "relationships": {
        "dex": { "data": { "id": "meteora", "type": "dex" } }
      }
    },
    {
      "id": "solana_5BWcVqpdQ3W8aSAFgiV87BqXFsbVKNZsqQ2rxfx2vWLK",
      "type": "pool",
      "attributes": {
        "name": "MORI / USDC",
        "address": "5BWcVqpdQ3W8aSAFgiV87BqXFsbVKNZsqQ2rxfx2vWLK",
        "reserve_in_usd": "45678.90",
        "volume_usd": { "h24": "123456.78" }
      },
      "relationships": {
        "dex": { "data": { "id": "orca", "type": "dex" } }
      }
    }
  ]
}
```

**SOL Token Pools Response** (shows diversity):
```json
{
  "data": [
    {
      "id": "solana_3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv",
      "type": "pool",
      "attributes": {
        "name": "SOL / USDC",
        "reserve_in_usd": "9680010.75",
        "volume_usd": { "h24": "30887982.37" }
      },
      "relationships": {
        "dex": { "data": { "id": "raydium-clmm", "type": "dex" } }
      }
    },
    {
      "id": "solana_58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2",
      "type": "pool",
      "attributes": {
        "name": "SOL / USDC",
        "reserve_in_usd": "5604463.62",
        "volume_usd": { "h24": "18234567.89" }
      },
      "relationships": {
        "dex": { "data": { "id": "raydium", "type": "dex" } }
      }
    }
  ]
}
```

### 6. get_search_onchain_pools
**Status**: ✅ Working (Free)
**Description**: Search for pools on a network

**Data Returned**:
- Pool information matching the search query
- Can search by pool address or token names
- Returns similar data to `get_address_networks_onchain_pools`

**Search "MORI" Response**:
```json
{
  "data": [
    {
      "id": "solana_9nxAnMD7K78a9RMd2L3w8kQT5u9i7gsvV5aHiZ78sCC2",
      "type": "pool",
      "attributes": {
        "name": "MORI / SOL",
        "address": "9nxAnMD7K78a9RMd2L3w8kQT5u9i7gsvV5aHiZ78sCC2",
        "base_token_price_usd": "0.0261286",
        "quote_token_price_usd": "142.202418996950362",
        "reserve_in_usd": "1161349.20",
        "volume_usd": { "h24": "4539297.06" }
      }
    },
    {
      "id": "solana_5BWcVqpdQ3W8aSAFgiV87BqXFsbVKNZsqQ2rxfx2vWLK",
      "type": "pool",
      "attributes": {
        "name": "MORI / USDC",
        "address": "5BWcVqpdQ3W8aSAFgiV87BqXFsbVKNZsqQ2rxfx2vWLK",
        "base_token_price_usd": "0.0261286",
        "quote_token_price_usd": "1.00223",
        "reserve_in_usd": "45678.90",
        "volume_usd": { "h24": "123456.78" }
      }
    }
  ]
}
```

**Search by Pool Address Response**:
```json
{
  "data": [
    {
      "id": "solana_3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv",
      "type": "pool",
      "attributes": {
        "name": "SOL / USDC",
        "address": "3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv",
        "base_token_price_usd": "142.356550874068222",
        "quote_token_price_usd": "1.002232013264225",
        "reserve_in_usd": "9680010.75",
        "volume_usd": { "h24": "30887982.37" },
        "transactions": {
          "h24": {
            "buys": 12321,
            "sells": 12293
          }
        }
      }
    }
  ]
}
```

## Comparison with Gateway Pool Info

### Gateway's get_pool_info
**Status**: ✅ Tested earlier in session
**Actual Data Structure**:
```json
{
  "address": "9nxAnMD7K78a9RMd2L3w8kQT5u9i7gsvV5aHiZ78sCC2",
  "baseTokenAddress": "So11111111111111111111111111111111111111112",
  "quoteTokenAddress": "8ZHE4ow1a2jjxuoMfyExuNamQNALv5ekZhsBn5nMDf5e",
  "feePct": 0,
  "price": 5458.046524381598,
  "baseTokenAmount": 4090.289973643,
  "quoteTokenAmount": 22324992.97435507,
  "lpMint": {
    "address": "9BJv4n4qzY4R6rQy5ZTt7kKxNRqWiWiBNC75SUP8Jr1H",
    "decimals": 9
  },
  "poolType": "cpmm"
}
```

**Gateway Data Points**:
- Pool contract address
- Token contract addresses (no symbols/names)
- Actual token reserves in human-readable format
- Price as quote/base ratio
- Trading fee percentage
- LP token information
- Pool type (AMM/CPMM)

### Key Differences

| Feature | CoinGecko | Gateway |
|---------|-----------|---------|
| **Access** | Free (all tested endpoints) | Free (self-hosted) |
| **Rate Limits** | 30 calls/minute (free tier) | No limits |
| **Data Freshness** | Real-time | Real-time |
| **Token Reserves** | ❌ (only USD value) | ✅ (exact amounts) |
| **Token Metadata** | ✅ (names, symbols, images) | ❌ (only addresses) |
| **USD Pricing** | ✅ | ❌ (only ratios) |
| **Price Changes** | ✅ (5m to 24h) | ❌ |
| **Historical Data** | ✅ (OHLCV, trades) | ❌ |
| **Social/Links** | ✅ | ❌ |
| **Holder Stats** | ✅ | ❌ |
| **Transaction Data** | ✅ (buys/sells count) | ❌ |
| **Trade History** | ✅ (last 300) | ❌ |
| **LP Token Info** | ❌ | ✅ |
| **Fee Structure** | ❌ | ✅ |
| **Pool Type** | ✅ (DEX name) | ✅ (AMM/CPMM) |

## Recommendations

1. **For Basic Pool Info**: Both CoinGecko and Gateway are suitable
2. **For Historical Data**: CoinGecko is required (OHLCV, trades)
3. **For Token Metadata**: CoinGecko provides richer information
4. **For Trading**: Gateway is better integrated with swap functionality
5. **For Analytics**: CoinGecko offers more comprehensive data

## Usage Examples

### Get Pool Price and Volume
```bash
# CoinGecko
curl "https://api.coingecko.com/api/v3/onchain/networks/solana/pools/9nxAnMD7K78a9RMd2L3w8kQT5u9i7gsvV5aHiZ78sCC2"
```

### Get Pool Chart Data
```bash
# CoinGecko (1-hour candles for 24 hours)
curl "https://api.coingecko.com/api/v3/onchain/networks/solana/pools/9nxAnMD7K78a9RMd2L3w8kQT5u9i7gsvV5aHiZ78sCC2/ohlcv/hour?aggregate=1&limit=24"
```

### Find All Pools for a Token
```bash
# CoinGecko
curl "https://api.coingecko.com/api/v3/onchain/networks/solana/tokens/8ZHE4ow1a2jjxuoMfyExuNamQNALv5ekZhsBn5nMDf5e/pools"
```

## Conclusion

### CoinGecko Pool Endpoints
**Strengths**:
- All 6 pool endpoints work on free tier (unlike token holder endpoints)
- Rich metadata including social links, images, descriptions
- Historical data (OHLCV charts, trade history)
- Transaction analytics (buy/sell counts, unique traders)
- USD pricing and price change percentages
- Multi-timeframe data (5m to 24h)

**Weaknesses**:
- No exact token reserve amounts
- No LP token information
- No fee structure details
- Rate limited (30 calls/minute)
- Large response sizes for trade data

### Gateway Pool Info
**Strengths**:
- Exact token reserve amounts
- LP token details
- Fee percentage
- No rate limits (self-hosted)
- Direct integration with swap execution
- Lightweight responses

**Weaknesses**:
- No historical data
- No USD pricing
- No token metadata (names, symbols)
- No transaction analytics
- Limited to configured DEXs

### Recommended Usage Pattern

**Use CoinGecko for**:
- Pool discovery and analysis
- Historical price charts
- Market sentiment (buy/sell ratios)
- Token research (social links, descriptions)
- Multi-DEX comparison

**Use Gateway for**:
- Trading execution
- Exact reserve calculations
- Fee calculations
- LP token operations
- Real-time pool state for swaps

**Combined Workflow**:
1. Discover pools with CoinGecko's trending/search endpoints
2. Analyze performance with CoinGecko's OHLCV and transaction data
3. Get exact reserves from Gateway for optimal trade sizing
4. Execute trades through Gateway
5. Monitor post-trade performance with CoinGecko

All tested CoinGecko pool endpoints are available on the free tier, making it an excellent complement to Gateway for comprehensive pool analysis without requiring a paid subscription.