# Gateway MCP Server Setup Guide

## Overview

The Gateway MCP server provides access to DEX trading, blockchain operations, and wallet management through the Model Context Protocol (MCP). This guide explains how to configure and use the server with dynamic tools for simplified approval.

## Dynamic Tools vs All Tools

The Gateway MCP server offers two modes of operation:

### 1. **Dynamic Tools Mode** (Recommended)
- **Tools Required**: Only 3 tools to approve
  - `list_gateway_tools` - Discover available tools
  - `get_tool_schema` - Get tool details
  - `invoke_gateway_tool` - Execute tools
- **Benefits**: 
  - Simplified approval process
  - Full access to all Gateway functionality
  - Reduced context usage
  - Easier to get started

### 2. **All Tools Mode** 
- **Tools Required**: 20+ individual tools across categories
- **Benefits**:
  - Direct access to specific tools
  - Better for automation and scripts
  - More granular permissions

## Installation and Setup

### Prerequisites
- Gateway server running (default: http://localhost:15888)
- Claude Code installed
- Node.js 18+ installed

### Step 1: Build the MCP Server

```bash
# From the gateway directory
pnpm build:mcp
```

### Step 2: Set Gateway URL (Optional)

```bash
# Default is http://localhost:15888
export GATEWAY_URL="http://localhost:15888"
```

### Step 3: Add MCP Server with Dynamic Tools

```bash
# Add with dynamic tools (3 tools only)
claude mcp add gateway node -- /path/to/gateway/dist/mcp/index.js --tools=dynamic \
  -e GATEWAY_URL=$GATEWAY_URL
```

### Step 4: Add MCP Server with All Tools

```bash
# Add with all tools (20+ individual tools)
claude mcp add gateway node -- /path/to/gateway/dist/mcp/index.js \
  -e GATEWAY_URL=$GATEWAY_URL
```

## Switching Between Modes

### From Dynamic to All Tools
```bash
# Remove current configuration
claude mcp remove gateway

# Add with all tools
claude mcp add gateway node -- /path/to/gateway/dist/mcp/index.js \
  -e GATEWAY_URL=$GATEWAY_URL
```

### From All Tools to Dynamic
```bash
# Remove current configuration
claude mcp remove gateway

# Add with dynamic tools
claude mcp add gateway node -- /path/to/gateway/dist/mcp/index.js --tools=dynamic \
  -e GATEWAY_URL=$GATEWAY_URL
```

## Usage Examples

### With Dynamic Tools Mode

1. **Discover Available Tools**
   ```
   Use list_gateway_tools to see all available tools
   
   Or filter by category:
   - category: "discovery"
   - category: "trading"
   - category: "wallet"
   ```

2. **Get Tool Details**
   ```
   Use get_tool_schema with:
   - tool_name: "get_chains"
   ```

3. **Execute Tools**
   ```
   Use invoke_gateway_tool to execute any tool:
   - tool_name: "get_chains"
   - arguments: {}
   ```

### With All Tools Mode

Direct access to specific tools:
```
Use get_chains directly to see available blockchains
Use get_connectors to see available DEX connectors
Use execute_swap to perform a token swap
```

## Common Operations

### Discover Available Resources
```javascript
// Dynamic mode
invoke_gateway_tool({
  tool_name: "get_chains",
  arguments: {}
})

invoke_gateway_tool({
  tool_name: "get_connectors", 
  arguments: { chain: "solana" }
})

// All tools mode
get_chains()
get_connectors({ chain: "solana" })
```

### Check Wallet Balances
```javascript
// Dynamic mode
invoke_gateway_tool({
  tool_name: "get_balances",
  arguments: {
    chain: "ethereum",
    network: "mainnet",
    address: "0x..."
  }
})

// All tools mode
get_balances({
  chain: "ethereum",
  network: "mainnet", 
  address: "0x..."
})
```

### Execute a Swap
```javascript
// Dynamic mode
invoke_gateway_tool({
  tool_name: "execute_swap",
  arguments: {
    connector: "uniswap",
    network: "mainnet",
    walletAddress: "0x...",
    baseToken: "ETH",
    quoteToken: "USDC",
    amount: "1",
    side: "SELL"
  }
})
```

### Get Price Quote
```javascript
// Dynamic mode
invoke_gateway_tool({
  tool_name: "quote_swap",
  arguments: {
    connector: "jupiter",
    network: "mainnet-beta",
    baseToken: "SOL",
    quoteToken: "USDC",
    amount: 10,
    side: "SELL"
  }
})
```

## Tool Categories

### Discovery Tools
- `get_chains` - List supported blockchains
- `get_connectors` - List DEX connectors
- `get_status` - Check chain/network status

### Wallet Tools  
- `wallet_list` - List configured wallets
- `wallet_add` - Add a new wallet
- `wallet_remove` - Remove a wallet
- `get_balances` - Check token balances

### Trading Tools
- `quote_swap` - Get swap price quote
- `execute_swap` - Execute token swap
- `get_pool_info` - Get liquidity pool details
- `poll_transaction` - Check transaction status

### Configuration Tools
- `get_config` - Get configuration settings
- `update_config` - Update settings
- `get_pools` - Get default pools
- `add_pool` - Add default pool

### Token Tools
- `list_tokens` - List available tokens
- `search_tokens` - Search for tokens
- `get_token` - Get token details
- `add_token` - Add custom token

## Configuration Options

### Scope Options
- **Local** (default): Available in current project only
- **User**: Available across all your projects  
- **Project**: Shared with team via `.mcp.json`

```bash
# User scope
claude mcp add --scope user gateway node -- /path/to/gateway/dist/mcp/index.js --tools=dynamic \
  -e GATEWAY_URL=$GATEWAY_URL

# Project scope (creates .mcp.json)
claude mcp add --scope project gateway node -- /path/to/gateway/dist/mcp/index.js --tools=dynamic \
  -e GATEWAY_URL=$GATEWAY_URL
```

### Environment Variables
- `GATEWAY_URL`: Gateway server URL (default: http://localhost:15888)
- `--tools`: "dynamic" for 3-tool mode (omit for all tools)

## MCP Architecture Comparison

### Dynamic Tools Architecture
```
User Request → list_gateway_tools → get_tool_schema → invoke_gateway_tool → Gateway API
              ↓                    ↓                   ↓
              (Discover tools)     (Get parameters)    (Execute with args)
```

### All Tools Architecture  
```
User Request → Specific Tool (e.g., execute_swap) → Gateway API
              ↓
              (Direct execution with known schema)
```

## Troubleshooting

### Connection Issues
- Verify Gateway is running: `curl http://localhost:15888/`
- Check GATEWAY_URL environment variable
- Ensure firewall allows connection

### Tool Discovery Issues
- Use `/mcp` command to refresh connection
- Check server status with `claude mcp get gateway`
- Restart server: Remove and re-add

### Authentication Errors
- Ensure wallets are properly configured in Gateway
- Check wallet private keys are valid
- Verify network selection matches wallet

## Best Practices

1. **Start with Dynamic Tools**
   - Easier approval process
   - Good for exploration
   - Switch to all tools for automation

2. **Security**
   - Never expose Gateway publicly
   - Use localhost or secure connection
   - Keep wallet keys secure

3. **Performance**
   - Cache frequently used data
   - Use specific tools when known
   - Monitor Gateway logs

4. **Error Handling**
   - Check transaction status before retry
   - Handle network timeouts gracefully
   - Validate inputs before execution

## Example Workflows

### DEX Trading Workflow
```javascript
// 1. Find available DEXs
list_gateway_tools({ category: "trading" })

// 2. Get price quote
invoke_gateway_tool({
  tool_name: "quote_swap",
  arguments: {
    connector: "uniswap",
    network: "mainnet",
    baseToken: "ETH",
    quoteToken: "USDC",
    amount: 1,
    side: "SELL"
  }
})

// 3. Execute swap if price is good
invoke_gateway_tool({
  tool_name: "execute_swap",
  arguments: {
    connector: "uniswap",
    network: "mainnet",
    walletAddress: "0x...",
    baseToken: "ETH", 
    quoteToken: "USDC",
    amount: "1",
    side: "SELL",
    slippagePct: 1
  }
})

// 4. Monitor transaction
invoke_gateway_tool({
  tool_name: "poll_transaction",
  arguments: {
    chain: "ethereum",
    network: "mainnet",
    signature: "0x..."
  }
})
```

### Portfolio Management
```javascript
// 1. List wallets
invoke_gateway_tool({
  tool_name: "wallet_list",
  arguments: {}
})

// 2. Check balances across chains
invoke_gateway_tool({
  tool_name: "get_balances",
  arguments: {
    chain: "ethereum",
    network: "mainnet",
    address: "0x..."
  }
})

// 3. Search for tokens
invoke_gateway_tool({
  tool_name: "search_tokens",
  arguments: {
    search: "USDC",
    chain: "ethereum"
  }
})
```

## Resources & Prompts

The Gateway MCP server also provides:

### Resources
- Token lists for each network
- Configuration templates
- API documentation

### Prompts (Agents)
- `transaction_executor` - Execute and monitor transactions
- `swap_optimizer` - Find best swap routes
- `portfolio_monitor` - Monitor wallet portfolio
- `token_analyzer` - Analyze token liquidity

## Additional Resources

- [Gateway Documentation](https://github.com/hummingbot/gateway)
- [MCP Protocol Specification](https://modelcontextprotocol.io)
- [Claude Code MCP Documentation](https://docs.anthropic.com/en/docs/claude-code/mcp)

## Security Notes

- Gateway MCP server runs locally only
- Never expose Gateway to public internet
- Keep wallet private keys secure
- Monitor transaction logs regularly
- Use test networks for development