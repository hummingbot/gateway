# CoinGecko MCP Server Documentation

## Overview

The CoinGecko MCP (Model Context Protocol) server provides programmatic access to CoinGecko's comprehensive cryptocurrency data through a standardized interface. It enables AI assistants and other MCP clients to retrieve real-time market data, on-chain analytics, and token information.

## Key Features

- **46 Total Tools**: Complete coverage of CoinGecko API endpoints
- **GeckoTerminal Integration**: 25 tools (54.3%) for on-chain/DEX data
- **Real-time Data**: Live prices, market caps, trading volumes
- **Historical Analytics**: OHLCV charts, price trends, trade history
- **No Setup Required**: Works out of the box with API key
- **Flexible Deployment**: Standalone or integrated with Gateway MCP

## Installation via Gateway MCP

CoinGecko MCP is integrated with Gateway MCP and runs as a managed subprocess. This approach ensures proper lifecycle management and tool curation for DEX trading workflows.

### Prerequisites
- Node.js 18+ installed
- pnpm package manager (`npm install -g pnpm`)
- CoinGecko API key from [CoinGecko API Pricing](https://www.coingecko.com/api/pricing)

### Quick Start

```bash
# 1. Clone and build Gateway
git clone https://github.com/hummingbot/gateway.git
cd gateway
pnpm install && pnpm build

# 2. Set up Gateway
./gateway-setup.sh
pnpm start --dev  # Start in dev mode

# 3. Add to Claude Desktop with CoinGecko (5 Gateway tools + 12 CoinGecko tools)
# For Demo API:
claude mcp add gateway node -- $(pwd)/dist/mcp/index.js --with-coingecko \
  -e GATEWAY_URL=http://localhost:15888 \
  -e COINGECKO_DEMO_API_KEY=your-demo-key

# For Pro API:
claude mcp add gateway node -- $(pwd)/dist/mcp/index.js --with-coingecko \
  -e GATEWAY_URL=http://localhost:15888 \
  -e COINGECKO_PRO_API_KEY=your-pro-key
```

### API Key Configuration

- **Demo API**: Use `COINGECKO_DEMO_API_KEY` environment variable (30 calls/minute)
- **Pro API**: Use `COINGECKO_PRO_API_KEY` environment variable (higher limits, takes precedence)

### Manual Configuration

Edit your Claude Desktop configuration directly:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**Linux**: `~/.config/claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "gateway": {
      "command": "node",
      "args": [
        "/absolute/path/to/gateway/dist/mcp/index.js",
        "--with-coingecko"
      ],
      "env": {
        "GATEWAY_URL": "http://localhost:15888",
        // Choose one based on your CoinGecko subscription:
        "COINGECKO_DEMO_API_KEY": "your-demo-key"  // For Demo API
        // OR
        "COINGECKO_PRO_API_KEY": "your-pro-key"    // For Pro API
      }
    }
  }
}
```

## Gateway MCP Integration

When using Gateway MCP with `--with-coingecko`, it includes a curated subset of 12 essential tools for DEX trading:

### Default Load List (12 tools)

The following tools are included in Gateway's default `coingeckoTools` configuration:
- `get_search` - Find tokens by name/symbol
- `get_id_coins` - Get comprehensive coin metadata and market data
- `get_simple_price` - Simple price query
- `get_tokens_networks_onchain_pools` - Find all pools for a token
- `get_address_networks_onchain_pools` - Get specific pool data
- `get_search_onchain_pools` - Search pools by pair
- `get_address_networks_onchain_tokens` - Token data by address
- `get_networks_onchain_dexes` - List DEXs on network
- `get_networks_onchain_trending_pools` - Find trending pools
- `get_pools_networks_onchain_info` - Pool metadata
- `get_coins_markets` - Market data for all coins
- `get_search_trending` - Trending searches

## Complete Tools Reference

### Tools by Category

| Category | Count | Percentage | In Gateway Default |
|----------|-------|------------|-------------------|
| On-chain/GeckoTerminal | 25 | 54.3% | 7 |
| Coins & Market Data | 11 | 23.9% | 2 |
| NFTs | 3 | 6.5% | 0 |
| Simple Price | 3 | 6.5% | 1 |
| Search | 2 | 4.3% | 2 |
| Asset Platforms | 1 | 2.2% | 0 |
| Global | 1 | 2.2% | 0 |
| **Total** | **46** | **100%** | **12** |

### Complete Tools List

| # | Tool Name | Endpoint Name | Category | Description | Default |
|---|-----------|---------------|----------|-------------|---------|
| 1 | `coingecko_get_asset_platforms` | `get_asset_platforms` | asset_platforms | Query all blockchain platforms | |
| 2 | `coingecko_get_id_coins` | `get_id_coins` | coins | Get comprehensive coin metadata and market data | ⭐ |
| 3 | `coingecko_get_list_coins_categories` | `get_list_coins_categories` | coins.categories | List all coin categories | |
| 4 | `coingecko_get_coins_list` | `get_coins_list` | coins.list | List all supported coins | |
| 5 | `coingecko_get_new_coins_list` | `get_new_coins_list` | coins.list | Get 200 newest coins | |
| 6 | `coingecko_get_coins_markets` | `get_coins_markets` | coins.markets | Get market data for all coins | ⭐ |
| 7 | `coingecko_get_coins_top_gainers_losers` | `get_coins_top_gainers_losers` | coins.top_gainers_losers | Top 30 gainers/losers | |
| 8 | `coingecko_get_coins_contract` | `get_coins_contract` | coins.contract | Get coin by contract address | |
| 9 | `coingecko_get_range_contract_coins_market_chart` | `get_range_contract_coins_market_chart` | coins.contract.market_chart | Historical chart by contract | |
| 10 | `coingecko_get_coins_history` | `get_coins_history` | coins.history | Historical data at specific date | |
| 11 | `coingecko_get_range_coins_market_chart` | `get_range_coins_market_chart` | coins.market_chart | Historical price charts | |
| 12 | `coingecko_get_range_coins_ohlc` | `get_range_coins_ohlc` | coins.ohlc | OHLC candlestick data | |
| 13 | `coingecko_get_global` | `get_global` | global | Global crypto market data | |
| 14 | `coingecko_get_id_nfts` | `get_id_nfts` | nfts | NFT collection data | |
| 15 | `coingecko_get_list_nfts` | `get_list_nfts` | nfts | List all NFT collections | |
| 16 | `coingecko_get_nfts_market_chart` | `get_nfts_market_chart` | nfts.market_chart | NFT historical market data | |
| 17 | `coingecko_get_onchain_categories` | `get_onchain_categories` | onchain.categories | Pool categories | |
| 18 | `coingecko_get_pools_onchain_categories` | `get_pools_onchain_categories` | onchain.categories | Pools by category | |
| 19 | `coingecko_get_onchain_networks` | `get_onchain_networks` | onchain.networks | Supported networks | |
| 20 | `coingecko_get_networks_onchain_new_pools` | `get_networks_onchain_new_pools` | onchain.networks.new_pools | New pools (all networks) | |
| 21 | `coingecko_get_network_networks_onchain_new_pools` | `get_network_networks_onchain_new_pools` | onchain.networks.new_pools | New pools (specific network) | |
| 22 | `coingecko_get_networks_onchain_trending_pools` | `get_networks_onchain_trending_pools` | onchain.networks.trending_pools | Trending pools (all) | ⭐ |
| 23 | `coingecko_get_network_networks_onchain_trending_pools` | `get_network_networks_onchain_trending_pools` | onchain.networks.trending_pools | Trending pools (network) | |
| 24 | `coingecko_get_networks_onchain_dexes` | `get_networks_onchain_dexes` | onchain.networks.dexes | DEXs on network | ⭐ |
| 25 | `coingecko_get_pools_networks_onchain_dexes` | `get_pools_networks_onchain_dexes` | onchain.networks.dexes | DEX pools | |
| 26 | `coingecko_get_networks_onchain_pools` | `get_networks_onchain_pools` | onchain.networks.pools | Top pools on network | |
| 27 | `coingecko_get_address_networks_onchain_pools` | `get_address_networks_onchain_pools` | onchain.networks.pools | Specific pool data | ⭐ |
| 28 | `coingecko_get_pools_networks_onchain_info` | `get_pools_networks_onchain_info` | onchain.networks.pools.info | Pool metadata | ⭐ |
| 29 | `coingecko_get_timeframe_pools_networks_onchain_ohlcv` | `get_timeframe_pools_networks_onchain_ohlcv` | onchain.networks.pools.ohlcv | Pool OHLCV charts | |
| 30 | `coingecko_get_pools_networks_onchain_trades` | `get_pools_networks_onchain_trades` | onchain.networks.pools.trades | Pool trades | |
| 31 | `coingecko_get_address_networks_onchain_tokens` | `get_address_networks_onchain_tokens` | onchain.networks.tokens | Token data by address | ⭐ |
| 32 | `coingecko_get_tokens_networks_onchain_info` | `get_tokens_networks_onchain_info` | onchain.networks.tokens.info | Token metadata | |
| 33 | `coingecko_get_tokens_networks_onchain_top_holders` | `get_tokens_networks_onchain_top_holders` | onchain.networks.tokens.top_holders | Top token holders | |
| 34 | `coingecko_get_tokens_networks_onchain_holders_chart` | `get_tokens_networks_onchain_holders_chart` | onchain.networks.tokens.holders_chart | Holders history | |
| 35 | `coingecko_get_timeframe_tokens_networks_onchain_ohlcv` | `get_timeframe_tokens_networks_onchain_ohlcv` | onchain.networks.tokens.ohlcv | Token OHLCV | |
| 36 | `coingecko_get_tokens_networks_onchain_pools` | `get_tokens_networks_onchain_pools` | onchain.networks.tokens.pools | Pools for token | ⭐ |
| 37 | `coingecko_get_tokens_networks_onchain_trades` | `get_tokens_networks_onchain_trades` | onchain.networks.tokens.trades | Token trades | |
| 38 | `coingecko_get_pools_onchain_megafilter` | `get_pools_onchain_megafilter` | onchain.pools.megafilter | Advanced pool filter | |
| 39 | `coingecko_get_pools_onchain_trending_search` | `get_pools_onchain_trending_search` | onchain.pools.trending_search | Trending pool searches | |
| 40 | `coingecko_get_search_onchain_pools` | `get_search_onchain_pools` | onchain.search.pools | Search pools | ⭐ |
| 41 | `coingecko_get_addresses_networks_simple_onchain_token_price` | `get_addresses_networks_simple_onchain_token_price` | onchain.simple.networks.token_price | Token price | |
| 42 | `coingecko_get_search` | `get_search` | search | Search coins/markets | ⭐ |
| 43 | `coingecko_get_search_trending` | `get_search_trending` | search.trending | Trending searches | ⭐ |
| 44 | `coingecko_get_simple_price` | `get_simple_price` | simple.price | Simple price query | ⭐ |
| 45 | `coingecko_get_simple_supported_vs_currencies` | `get_simple_supported_vs_currencies` | simple.supported_vs_currencies | Supported currencies | |
| 46 | `coingecko_get_id_simple_token_price` | `get_id_simple_token_price` | simple.token_price | Token price by contract | |

## Pool Endpoints Deep Dive

### Key Pool Endpoints (All Free Tier)

#### 1. get_address_networks_onchain_pools
**Purpose**: Get comprehensive data for a specific pool
**Returns**:
- Current prices (USD and native currency)
- Price change percentages (5m to 24h)
- Transaction counts and volume
- Buy/sell breakdown
- Reserve amounts in USD
- Token relationships

#### 2. get_pools_networks_onchain_info
**Purpose**: Get detailed metadata for pool tokens
**Returns**:
- Token names, symbols, addresses
- Token images and social links
- GT (GeckoTerminal) scores
- Holder statistics
- Mint/freeze authority status

#### 3. get_timeframe_pools_networks_onchain_ohlcv
**Purpose**: Get historical OHLCV chart data
**Returns**:
- Array of [timestamp, open, high, low, close, volume]
- Supports multiple timeframes (minute, hour, day)
- Token metadata

#### 4. get_pools_networks_onchain_trades
**Purpose**: Query recent pool trades
**Returns**:
- Last 300 trades in 24 hours
- Trade details (amounts, prices, addresses)
- Buy/sell classification
- Block information

#### 5. get_tokens_networks_onchain_pools
**Purpose**: Find all pools for a specific token
**Returns**:
- List of all pools containing the token
- Sorted by volume/liquidity
- Cross-DEX coverage

#### 6. get_search_onchain_pools
**Purpose**: Search for pools by name or address
**Returns**:
- Matching pools with full details
- Flexible search capabilities

### CoinGecko vs Gateway Pool Data Comparison

| Feature | CoinGecko | Gateway |
|---------|-----------|---------|
| **Access** | Free tier available | Self-hosted |
| **Rate Limits** | 30 calls/min (free) | No limits |
| **Token Reserves** | ❌ (USD value only) | ✅ (exact amounts) |
| **Token Metadata** | ✅ (names, symbols, images) | ❌ (addresses only) |
| **USD Pricing** | ✅ | ❌ (ratios only) |
| **Price Changes** | ✅ (5m to 24h) | ❌ |
| **Historical Data** | ✅ (OHLCV, trades) | ❌ |
| **Social/Links** | ✅ | ❌ |
| **Transaction Data** | ✅ (buy/sell counts) | ❌ |
| **LP Token Info** | ❌ | ✅ |
| **Fee Structure** | ❌ | ✅ |

## Usage Examples

### Direct Tool Usage (All Tools Mode)
```javascript
// Simple price check
coingecko_get_simple_price({
  ids: "bitcoin,ethereum",
  vs_currencies: "usd"
})

// Find pools for a token
coingecko_get_tokens_networks_onchain_pools({
  network: "solana",
  token_address: "So11111111111111111111111111111111111111112",
  include: "base_token,quote_token,dex"
})

// Get pool details
coingecko_get_address_networks_onchain_pools({
  network: "solana",
  pool_address: "9nxAnMD7K78a9RMd2L3w8kQT5u9i7gsvV5aHiZ78sCC2"
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

## Use Cases

### 1. Token Discovery and Analysis
- Use `get_search` to find tokens by name
- Get contract addresses with `get_id_coins`
- Check current prices with `get_simple_price`
- Analyze market metrics with `get_coins_markets`

### 2. DEX Pool Analysis
- Find all pools for a token with `get_tokens_networks_onchain_pools`
- Get pool details with `get_address_networks_onchain_pools`
- View historical performance with `get_timeframe_pools_networks_onchain_ohlcv`
- Analyze recent trades with `get_pools_networks_onchain_trades`

### 3. Market Monitoring
- Track trending pools with `get_networks_onchain_trending_pools`
- Monitor new pools with `get_networks_onchain_new_pools`
- Find trending searches with `get_search_trending`
- Check top gainers/losers with `get_coins_top_gainers_losers`

### 4. Combined with Gateway
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

## Configuration

### Customizing Gateway's CoinGecko Tools

Edit `conf/server.yml` to customize which tools are loaded:

```yaml
mcp:
  coingeckoTools:
    - get_search
    - get_id_coins
    - get_simple_price
    - get_tokens_networks_onchain_pools
    - get_address_networks_onchain_pools
    - get_search_onchain_pools
    - get_address_networks_onchain_tokens
    - get_networks_onchain_dexes
    - get_networks_onchain_trending_pools
    - get_pools_networks_onchain_info
    - get_coins_markets
    - get_search_trending
    # Add more tools as needed
```

## Notes

1. **Tool Naming Convention**: All tools follow the pattern `coingecko_[endpoint_name]`
2. **Resource Path**: The endpoint's resource path (e.g., `simple.price`) indicates the API structure
3. **No Missing Tools**: Every endpoint has a corresponding tool and vice versa
4. **GeckoTerminal Focus**: Over 50% of tools are for on-chain/DEX data via GeckoTerminal
5. **API Key Required**: Most endpoints require a CoinGecko API key for access
6. **Free Tier Friendly**: All pool endpoints work on the free tier (unlike some token holder endpoints)

## Additional Resources

- [CoinGecko API Documentation](https://docs.coingecko.com/reference/introduction)
- [CoinGecko MCP Server Documentation](https://docs.coingecko.com/reference/mcp-server)
- [Gateway MCP Documentation](https://github.com/hummingbot/gateway/blob/main/GATEWAY-MCP.md)
- [Model Context Protocol Specification](https://modelcontextprotocol.io)