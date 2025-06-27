# CoinGecko MCP Server Setup Guide

## Overview

The CoinGecko MCP server provides access to comprehensive cryptocurrency data through the Model Context Protocol (MCP). This guide explains how to configure and use the server with dynamic tools for simplified approval.

## Dynamic Tools vs All Tools

The CoinGecko MCP server offers two modes of operation:

### 1. **Dynamic Tools Mode** (Recommended)
- **Tools Required**: Only 3 tools to approve
  - `list_api_endpoints` - Discover available endpoints
  - `get_api_endpoint_schema` - Get endpoint details
  - `invoke_api_endpoint` - Execute endpoints
- **Benefits**: 
  - Simplified approval process
  - Full API access through dynamic discovery
  - Reduced context usage
  - Flexible exploration of the API

### 2. **All Tools Mode** 
- **Tools Required**: 40+ individual endpoint tools
- **Benefits**:
  - Direct access to specific endpoints
  - More precise schema validation
  - Better for known, repetitive tasks

## Installation and Setup

### Prerequisites
- Claude Code installed
- CoinGecko API key (Demo or Pro)
  - Demo API: Free tier, uses `api.coingecko.com`
  - Pro API: Paid tier, uses `pro-api.coingecko.com`

### Step 1: Set Environment Variable

```bash
# Export your CoinGecko Demo API key
export COINGECKO_DEMO_API_KEY="your-demo-api-key"
```

### Step 2: Add MCP Server with Dynamic Tools

```bash
# Add with dynamic tools (3 tools only)
claude mcp add coingecko npx -- @coingecko/coingecko-mcp@latest --tools=dynamic \
  -e COINGECKO_DEMO_API_KEY=$COINGECKO_DEMO_API_KEY
```

### Step 3: Add MCP Server with All Tools

```bash
# Add with all tools (40+ individual tools)
claude mcp add coingecko npx -- @coingecko/coingecko-mcp@latest \
  -e COINGECKO_DEMO_API_KEY=$COINGECKO_DEMO_API_KEY
```

## Switching Between Modes

### From Dynamic to All Tools
```bash
# Remove current configuration
claude mcp remove coingecko

# Add with all tools
claude mcp add coingecko npx -- @coingecko/coingecko-mcp@latest \
  -e COINGECKO_DEMO_API_KEY=$COINGECKO_DEMO_API_KEY
```

### From All Tools to Dynamic
```bash
# Remove current configuration
claude mcp remove coingecko

# Add with dynamic tools
claude mcp add coingecko npx -- @coingecko/coingecko-mcp@latest --tools=dynamic \
  -e COINGECKO_DEMO_API_KEY=$COINGECKO_DEMO_API_KEY
```

## Usage Examples

### With Dynamic Tools Mode

1. **Discover Available Endpoints**
   ```
   Use the list_api_endpoints tool to search for "price" endpoints
   ```

2. **Get Endpoint Details**
   ```
   Use get_api_endpoint_schema for the "get_simple_price" endpoint
   ```

3. **Execute API Calls**
   ```
   Use invoke_api_endpoint to get ETH price in USD:
   - endpoint_name: get_simple_price
   - args: {"ids": "ethereum", "vs_currencies": "usd"}
   ```

### With All Tools Mode

Direct access to specific tools:
```
Use get_simple_price to fetch ETH price with these parameters:
- ids: "ethereum"
- vs_currencies: "usd"
```

## Common Operations

### Get Token Prices
```python
# Dynamic mode
invoke_api_endpoint(
  endpoint_name="get_simple_price",
  args={
    "ids": "bitcoin,ethereum",
    "vs_currencies": "usd,eur"
  }
)

# All tools mode
get_simple_price(
  ids="bitcoin,ethereum",
  vs_currencies="usd,eur"
)
```

### Get Market Data
```python
# Dynamic mode
invoke_api_endpoint(
  endpoint_name="get_coins_markets",
  args={
    "vs_currency": "usd",
    "order": "market_cap_desc",
    "per_page": 10
  }
)
```

### Search Trending Pools
```python
# Dynamic mode
invoke_api_endpoint(
  endpoint_name="get_network_networks_onchain_trending_pools",
  args={
    "network": "solana",
    "duration": "24h",
    "include": "base_token,quote_token,dex"
  }
)
```

## Configuration Options

### Scope Options
- **Local** (default): Available in current project only
- **User**: Available across all your projects
- **Project**: Shared with team via `.mcp.json`

```bash
# User scope
claude mcp add --scope user coingecko npx -- @coingecko/coingecko-mcp@latest --tools=dynamic \
  -e COINGECKO_DEMO_API_KEY=$COINGECKO_DEMO_API_KEY

# Project scope (creates .mcp.json)
claude mcp add --scope project coingecko npx -- @coingecko/coingecko-mcp@latest --tools=dynamic \
  -e COINGECKO_DEMO_API_KEY=$COINGECKO_DEMO_API_KEY
```

### Environment Variables
- `COINGECKO_DEMO_API_KEY`: Your demo API key
- `COINGECKO_PRO_API_KEY`: Your pro API key (for paid tier)
- `--tools`: "dynamic" for 3-tool mode (omit for all tools)

## MCP Architecture Comparison

### Dynamic Tools Architecture
```
User Request → list_api_endpoints → get_api_endpoint_schema → invoke_api_endpoint → API Response
              ↓                    ↓                          ↓
              (Search/Filter)      (Get Schema)              (Execute with params)
```

### All Tools Architecture
```
User Request → Specific Tool (e.g., get_simple_price) → API Response
              ↓
              (Direct execution with known schema)
```

## Troubleshooting

### Authentication Errors
- Verify API key is correct
- Check environment matches key type (demo vs pro)
- Demo keys use `api.coingecko.com`
- Pro keys use `pro-api.coingecko.com`

### Tool Discovery Issues
- Use `/mcp` command to refresh connection
- Check server status with `claude mcp get coingecko`
- Restart server: Remove and re-add

### Rate Limiting
- Demo API: 10-30 calls/minute
- Pro API: Higher limits based on plan
- Monitor usage in CoinGecko dashboard

## Best Practices

1. **Start with Dynamic Tools**
   - Easier approval process
   - Good for exploration
   - Switch to all tools once you know specific endpoints

2. **Cache Common Queries**
   - Store frequently used endpoint names
   - Document successful query patterns

3. **Error Handling**
   - Check rate limits before bulk operations
   - Handle authentication failures gracefully

4. **Performance Tips**
   - Use specific endpoints when known
   - Batch requests when possible
   - Monitor API credit usage

## Example Workflow

### Price Monitoring with Dynamic Tools
```javascript
// 1. Find price endpoints
list_api_endpoints({ search_query: "price" })

// 2. Get schema for simple price
get_api_endpoint_schema({ endpoint: "get_simple_price" })

// 3. Monitor multiple tokens
invoke_api_endpoint({
  endpoint_name: "get_simple_price",
  args: {
    ids: "bitcoin,ethereum,solana",
    vs_currencies: "usd",
    include_24hr_change: true,
    include_market_cap: true
  }
})
```

### DEX Pool Analysis
```javascript
// 1. Find pool endpoints
list_api_endpoints({ search_query: "pool" })

// 2. Get trending pools on Solana
invoke_api_endpoint({
  endpoint_name: "get_network_networks_onchain_trending_pools",
  args: {
    network: "solana",
    duration: "24h",
    include: "base_token,quote_token,dex",
    page: 1
  }
})
```

## Additional Resources

- [CoinGecko API Documentation](https://docs.coingecko.com)
- [MCP Server Repository](https://github.com/coingecko/coingecko-typescript/tree/main/packages/mcp-server)
- [Claude Code MCP Documentation](https://docs.anthropic.com/en/docs/claude-code/mcp)

## Security Notes

- Never commit API keys to version control
- Use environment variables for sensitive data
- Consider using separate keys for development/production
- Monitor API usage regularly