# Gateway MCP Server

## Overview

The Gateway MCP server provides simplified access to essential DEX trading and configuration operations through the Model Context Protocol (MCP). The server follows a clean architecture pattern:
- **Resources**: Read-only access to configurations, logs, and status
- **Tools**: Write operations and API interactions
- **Prompts**: Intelligent workflows that combine multiple tools
- **Optional CoinGecko Integration**: Curated subset of market data tools

### Supported Chains and Networks

**Ethereum (EVM)**:
- Networks: mainnet, sepolia, arbitrum, avalanche, base, bsc, celo, optimism, polygon
- Connectors: uniswap, 0x

**Solana**:
- Networks: mainnet-beta, devnet
- Connectors: jupiter, meteora, raydium

## Project Structure

```
src/mcp/
├── index.ts                    # Main server entry point
├── server.ts                   # Server configuration and setup
├── version.ts                  # Version constant
├── types.ts                    # TypeScript type definitions
├── schema.ts                   # Shared parameter schemas
├── toolDefinitions.ts          # Tool definitions with schemas
├── tools.ts                    # Tool handler implementations
├── promptDefinitions.ts        # Prompt definitions with schemas
├── prompts.ts                  # Prompt handler implementations
├── resources.ts                # Resource definitions and handlers
├── config/                     # MCP configuration files
│   └── coingecko-tools-subset.json  # Curated CoinGecko tools list
├── resources/                  # Static resource files
│   ├── gateway-api-endpoints.json    # Gateway API endpoints reference
│   └── coingecko-api-endpoints.json  # CoinGecko API endpoints reference
└── utils/                      # Utility functions
    ├── api-client.ts          # Gateway API client with methods
    ├── coingecko-gateway.ts   # CoinGecko subprocess manager
    └── tool-registry.ts       # Tool registration system
```

## Key Features

- **Simplified Tool Set**: 6 core tools for configuration, trading, and wallet management
- **Curated CoinGecko Integration**: 12 DEX market data tools for use with Gateway
- **Resource-Based Configuration**: All configs accessible via gateway:// URIs
- **Schema-Driven Architecture**: All tools and prompts use Zod schemas for validation
- **Centralized Definitions**: Separate definition files for tools, prompts, and schemas
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

### Core Gateway Tools (6 total)
1. **quote_swap** - Get a quote for swapping tokens on a DEX
2. **execute_swap** - Execute a token swap on a DEX
3. **get_balances** - Get token balances for a wallet address
4. **get_transaction_status** - Check the status of a transaction
5. **read_config** - Read Gateway configuration files
6. **update_config** - Update Gateway configuration values

### Prompts (Intelligent Workflows)
1. **fetch_swap_quote** - Interactive prompt for getting swap quotes
2. **execute_token_swap** - Guided workflow for executing swaps
3. **check_wallet_portfolio** - Check wallet balances across chains
4. **configure_gateway** - Help with Gateway configuration (view, update, setup)

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

### Architecture Overview

The new architecture separates concerns into distinct modules:

1. **Definitions**: Schema and metadata definitions
   - `toolDefinitions.ts` - Tool names, descriptions, and parameter schemas for both Gateway and CoinGecko tools
   - `promptDefinitions.ts` - Prompt names, descriptions, and parameter schemas
   - `schema.ts` - Shared Zod schemas used across tools and prompts

2. **Handlers**: Implementation logic
   - `tools.ts` - Gateway tool handler functions that implement the actual logic
   - `prompts.ts` - Prompt handler functions that generate contextual responses
   - `resources.ts` - Resource handlers for serving configuration and data

3. **Server Setup**: MCP protocol implementation
   - `server.ts` - Configures the MCP server with all handlers
   - `index.ts` - Entry point that initializes and starts the server

4. **Utilities**: Shared functionality
   - `utils/api-client.ts` - Gateway API client for making HTTP requests
   - `utils/coingecko-gateway.ts` - CoinGecko subprocess management and handler updates
   - `utils/tool-registry.ts` - Central registry for tool definitions and handlers

### Resource Access Pattern
All read operations use the `gateway://` URI scheme:
- `gateway://gateway-api-endpoints.json` → Gateway API reference
- `gateway://coingecko-api-endpoints.json` → CoinGecko API reference
- `gateway://config/{file}` → Configuration files from conf/ directory
- `gateway://wallet-list` → List of wallets in conf/wallets/
- `gateway://logs` → Recent Gateway server logs

### Tool Operations Pattern
All operations use strongly-typed tools with Zod validation:
- **Trading**: `quote_swap` and `execute_swap` for DEX operations
- **Chain Operations**: `get_balances` and `get_transaction_status`
- **Configuration**: `read_config` and `update_config` for settings management

### Schema-Driven Validation
All tools and prompts use Zod schemas for parameter validation:

```typescript
// Example from schema.ts
export const ParamChain = z.enum([
  'ethereum', 'polygon', 'arbitrum', 'avalanche', 
  'optimism', 'base', 'bsc', 'celo', 'worldchain', 'solana'
]).describe('The blockchain network to use');

// Used in tool definitions
paramsSchema: {
  chain: ParamChain,
  network: ParamNetwork,
  address: ParamAddress,
}
```

### CoinGecko Integration Architecture
1. **Predefined Tools**: 12 specific CoinGecko tools defined in `toolDefinitions.ts`
2. **Subprocess Management**: CoinGecko MCP server runs as a child process
3. **Handler Updates**: CoinGecko gateway updates handlers for predefined tools only
4. **Schema Validation**: All CoinGecko tools use Zod schemas like Gateway tools
5. **Automatic Lifecycle**: Started on demand, shutdown on exit
6. **Error Resilience**: Gateway works even if CoinGecko fails

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

# Build the project (includes MCP server)
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

### Step 3: Add Gateway MCP Server to CLI Coding Agents

Here's an example with Claude. It should be similar for Gemini and other CLI-based coding agents.

#### Gateway MCP Server Only

This installs 6 Gateway tools

```bash
claude mcp add gateway node -- $(pwd)/dist/mcp/index.js \
  -e GATEWAY_URL=$GATEWAY_URL
```
#### Gateway + CoinGecko MCP Servers

This installs 18 tools: 6 Gateway + 12 curated CoinGecko

```bash
# CoinGecko API key (get from https://www.coingecko.com/api/pricing)
export COINGECKO_DEMO_API_KEY="your-demo-key"

claude mcp add gateway node -- $(pwd)/dist/mcp/index.js --with-coingecko \
  -e GATEWAY_URL=$GATEWAY_URL \
  -e COINGECKO_DEMO_API_KEY=$COINGECKO_DEMO_API_KEY

export COINGECKO_PRO_API_KEY="your-pro-key"
claude mcp add gateway node -- $(pwd)/dist/mcp/index.js --with-coingecko \
  -e GATEWAY_URL=$GATEWAY_URL \
  -e COINGECKO_PRO_API_KEY=$COINGECKO_PRO_API_KEY
```

### Manual Configuration

Alternatively, add a `.mcp.json` file to your root directory

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
        "COINGECKO_DEMO_API_KEY": "<your-demo-key>"
      }
    }
  }
}```

## Usage Examples

### Reading Configuration
```javascript
// View Ethereum configuration
Read resource: gateway://config/ethereum.yml

// Check available tokens on Ethereum mainnet  
Read resource: gateway://config/tokens/ethereum/mainnet.json

// View wallet list
Read resource: gateway://wallet-list

// View Gateway API endpoints reference
Read resource: gateway://gateway-api-endpoints.json

// View CoinGecko API endpoints reference
Read resource: gateway://coingecko-api-endpoints.json
```

### Updating Configuration
```javascript
// Update configuration
update_config({
  path: "networks/ethereum/mainnet.yml",
  key: "nodeURL",
  value: "https://eth-mainnet.g.alchemy.com/v2/YOUR-KEY"
})

// Read token list
read_config({
  path: "tokens/ethereum/mainnet.json"
})

// Update connector configuration
update_config({
  path: "connectors/uniswap.yml",
  key: "slippagePct",
  value: "1/100"
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

// Execute swap on Ethereum
execute_swap({
  chain: "ethereum",
  network: "mainnet",
  connector: "uniswap",
  address: "0x...",
  base: "ETH",
  quote: "USDC",
  amount: "1",
  side: "SELL",
  slippage: 0.5
})

// Execute swap on Polygon (still uses chain: "ethereum")
execute_swap({
  chain: "ethereum",
  network: "polygon",
  connector: "uniswap",
  address: "0x...",
  base: "MATIC",
  quote: "USDC",
  amount: "10",
  side: "SELL",
  slippage: 1
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

### Using Prompts
```javascript
// Get swap quote interactively
Use prompt: fetch_swap_quote

// Execute token swap with guidance
Use prompt: execute_token_swap with arguments:
{
  chain: "ethereum",
  base: "ETH",
  quote: "USDC",
  amount: "1",
  side: "SELL"
}

// Check wallet portfolio
Use prompt: check_wallet_portfolio with arguments:
{
  address: "0x...",
  chain: "ethereum"
}

// Configure Gateway
Use prompt: configure_gateway with arguments:
{
  action: "update",
  configFile: "ethereum.yml"
}
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
- **Compatibility**: Uses official CoinGecko MCP server without modification
- **Lightweight**: Only proxies predefined tools, no dynamic discovery
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