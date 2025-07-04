# Gateway MCP Server

## Overview

The Gateway MCP server provides simplified access to essential DEX trading and configuration operations through the Model Context Protocol (MCP). The server follows a clean architecture pattern:
- **Resources**: Read-only access to configurations, logs, and status
- **Tools**: Write operations and API interactions
- **Prompts**: Intelligent workflows that combine multiple tools
- **Optional CoinGecko Integration**: Curated subset of market data tools

## Project Structure

```
src/mcp/
├── index.ts                    # Main server entry point
├── version.ts                  # Version constant
├── types.ts                    # TypeScript type definitions
├── config/                     # MCP configuration files
│   └── coingecko-tools-subset.json  # Curated CoinGecko tools list
├── resources/                  # Resource handlers for read-only data
│   └── index.ts               # Handles configs, tokens, wallets, logs
├── tools/                      # Tool implementations  
│   ├── config.ts              # Configuration update tools (3 tools)
│   ├── trading.ts             # Trading tools (2 tools)
│   └── coingecko-gateway.ts   # CoinGecko subprocess manager
├── prompts/                    # Intelligent workflow prompts
│   ├── index.ts               # Prompt registry
│   └── fetch-swap-quote.ts    # Swap quote finder workflow
└── utils/                      # Utility functions
    ├── api-client.ts          # Gateway API client
    ├── fallback.ts            # Offline fallback data
    └── tool-registry.ts       # Tool registration system
```

## Key Features

- **Simplified Tool Set**: 5 core tools for quoting and executing DEX swaps
- **Curated CoinGecko Integration**: 12 DEX market data tools for use with Gateway
- **Resource-Based Configuration**: All configs accessible via gateway:// URIs
- **Full Lifecycle Management**: Automatic CoinGecko subprocess handling
- **Reduced Permission Requests**: Resources provide read-only access without permissions
- **Offline Support**: Fallback data when Gateway isn't running

## Available Resources, Tools, and Prompts

### Resources (Read-only Access)
- **gateway://conf/***  - All configuration files in the conf/ directory, including:
  - Chain configs (ethereum.yml, solana.yml, etc.)
  - Connector configs (connectors/*.yml)
  - Token lists (tokens/{chain}/{network}.json)
  - Individual wallet files (wallets/{chain}/{address}.json)
  - Network configs (networks/{chain}/*.yml)
- **gateway://wallet-list** - Active wallets from Gateway API (runtime state)
- **gateway://logs** - Gateway server logs (last 1000 lines)

### Core Gateway Tools (5 total)
1. **update_config** - Update chain/connector configuration values and trigger server restart
2. **update_tokens** - Add, update, or remove tokens from token lists
3. **update_wallets** - Add or remove wallets
4. **quote_swap** - Get a quote for token swaps on DEX aggregators (router connectors)
5. **execute_swap** - Execute token swaps on DEX aggregators (router connectors)

### Prompts (Intelligent Workflows)
1. **fetch-swap-quote** - Interactive prompt that:
   - Uses elicitation to gather swap details (chain, tokens, amount, wallet)
   - Searches CoinGecko for token information
   - Finds the highest volume pools using on-chain data
   - Fetches swap quotes from the best pool
   - Requires CoinGecko integration (`--with-coingecko`)

### Optional CoinGecko Integration (12 curated tools)
When enabled with `--with-coingecko`, adds a carefully selected subset of CoinGecko tools:

| Tool | Purpose | Used By |
|------|---------|---------|  
| `coingecko_get_search` | Find tokens by name/symbol | fetch-swap-quote prompt |
| `coingecko_get_id_coins` | Get token contract addresses | fetch-swap-quote prompt |
| `coingecko_get_simple_price` | Quick price checks | General use |
| `coingecko_get_tokens_networks_onchain_pools` | Find all pools for a token | fetch-swap-quote prompt |
| `coingecko_get_address_networks_onchain_pools` | Get pool volume/liquidity | fetch-swap-quote prompt |
| `coingecko_get_search_onchain_pools` | Search pools by pair | Pool discovery |
| `coingecko_get_address_networks_onchain_tokens` | Verify token on-chain | Token validation |
| `coingecko_get_networks_onchain_dexes` | List DEXs on network | DEX discovery |
| `coingecko_get_networks_onchain_trending_pools` | Find active pools | Market analysis |
| `coingecko_get_pools_networks_onchain_info` | Pool metadata | Pool details |
| `coingecko_get_coins_markets` | Market cap/volume data | Market analysis |
| `coingecko_get_search_trending` | Trending tokens | Market discovery |

## Customizing CoinGecko Tools

The CoinGecko tools subset is configured in `conf/server.yml` under the `mcp.coingeckoTools` section. To add or remove tools:

1. View available tools using the CoinGecko MCP server directly:
   ```bash
   npx -y @coingecko/coingecko-mcp@latest
   ```

2. Edit `conf/server.yml` to include the tools you need:
   ```yaml
   mcp:
     coingeckoTools:
       - get_search
       - get_id_coins
       - get_simple_price
       # Add more tool names here
   ```

3. Restart the MCP server to apply changes

The subset is designed to provide essential DEX trading functionality while keeping the tool count manageable.

### Adding Custom Tools

To add more CoinGecko tools:

1. Find the tool name from the full list (run CoinGecko MCP directly)
2. Add it to the `tools` array in the config file
3. Include category, description, and usage information
4. Restart the Gateway MCP server

Example: To add the top gainers/losers tool:
```yaml
mcp:
  coingeckoTools:
    - get_search
    - get_id_coins
    - get_simple_price
    - get_coins_top_gainers_losers  # Added tool
    # ... other tools
```

## Implementation Details

### Resource Access Pattern
All read operations use the `gateway://` URI scheme:
- `gateway://conf/ethereum` → Chain configuration
- `gateway://conf/connectors/uniswap` → Connector configuration  
- `gateway://conf/tokens/ethereum/mainnet` → Token list
- `gateway://conf/wallets/ethereum/0x123...` → Wallet file
- `gateway://wallet-list` → Active wallets from API
- `gateway://logs` → Server logs

### Tool Operations Pattern
All write operations use dedicated tools:
- **Configuration**: `update_config` modifies chain/connector settings
- **Tokens**: `update_tokens` adds/updates/removes tokens
- **Wallets**: `update_wallets` adds/removes wallets
- **Trading**: `quote_swap` and `execute_swap` for DEX operations

### CoinGecko Integration Architecture
1. **Subprocess Management**: CoinGecko MCP server runs as a child process
2. **Tool Filtering**: Only loads tools specified in config file
3. **Automatic Lifecycle**: Started on demand, shutdown on exit
4. **Error Resilience**: Gateway works even if CoinGecko fails

## Quick Start

```bash
# 1. Clone and build Gateway
git clone https://github.com/hummingbot/gateway.git
cd gateway
pnpm install && pnpm build

# 2. Set up Gateway
./gateway-setup.sh
pnpm start --dev  # Start in dev mode

# 3. Add to Claude Code (5 tools)
claude mcp add gateway node -- $(pwd)/dist/mcp/index.js \
  -e GATEWAY_URL=http://localhost:15888

# 4. Or with CoinGecko (5 Gateway tools + 12 CoinGecko tools)
# For Demo API:
claude mcp add gateway node -- $(pwd)/dist/mcp/index.js --with-coingecko \
  -e GATEWAY_URL=http://localhost:15888 \
  -e COINGECKO_DEMO_API_KEY=your-demo-key

# For Pro API:
claude mcp add gateway node -- $(pwd)/dist/mcp/index.js --with-coingecko \
  -e GATEWAY_URL=http://localhost:15888 \
  -e COINGECKO_PRO_API_KEY=your-pro-key
```

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
# For Demo API (uses api.coingecko.com):
export COINGECKO_DEMO_API_KEY="your-demo-key"

# For Pro API (uses pro-api.coingecko.com):
export COINGECKO_PRO_API_KEY="your-pro-key"

# Note: If both keys are set, Pro API takes precedence
```

### Step 4: Add MCP Server to Claude Code

#### Basic Gateway Only
```bash
# 5 Gateway tools
claude mcp add gateway node -- $(pwd)/dist/mcp/index.js \
  -e GATEWAY_URL=$GATEWAY_URL
```

#### Gateway with CoinGecko Integration
```bash
# For Demo API (17 tools: 5 Gateway + 12 curated CoinGecko)
claude mcp add gateway node -- $(pwd)/dist/mcp/index.js --with-coingecko \
  -e GATEWAY_URL=$GATEWAY_URL \
  -e COINGECKO_DEMO_API_KEY=$COINGECKO_DEMO_API_KEY

# For Pro API (17 tools: 5 Gateway + 12 curated CoinGecko)
claude mcp add gateway node -- $(pwd)/dist/mcp/index.js --with-coingecko \
  -e GATEWAY_URL=$GATEWAY_URL \
  -e COINGECKO_PRO_API_KEY=$COINGECKO_PRO_API_KEY
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
        "--with-coingecko"  // Optional: remove for Gateway only
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

## Usage Examples

### Reading Configuration
```javascript
// View Ethereum configuration
Read resource: gateway://conf/ethereum

// Check available tokens on Ethereum mainnet
Read resource: gateway://conf/tokens/ethereum/mainnet

// View active wallets
Read resource: gateway://wallet-list

// Check which CoinGecko tools are loaded
Read resource: gateway://coingecko-tools-config
```

### Updating Configuration
```javascript
// Update Ethereum node URL
update_config({
  namespace: "ethereum",
  network: "mainnet",
  path: "nodeURL",
  value: "https://eth-mainnet.g.alchemy.com/v2/YOUR-KEY"
})

// Add a new token
update_tokens({
  chain: "ethereum",
  network: "mainnet",
  action: "add",
  token: {
    symbol: "USDT",
    name: "Tether USD",
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    decimals: 6
  }
})
```

### Trading Operations
```javascript
// Get swap quote (for router/aggregator connectors)
quote_swap({
  connector: "uniswap",
  network: "mainnet",
  baseToken: "ETH",
  quoteToken: "USDC",
  amount: 1,
  side: "SELL"
})

// Execute the swap directly
execute_swap({
  connector: "uniswap",
  network: "mainnet",
  walletAddress: "0x...",
  baseToken: "ETH",
  quoteToken: "USDC",
  amount: 1,
  side: "SELL",
  slippagePct: 0.5
})

// Or execute a pre-fetched quote
execute_quote({
  connector: "uniswap",
  network: "mainnet",
  walletAddress: "0x...",
  quoteId: "quote-id-from-quote-swap"
})
```

### Using CoinGecko Tools
```javascript
// Search for a token
coingecko_get_search({
  query: "uniswap"
})

// Get token details with contract addresses
coingecko_get_id_coins({
  id: "uniswap",
  localization: false,
  tickers: false,
  market_data: true,
  community_data: false,
  developer_data: false
})

// Find pools for a token
coingecko_get_tokens_networks_onchain_pools({
  network: "eth",
  token_address: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
  include: "base_token,quote_token,dex"
})
```

### Using the Swap Quote Prompt
```javascript
// Start the interactive workflow
Use prompt: fetch-swap-quote

// Or provide partial information
Use prompt: fetch-swap-quote with arguments:
{
  chain: "ethereum",
  inputToken: "ETH",
  amount: "1"
}
// The prompt will ask for missing information
```

## Available Prompts

### fetch-swap-quote
An intelligent workflow that guides users through finding the best swap route:
1. **Elicitation**: Gathers missing information (chain, tokens, amount, wallet)
2. **Token Discovery**: Uses CoinGecko to find token addresses
3. **Pool Analysis**: Identifies highest volume pools for the token pair
4. **Quote Fetching**: Gets swap quotes from the best pool

**Required**: CoinGecko integration (`--with-coingecko`)
**Tools Used**: `coingecko_get_search`, `coingecko_get_id_coins`, `coingecko_get_tokens_networks_onchain_pools`, `coingecko_get_address_networks_onchain_pools`, `quote_swap`

## Tool Categories

### Gateway Tools (5 total)
- **Configuration**: update_config, update_tokens, update_wallets
- **Trading**: quote_swap, execute_swap

### CoinGecko Tools (12 curated tools when enabled)
- **Search & Discovery**: 2 tools for finding tokens
- **Token Information**: 2 tools for token metadata and contracts
- **Pool Analytics**: 5 tools for finding and analyzing DEX pools
- **Market Data**: 2 tools for prices and market metrics
- **DEX Information**: 1 tool for available DEXs on networks

The subset is configured in `conf/server.yml` under `mcp.coingeckoTools`.

## Architecture Decisions

### Why Curated Tools?
- **Reduced Complexity**: 12 tools vs 46 makes discovery easier
- **Focused Use Case**: Selected for DEX trading workflows
- **Performance**: Faster startup and less memory usage
- **Customizable**: Easy to add/remove tools as needed

### Why Resources for Reading?
- **No Permission Prompts**: Resources don't require user approval
- **Bulk Access**: Can read entire config directories
- **Real-time Data**: Always shows current file contents
- **Clear Separation**: Read vs write operations are distinct

### Why Subprocess for CoinGecko?
- **Isolation**: CoinGecko API key stays in subprocess
- **Reliability**: Gateway continues if CoinGecko fails
- **Updates**: Can update CoinGecko MCP independently
- **Resource Management**: Subprocess can be restarted if needed

## Testing

Verify your installation with included test scripts:

```bash
# Test MCP server (Gateway only - 5 tools)
node test/mcp/test-mcp-server.js

# Test MCP server with CoinGecko (17 tools)
node test/mcp/test-mcp-server.js --with-coingecko

# Test all CoinGecko tools
node test/mcp/test-all-coingecko-tools.js

# Test API resources
node test/mcp/test-api-resources.js

# Test fetch-swap-quote prompt
node test/mcp/test-fetch-swap-quote-prompt.js

# Legacy test suite
node test-mcp-tools.js
```

Expected test output:
- ✅ Tools available (5 Gateway + 12 CoinGecko when enabled)
- ✅ Resources accessible
- ✅ Prompts ready
- ✅ Fallback data works offline

## Troubleshooting

### Connection Issues
- Verify Gateway API is running: `curl http://localhost:15888/`
- Check GATEWAY_URL environment variable
- Ensure firewall allows localhost connections

### CoinGecko Not Working
- CoinGecko MCP server spawns automatically (may take a few seconds)
- Check logs for "Connected to CoinGecko MCP server" and "Using CoinGecko Demo/Pro API"
- Verify your API key is valid and using the correct environment variable:
  - Demo keys: Use `COINGECKO_DEMO_API_KEY` (api.coingecko.com)
  - Pro keys: Use `COINGECKO_PRO_API_KEY` (pro-api.coingecko.com)
- If you see "API Key Missing" errors, ensure the key is passed with `-e` flag
- Demo tier has rate limits (30 calls/minute)

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
claude mcp add --scope user gateway node -- /path/to/gateway/dist/mcp/index.js

# Project scope  
claude mcp add --scope project gateway node -- /path/to/gateway/dist/mcp/index.js
```

### Environment Variables
- `GATEWAY_URL`: Gateway API URL (default: http://localhost:15888)
- `COINGECKO_DEMO_API_KEY`: Demo API key for api.coingecko.com (required if using --with-coingecko without Pro key)
- `COINGECKO_PRO_API_KEY`: Pro API key for pro-api.coingecko.com (higher rate limits, takes precedence over Demo key)

### Command Line Arguments
- `--with-coingecko`: Include CoinGecko integration with 12 curated tools (default: false)

## Security Best Practices

- Gateway MCP server runs locally only
- Never expose Gateway API to public internet
- Keep wallet private keys secure
- API keys are passed securely via environment
- Use test networks for development
- Monitor transaction logs regularly
- Private keys never exposed through MCP
- All signing happens within Gateway
- Resources are read-only
- Tools validate inputs

## Additional Resources

- [Gateway Documentation](https://github.com/hummingbot/gateway)
- [CoinGecko API Documentation](https://docs.coingecko.com)
- [MCP Protocol Specification](https://modelcontextprotocol.io)
- [Claude Code MCP Documentation](https://docs.anthropic.com/en/docs/claude-code/mcp)

## Support

- Gateway Issues: [GitHub Issues](https://github.com/hummingbot/gateway/issues)
- CoinGecko API: [CoinGecko Support](https://www.coingecko.com/en/api/documentation)
- Claude Code: [Anthropic Support](https://support.anthropic.com)