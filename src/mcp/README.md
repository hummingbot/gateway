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

### 2. Start Gateway server
```bash
pnpm start --passphrase=YOUR_PASSPHRASE
```

### 3. Configure MCP Client

#### Option A: Claude Code (Recommended for developers)

Add the Gateway MCP server using the claude command:

```bash
# Basic setup (stdio transport - default)
claude mcp add gateway /absolute/path/to/gateway/dist/mcp/index.js

# With environment variable for Gateway URL
claude mcp add gateway -e GATEWAY_URL=http://localhost:15888 -- /absolute/path/to/gateway/dist/mcp/index.js

# With custom Gateway port
claude mcp add gateway -e GATEWAY_URL=http://localhost:8080 -- /absolute/path/to/gateway/dist/mcp/index.js
```

Configuration scopes:
```bash
# Local scope (default - current project only)
claude mcp add gateway /absolute/path/to/gateway/dist/mcp/index.js

# User scope (available in all projects)
claude mcp add --user gateway /absolute/path/to/gateway/dist/mcp/index.js

# Project scope (shared via .mcp.json)
claude mcp add --project gateway /absolute/path/to/gateway/dist/mcp/index.js
```

Managing the server:
```bash
# List all configured servers
claude mcp list

# Get details for Gateway server
claude mcp get gateway

# Remove Gateway server
claude mcp remove gateway
```

For project-wide configuration, `.mcp.json` will be created automatically when using `--project` flag, or you can create it manually:
```json
{
  "mcpServers": {
    "gateway": {
      "command": "/absolute/path/to/gateway/dist/mcp/index.js",
      "args": [],
      "env": {
        "GATEWAY_URL": "http://localhost:15888"
      }
    }
  }
}
```

#### Option B: Claude Desktop

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

### 4. Verify Connection

#### In Claude Code:
```bash
# Check server details
claude mcp get gateway

# Or use the /mcp command in chat
/mcp
```

#### In Claude Desktop:
Restart Claude Desktop and the MCP server will automatically connect.

## Quick Start (Claude Code)

```bash
# 1. Build MCP server
cd /path/to/gateway
pnpm mcp:build

# 2. Start Gateway
pnpm start --passphrase=YOUR_PASSPHRASE

# 3. Add to Claude Code (in your project directory)
cd /path/to/your/trading/project
claude mcp add gateway -e GATEWAY_URL=http://localhost:15888 -- /path/to/gateway/dist/mcp/index.js

# 4. Test in Claude Code
# Type: "Use the gateway MCP to show me available chains"
# Or: "List all DEX connectors using gateway"
```

To use in Claude Code after setup:
- Use `/mcp` command to check server status
- Mention "gateway" or "gateway MCP" in your requests to use the tools
- Example: "Using the gateway MCP, what chains are available?"

## Available Tools

### `get_chains`
Returns available blockchain networks from the Gateway API.

Example usage in Claude Code:
- "What chains are available in Gateway?"
- "Use the gateway MCP to list all supported blockchains"

### `get_connectors` 
Returns available DEX connectors, optionally filtered by chain.

Example usage:
- "Show me all DEX connectors"
- "What connectors are available for Solana?"

### `wallet_list`
Lists wallets stored in the Gateway, optionally filtered by chain.

Example usage:
- "List all my wallets"
- "Show me my Ethereum wallets using the gateway MCP"

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