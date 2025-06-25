# Gateway MCP Server

The Gateway MCP (Model Context Protocol) server exposes Hummingbot Gateway operations as tools that can be used by AI assistants like Claude.

## Overview

The MCP server provides tools to:
- Query available blockchain networks and DEX connectors
- List and manage wallets
- Check balances (when Gateway is running)
- Execute trades and other DeFi operations (future)

## Setup

### 1. Build the MCP server
```bash
pnpm mcp:build
```

### 2. Configure Claude Desktop

Add to your Claude Desktop configuration file:
- macOS: `~/.claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "gateway": {
      "command": "/absolute/path/to/gateway/dist/mcp/index.js",
      "env": {
        "GATEWAY_URL": "http://localhost:15888"
      }
    }
  }
}
```

### 3. Start Gateway server
```bash
pnpm start --passphrase=YOUR_PASSPHRASE
```

### 4. Restart Claude Desktop
The MCP server will automatically connect when you start a new conversation.

## Available Tools

### `get_chains`
Returns available blockchain networks from the Gateway API.

### `get_connectors` 
Returns available DEX connectors, optionally filtered by chain.

### `wallet_list`
Lists wallets stored in the Gateway, optionally filtered by chain.

### `get_balance_stub`
Placeholder for balance checking (requires full Gateway integration).

## Testing

### With MCP Inspector
```bash
npx @modelcontextprotocol/inspector dist/mcp/index.js
```

### Direct testing
```bash
# List tools
echo '{"jsonrpc": "2.0", "method": "tools/list", "params": {}, "id": 1}' | node dist/mcp/index.js

# Get chains
echo '{"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "get_chains", "arguments": {}}, "id": 1}' | node dist/mcp/index.js
```

## Architecture

The MCP server:
1. Connects to the Gateway API when available
2. Falls back to reading config files when Gateway is offline
3. Provides a consistent interface for AI assistants
4. Returns data in the same format as Gateway API endpoints

## Development

```bash
# Run in development mode (requires tsx)
pnpm mcp:dev

# Run tests
node run-mcp-tests.js

# Validate against Gateway API
node validate-mcp-gateway.js
```