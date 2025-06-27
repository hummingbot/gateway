# Gateway MCP Server with CoinGecko Integration

## Overview

The Gateway MCP server provides access to DEX trading, blockchain operations, and wallet management through the Model Context Protocol (MCP). The server optionally includes integrated CoinGecko support for market data - when enabled, it automatically spawns the CoinGecko MCP server as a subprocess, providing seamless access through a single interface.

## Key Features

- **Core Gateway Tools**: 25+ DEX/blockchain tools for trading and wallet management
- **Optional CoinGecko Integration**: Add 200+ market data endpoints with `--with-coingecko`
- **Single Installation**: Install once, optionally get both Gateway and CoinGecko functionality
- **Dynamic Tools Mode**: Simplified approval with just 3-6 tools
- **Full Lifecycle Management**: Gateway handles CoinGecko startup/shutdown when enabled

## Dynamic Tools vs All Tools

### 1. **Dynamic Tools Mode** (Recommended)
- **Without CoinGecko**: 3 tools
  - `gateway_list_tools` - Discover Gateway tools
  - `gateway_get_tool_schema` - Get Gateway tool details
  - `gateway_invoke_tool` - Execute Gateway tools
- **With CoinGecko**: 6 tools (adds 3 more)
  - `coingecko_list_api_endpoints` - Discover CoinGecko endpoints
  - `coingecko_get_api_endpoint_schema` - Get CoinGecko endpoint details
  - `coingecko_invoke_api_endpoint` - Execute CoinGecko endpoints
- **Benefits**: 
  - Simplified approval process
  - Full access to all functionality
  - Reduced context usage
  - Easier to get started

### 2. **All Tools Mode** 
- **Without CoinGecko**: ~25 Gateway tools
- **With CoinGecko**: ~25 Gateway tools + ~200 CoinGecko tools
- **Benefits**:
  - Direct access to all individual tools
  - Better for automation and scripts
  - More granular permissions
  - No need to use dynamic discovery

## Installation and Setup

### Prerequisites
- Node.js 18+ installed
- pnpm package manager (`npm install -g pnpm`)
- CoinGecko API key (optional, for enhanced rate limits)

### Step 1: Clone and Build

```bash
# Clone the repository
git clone https://github.com/hummingbot/gateway.git
cd gateway

# Install dependencies
pnpm install

# Build the project
pnpm build
```

### Step 2: Start Gateway API Server

```bash
# Generate certificates and initial configs
./gateway-setup.sh

# Start Gateway API
pnpm start

# Or in development mode (HTTP only)
pnpm start --dev
```

### Step 3: Set Environment Variables

```bash
# Gateway API URL (default: http://localhost:15888)
export GATEWAY_URL="http://localhost:15888"

# CoinGecko API key (get from https://www.coingecko.com/api/pricing)
export COINGECKO_DEMO_API_KEY="your-demo-key"
# OR for pro users:
export COINGECKO_PRO_API_KEY="your-pro-key"
```

### Step 4: Add MCP Server to Claude Code

#### Basic Gateway Only (Recommended to start)
```bash
# Dynamic mode - 3 tools
claude mcp add gateway node -- $(pwd)/dist/mcp/index.js --tools=dynamic \
  -e GATEWAY_URL=$GATEWAY_URL

# All tools mode - ~25 tools
claude mcp add gateway node -- $(pwd)/dist/mcp/index.js \
  -e GATEWAY_URL=$GATEWAY_URL
```

#### Gateway with CoinGecko Integration
```bash
# Dynamic mode - 6 tools (3 Gateway + 3 CoinGecko)
claude mcp add gateway node -- $(pwd)/dist/mcp/index.js --tools=dynamic --with-coingecko \
  -e GATEWAY_URL=$GATEWAY_URL \
  -e COINGECKO_DEMO_API_KEY=$COINGECKO_DEMO_API_KEY

# All tools mode - ~225 tools (25 Gateway + 200 CoinGecko)
claude mcp add gateway node -- $(pwd)/dist/mcp/index.js --with-coingecko \
  -e GATEWAY_URL=$GATEWAY_URL \
  -e COINGECKO_DEMO_API_KEY=$COINGECKO_DEMO_API_KEY
```

### Manual Configuration

Alternatively, edit your Claude Desktop configuration directly:

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
        "--tools=dynamic",
        "--with-coingecko"  // Optional: remove for Gateway only
      ],
      "env": {
        "GATEWAY_URL": "http://localhost:15888",
        "COINGECKO_DEMO_API_KEY": "your-api-key"  // Optional: only if using --with-coingecko
      }
    }
  }
}
```

## Usage Examples

### Basic Tool Discovery

```javascript
// Discover Gateway tools
gateway_list_tools({ category: "trading" })

// Discover CoinGecko endpoints  
coingecko_list_api_endpoints({ search_query: "trending" })
```

### Market Data from CoinGecko

```javascript
// Get current prices
coingecko_invoke_api_endpoint({
  endpoint_name: "simplePrice",
  args: { 
    ids: "bitcoin,ethereum", 
    vs_currencies: "usd",
    include_24hr_change: true
  }
})

// Get trending coins
coingecko_invoke_api_endpoint({
  endpoint_name: "searchTrending",
  args: {}
})
```

### DEX Trading via Gateway

```javascript
// Get swap quote
gateway_invoke_tool({
  tool_name: "jupiter_quote",
  arguments: {
    inputMint: "So11111111111111111111111111111111111112", // SOL
    outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
    amount: 1000000000 // 1 SOL
  }
})

// Execute swap
gateway_invoke_tool({
  tool_name: "jupiter_swap",
  arguments: {
    // swap parameters from quote
  }
})
```

### Combined Workflow: Market Analysis + DEX Trading

```javascript
// 1. Check CoinGecko market price
const marketPrice = await coingecko_invoke_api_endpoint({
  endpoint_name: "simplePrice",
  args: { ids: "ethereum", vs_currencies: "usd" }
})

// 2. Get DEX quote
const dexQuote = await gateway_invoke_tool({
  tool_name: "uniswap_quote",
  arguments: {
    tokenIn: "ETH",
    tokenOut: "USDC", 
    amount: "1"
  }
})

// 3. Compare prices and execute if favorable
if (dexPrice > marketPrice * 0.99) { // Within 1% of market
  await gateway_invoke_tool({
    tool_name: "uniswap_swap",
    arguments: { /* swap params */ }
  })
}
```

## Available Prompts (Pre-built Agents)

- `swap_optimizer` - Find best swap routes across DEXs
- `portfolio_analyzer` - Analyze wallet holdings across chains
- `liquidity_finder` - Find best liquidity pools
- `gas_optimizer` - Optimize transaction gas settings
- `trending_pools_analyzer` - Analyze trending pools with price data
- `market-analyzer` - Compare CoinGecko and DEX prices

## Tool Categories

### Gateway Tools
- **Discovery**: chains, connectors, status
- **Wallet**: list, add, remove, balances  
- **Trading**: quote, swap, pools, transactions
- **Configuration**: get/update config, pools
- **Tokens**: list, search, add tokens

### CoinGecko Tools
- **Market Data**: prices, market caps, volumes
- **Trending**: trending coins, pools, searches
- **Token Info**: detailed token data
- **Exchanges**: exchange rates, volumes
- **DeFi**: TVL, yields, protocols

## Testing

Verify your installation with included test scripts:

```bash
# Test dynamic tools listing
node test/mcp/test-dynamic-tools.js

# Test CoinGecko integration
node test/mcp/test-coingecko-integration.js

# Test trending data
node test/mcp/test-coingecko-trending.js
```

## Troubleshooting

### Connection Issues
- Verify Gateway API is running: `curl http://localhost:15888/`
- Check GATEWAY_URL environment variable
- Ensure firewall allows localhost connections

### CoinGecko Not Working
- CoinGecko MCP server spawns automatically (may take a few seconds)
- Check logs for "Connected to CoinGecko MCP server"
- Verify your API key is valid
- Free tier has rate limits (30 calls/minute)

### Tool Discovery Issues
- Use `/mcp` command in Claude to refresh connection
- Restart Claude Code after configuration changes
- Remove and re-add the server if needed

## Configuration Options

### Scope Options
- **Local** (default): Available in current project only
- **User**: Available across all your projects
- **Project**: Shared with team via `.mcp.json`

```bash
# User scope
claude mcp add --scope user gateway node -- /path/to/gateway/dist/mcp/index.js --tools=dynamic

# Project scope  
claude mcp add --scope project gateway node -- /path/to/gateway/dist/mcp/index.js --tools=dynamic
```

### Environment Variables
- `GATEWAY_URL`: Gateway API URL (default: http://localhost:15888)
- `COINGECKO_DEMO_API_KEY`: Demo API key (required if using --with-coingecko)
- `COINGECKO_PRO_API_KEY`: Pro API key (higher rate limits)

### Command Line Arguments
- `--tools=dynamic`: Enable dynamic tools mode (3 or 6 tools instead of all)
- `--with-coingecko`: Include CoinGecko integration (default: false)

## Security Best Practices

- Gateway MCP server runs locally only
- Never expose Gateway API to public internet
- Keep wallet private keys secure
- API keys are passed securely via environment
- Use test networks for development
- Monitor transaction logs regularly

## Additional Resources

- [Gateway Documentation](https://github.com/hummingbot/gateway)
- [CoinGecko API Documentation](https://docs.coingecko.com)
- [MCP Protocol Specification](https://modelcontextprotocol.io)
- [Claude Code MCP Documentation](https://docs.anthropic.com/en/docs/claude-code/mcp)

## Support

- Gateway Issues: [GitHub Issues](https://github.com/hummingbot/gateway/issues)
- CoinGecko API: [CoinGecko Support](https://www.coingecko.com/en/api/documentation)
- Claude Code: [Anthropic Support](https://support.anthropic.com)