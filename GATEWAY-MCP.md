# Gateway MCP Server Implementation Plan

## Overview
Transform Hummingbot Gateway into a Model Context Protocol (MCP) server that exposes trading, wallet, and blockchain operations as tools and agents. This enables AI-powered trading through any MCP-compatible client.

## Architecture

### MCP Server Setup
- **Location**: `gateway/src/mcp/`
- **Entry Point**: `gateway/src/mcp/index.ts`
- **Transport**: stdio (standard input/output)
- **Dependencies**:
  ```json
  {
    "@modelcontextprotocol/sdk": "latest",
    "zod": "^3.22.0"
  }
  ```

### Server Configuration
```typescript
// gateway/src/mcp/index.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server({
  name: "hummingbot-gateway",
  version: "2.8.0",
  capabilities: {
    resources: {},
    tools: {},
    prompts: {}
  },
});
```

## Tool Implementations

### 1. Discovery Tools

#### `get_chains`
```typescript
server.tool(
  "get_chains",
  "Get available blockchain networks and their configurations",
  {},
  async () => {
    const configManager = ConfigManagerV2.getInstance();
    const chains = configManager.listChains();
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          chains: chains.map(chain => ({
            name: chain.name,
            networks: chain.networks,
            nativeCurrency: chain.nativeCurrency,
            chainId: chain.chainId
          }))
        })
      }]
    };
  }
);
```

#### `get_connectors`
```typescript
server.tool(
  "get_connectors",
  "Get available DEX connectors and their supported chains",
  {
    chain: z.string().optional().describe("Filter connectors by chain")
  },
  async ({ chain }) => {
    const configManager = ConfigManagerV2.getInstance();
    const connectors = configManager.listConnectors(chain);
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          connectors: connectors.map(conn => ({
            name: conn.name,
            supportedChains: conn.supportedChains,
            type: conn.type, // 'amm', 'clmm', 'swap'
            description: conn.description
          }))
        })
      }]
    };
  }
);
```

### 2. Wallet Management Tools

#### `wallet_add`
```typescript
server.tool(
  "wallet_add",
  "Add a new wallet for a blockchain network",
  {
    chain: z.string().describe("Blockchain network (use get_chains to see available)"),
    privateKey: z.string().describe("Private key in hex format"),
    name: z.string().optional().describe("Optional wallet label")
  },
  async ({ chain, privateKey, name }) => {
    const walletService = WalletService.getInstance();
    const result = await walletService.add({
      chain,
      privateKey,
      accountName: name
    });
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          address: result.address,
          chain: chain,
          message: `Wallet ${result.address} added successfully`
        })
      }]
    };
  }
);
```

#### `wallet_list`
```typescript
server.tool(
  "wallet_list",
  "List all wallets or filter by chain",
  {
    chain: z.string().optional().describe("Filter by chain (use get_chains to see available)")
  },
  async ({ chain }) => {
    const walletService = WalletService.getInstance();
    const wallets = await walletService.list(chain);
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          wallets: wallets.map(w => ({
            address: w.address,
            chain: w.chain,
            name: w.accountName
          }))
        })
      }]
    };
  }
);
```

### 3. Price Discovery Tools

#### `get_price`
```typescript
server.tool(
  "get_price",
  "Get current price and liquidity information for a trading pair",
  {
    connector: z.string().describe("DEX connector (use get_connectors to see available)"),
    network: z.string().describe("Network name (mainnet, testnet, etc)"),
    tokenPair: z.string().describe("Trading pair (e.g., ETH-USDT)"),
    amount: z.number().optional().describe("Amount for price impact calculation"),
    side: z.enum(["buy", "sell"]).optional()
  },
  async ({ connector, network, tokenPair, amount, side }) => {
    const [base, quote] = tokenPair.split('-');
    const dex = await getConnector(connector, network);
    
    const priceResponse = await dex.price({
      base,
      quote,
      amount: amount?.toString(),
      side
    });
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          price: priceResponse.price,
          base: priceResponse.base,
          quote: priceResponse.quote,
          amount: priceResponse.amount,
          expectedAmount: priceResponse.expectedAmount,
          priceImpact: priceResponse.priceImpact,
          gasPrice: priceResponse.gasPriceInNetwork,
          gasLimit: priceResponse.gasLimit,
          connector,
          network
        })
      }]
    };
  }
);
```

### 4. Trading Tools

#### `execute_swap`
```typescript
server.tool(
  "execute_swap",
  "Execute a token swap on a DEX",
  {
    connector: z.string(),
    network: z.string(),
    walletAddress: z.string(),
    tokenIn: z.string().describe("Input token symbol"),
    tokenOut: z.string().describe("Output token symbol"),
    amountIn: z.string().describe("Amount to swap"),
    slippage: z.number().default(1).describe("Slippage tolerance in percent"),
    maxPriorityFeePerGas: z.number().optional().describe("Max priority fee in Gwei for EVM chains")
  },
  async ({ connector, network, walletAddress, tokenIn, tokenOut, amountIn, slippage, maxPriorityFeePerGas }) => {
    const dex = await getConnector(connector, network);
    
    const swapResponse = await dex.trade({
      walletAddress,
      base: tokenIn,
      quote: tokenOut,
      amount: amountIn,
      side: "sell",
      slippage: slippage / 100,
      maxPriorityFeePerGas
    });
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          txHash: swapResponse.txHash,
          tokenIn: swapResponse.base,
          tokenOut: swapResponse.quote,
          amountIn: swapResponse.amount,
          expectedOut: swapResponse.expectedOut,
          executedPrice: swapResponse.executedPrice,
          gasUsed: swapResponse.gasUsed,
          gasCost: swapResponse.gasCost,
          status: "submitted"
        })
      }]
    };
  }
);
```

### 5. Balance Tools

#### `get_balances`
```typescript
server.tool(
  "get_balances",
  "Get token balances for a wallet",
  {
    chain: z.string().describe("Blockchain network (use get_chains to see available)"),
    network: z.string(),
    address: z.string().describe("Wallet address"),
    tokenSymbols: z.array(z.string()).optional().describe("Filter by specific tokens")
  },
  async ({ chain, network, address, tokenSymbols }) => {
    const chainInstance = await getChain(chain, network);
    const balances = await chainInstance.getBalances({
      walletAddress: address,
      tokenSymbols
    });
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          address,
          chain,
          network,
          balances: Object.entries(balances).map(([token, balance]) => ({
            token,
            balance: balance.toString(),
            // Include USD value if available
          }))
        })
      }]
    };
  }
);
```

### 6. Gas Management Tools

#### `estimate_gas`
```typescript
server.tool(
  "estimate_gas",
  "Estimate gas costs for a transaction",
  {
    chain: z.string().describe("Blockchain network (use get_chains to see available)"),
    network: z.string(),
    txType: z.enum(["swap", "transfer", "approve"]).default("swap")
  },
  async ({ chain, network, txType }) => {
    const chainInstance = await getChain(chain, network);
    const gasPrice = await chainInstance.getGasPrice();
    
    // Get appropriate gas limit based on transaction type
    const gasLimits = {
      swap: chain === "solana" ? 200000 : 250000,
      transfer: chain === "solana" ? 50000 : 21000,
      approve: chain === "solana" ? 0 : 50000
    };
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          chain,
          network,
          gasPrice: gasPrice.gasPriceInNetwork,
          gasLimit: gasLimits[txType],
          estimatedCost: chain === "solana" 
            ? `${gasPrice.gasPriceInNetwork} lamports/CU`
            : `${gasPrice.gasPriceInNetwork} Gwei`,
          denomination: chain === "solana" ? "lamports" : "gwei"
        })
      }]
    };
  }
);
```

## Prompt Resources (Agents)

### 1. Transaction Executor Agent
```typescript
server.prompt(
  "transaction_executor",
  "Execute and monitor blockchain transactions with automatic retry and gas optimization",
  {
    transaction: z.object({
      type: z.string(),
      params: z.record(z.any())
    }).describe("Transaction details to execute")
  },
  async ({ transaction }) => {
    const prompt = `You are a Transaction Executor agent with access to Gateway MCP tools.

Your task is to execute the following transaction: ${JSON.stringify(transaction)}

Available tools:
- estimate_gas: Get current gas prices
- execute_swap: Perform token swaps
- get_transaction_status: Check transaction status

Follow these steps:
1. Estimate gas costs using estimate_gas
2. Execute the transaction with appropriate gas settings
3. Monitor the transaction status
4. If transaction fails or is stuck, retry with higher gas
5. Report final status

Environment variable ANTHROPIC_API_KEY is available for using Claude to help with execution logic.

Important considerations:
- For Solana, priorityFeePerCU is in lamports per compute unit
- For Ethereum/EVM, priorityFeePerCU is in Gwei
- Always check transaction status before retrying
- Implement exponential backoff for retries`;

    return {
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    };
  }
);
```

### 2. Swap Optimizer Agent
```typescript
server.prompt(
  "swap_optimizer",
  "Find the best swap route across multiple DEXs",
  {
    tokenIn: z.string(),
    tokenOut: z.string(),
    amountIn: z.string(),
    chain: z.string(),
    network: z.string()
  },
  async ({ tokenIn, tokenOut, amountIn, chain, network }) => {
    const prompt = `You are a Swap Optimizer agent with access to Gateway MCP tools.

Task: Find the best swap route for:
- Input: ${amountIn} ${tokenIn}
- Output: ${tokenOut}
- Chain: ${chain}
- Network: ${network}

First, use the get_connectors tool to find available DEXs for ${chain}, then compare prices across all compatible connectors.

Use the get_price tool to:
1. Query prices from all available DEXs
2. Calculate price impact for each route
3. Consider gas costs in the total cost
4. Return the optimal route with reasoning

Format your response as:
- Best DEX: [name]
- Expected output: [amount]
- Price impact: [percentage]
- Total cost (including gas): [amount]
- Reasoning: [explanation]`;

    return {
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    };
  }
);
```

### 3. Portfolio Monitor Agent
```typescript
server.prompt(
  "portfolio_monitor",
  "Monitor and analyze wallet portfolio",
  {
    walletAddress: z.string(),
    chains: z.array(z.string()),
    targetAllocations: z.record(z.number()).optional().describe("Target allocations by token symbol")
  },
  async ({ walletAddress, chains, targetAllocations }) => {
    const prompt = `You are a Portfolio Monitor agent with access to Gateway MCP tools.

Monitor the portfolio for wallet: ${walletAddress}
Chains to monitor: ${chains.join(", ")}
${targetAllocations ? `Target allocations: ${JSON.stringify(targetAllocations)}` : ''}

Available tools:
- get_balances: Check token balances
- get_price: Get current token prices
- wallet_list: List available wallets

Tasks:
1. Get current balances across all specified chains
2. Calculate USD values using current prices
3. Analyze portfolio composition
${targetAllocations ? '4. Compare against target allocations and suggest rebalancing trades' : ''}
5. Identify concentration risks
6. Provide recommendations

Return a comprehensive portfolio analysis.`;

    return {
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    };
  }
);
```

### 4. Token Analyzer Agent
```typescript
server.prompt(
  "token_analyzer",
  "Analyze token information and liquidity",
  {
    tokenIdentifier: z.string().describe("Token symbol or contract address"),
    chain: z.string(),
    network: z.string()
  },
  async ({ tokenIdentifier, chain, network }) => {
    const prompt = `You are a Token Analyzer agent with access to Gateway MCP tools.

Analyze the following token:
- Identifier: ${tokenIdentifier}
- Chain: ${chain}
- Network: ${network}

Available tools:
- get_token_list: Get verified token information
- get_price: Check token prices and liquidity
- get_balances: Check token distribution

Perform the following analysis:
1. Verify token contract and get metadata
2. Check liquidity across different DEXs
3. Calculate price impact for various trade sizes
4. Analyze price differences between venues
5. Provide risk assessment

Return a comprehensive token analysis report.`;

    return {
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    };
  }
);
```

## Resource Providers

### 1. Token Lists
```typescript
server.resource(
  "token-list/*",
  "Get token list for a specific network",
  async ({ url }) => {
    const [, , chain, network] = url.split('/');
    const tokenList = await TokenListService.getInstance().getTokenList(chain, network);
    
    return {
      contents: [{
        uri: url,
        mimeType: "application/json",
        text: JSON.stringify(tokenList)
      }]
    };
  }
);
```

### 2. Configuration Templates
```typescript
server.resource(
  "config-template/*",
  "Get configuration templates for connectors",
  async ({ url }) => {
    const [, , connector] = url.split('/');
    const template = await ConfigService.getTemplate(connector);
    
    return {
      contents: [{
        uri: url,
        mimeType: "application/yaml",
        text: template
      }]
    };
  }
);
```

## Implementation Structure

### Directory Layout
```
gateway/
├── src/
│   ├── mcp/
│   │   ├── index.ts           # MCP server entry point
│   │   ├── tools/             # Tool implementations
│   │   │   ├── wallet.ts
│   │   │   ├── trading.ts
│   │   │   ├── balance.ts
│   │   │   └── gas.ts
│   │   ├── prompts/           # Agent prompt definitions
│   │   │   ├── executor.ts
│   │   │   ├── optimizer.ts
│   │   │   ├── monitor.ts
│   │   │   └── analyzer.ts
│   │   ├── resources/         # Resource providers
│   │   │   ├── tokens.ts
│   │   │   └── configs.ts
│   │   └── utils/            # MCP utilities
│   │       ├── validation.ts
│   │       └── errors.ts
│   └── ...existing gateway code...
├── package.json               # Add MCP dependencies
└── mcp.json                  # MCP server manifest
```

### MCP Server Manifest
```json
{
  "name": "hummingbot-gateway",
  "version": "2.8.0",
  "description": "Gateway MCP server for DEX and blockchain operations",
  "main": "dist/mcp/index.js",
  "bin": {
    "gateway-mcp": "dist/mcp/index.js"
  },
  "mcp": {
    "transport": "stdio",
    "env": {
      "ANTHROPIC_API_KEY": {
        "required": false,
        "description": "API key for Claude access in agent prompts"
      }
    }
  }
}
```

### Package.json Updates
```json
{
  "scripts": {
    "build:mcp": "tsc -p tsconfig.mcp.json",
    "start:mcp": "node dist/mcp/index.js",
    "dev:mcp": "tsx src/mcp/index.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.22.0"
  }
}
```

### TypeScript Configuration (tsconfig.mcp.json)
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist/mcp",
    "rootDir": "./src/mcp"
  },
  "include": ["src/mcp/**/*"]
}
```

## Integration with Existing Gateway

### 1. Service Adapters
Create adapters to bridge MCP tools with existing Gateway services:

```typescript
// src/mcp/adapters/connector-adapter.ts
export async function getConnector(name: string, network: string) {
  const config = ConfigManagerV2.getInstance().getConnectorConfig(name, network);
  return ConnectorFactory.create(name, config);
}

// src/mcp/adapters/chain-adapter.ts
export async function getChain(name: string, network: string) {
  return ChainFactory.getInstance(name, network);
}
```

### 2. Error Handling
Standardize errors for MCP responses:

```typescript
// src/mcp/utils/errors.ts
export function handleMCPError(error: any) {
  if (error instanceof ValidationError) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: "validation_error",
          message: error.message,
          details: error.details
        })
      }]
    };
  }
  // Handle other error types
}
```

### 3. Authentication
Use existing Gateway authentication for MCP operations:

```typescript
// src/mcp/utils/auth.ts
export async function validateMCPRequest(request: any) {
  // Leverage existing Gateway auth mechanisms
  // Ensure wallet operations are properly authenticated
}
```

## Development Workflow

### 1. Local Development
```bash
# Install dependencies
pnpm install

# Build MCP server
pnpm build:mcp

# Run in development mode
pnpm dev:mcp

# Test with MCP Inspector
npx @modelcontextprotocol/inspector dist/mcp/index.js
```

### 2. Testing Tools
```bash
# Test individual tools
echo '{"method": "tools/call", "params": {"name": "wallet_list"}}' | pnpm start:mcp

# Test with Claude Desktop
# Add to claude_desktop_config.json:
{
  "mcpServers": {
    "gateway": {
      "command": "/path/to/gateway/dist/mcp/index.js",
      "env": {
        "ANTHROPIC_API_KEY": "your-api-key"
      }
    }
  }
}
```

### 3. Deployment Options

#### Option 1: Claude Code Integration (Recommended for developers)

Add MCP server to Claude Code:
```bash
# Local scope (current project only)
claude mcp add gateway /path/to/gateway/dist/mcp/index.js -e GATEWAY_URL=http://localhost:15888

# User scope (available in all projects)
claude mcp add --user gateway /path/to/gateway/dist/mcp/index.js -e GATEWAY_URL=http://localhost:15888

# Project scope (shared via .mcp.json)
claude mcp add --project gateway /path/to/gateway/dist/mcp/index.js -e GATEWAY_URL=http://localhost:15888
```

Manage MCP servers:
```bash
# List all servers
claude mcp list

# Get server details
claude mcp get gateway

# Remove server
claude mcp remove gateway
```

#### Option 2: Claude Desktop Integration

Add to Claude Desktop config:
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

#### Option 3: Project Configuration (.mcp.json)

For team collaboration, add `.mcp.json` to your project:
```json
{
  "mcpServers": {
    "gateway": {
      "command": "./node_modules/@hummingbot/gateway-mcp/dist/index.js",
      "args": [],
      "env": {
        "GATEWAY_URL": "http://localhost:15888"
      }
    }
  }
}
```

#### Option 4: MCP Inspector (Development)
```bash
# For testing and debugging
npx @modelcontextprotocol/inspector dist/mcp/index.js
```

Note: The MCP server communicates via stdio protocol, not HTTP. It requires an MCP client to connect to it.

## Security Considerations

### 1. API Key Management
- Store `ANTHROPIC_API_KEY` securely
- Never expose in logs or responses
- Use environment variables only

### 2. Wallet Security
- Private keys handled by existing Gateway security
- MCP never exposes raw private keys
- All signing happens within Gateway

### 3. Rate Limiting
- Implement per-tool rate limits
- Monitor usage patterns
- Prevent abuse of trading tools

## Test Plan for Evaluation

### 1. Setup and Prerequisites

#### Environment Setup
```bash
# 1. Build the MCP server
pnpm mcp:build

# 2. Create test wallets directory (if not exists)
mkdir -p conf/wallets/ethereum
mkdir -p conf/wallets/solana

# 3. Create mock wallet files for testing
echo '{"address": "0x1234..."}' > conf/wallets/ethereum/0x1234567890abcdef.json
echo '{"address": "So1..."}' > conf/wallets/solana/So11111111111111111111111111111111111111112.json
```

#### Test Harness Script
Create `test-mcp.sh`:
```bash
#!/bin/bash
# MCP Test Harness for Gateway

MCP_SERVER="node dist/mcp/index.js"
TEST_OUTPUT_DIR="./mcp-test-results"
mkdir -p $TEST_OUTPUT_DIR

# Function to send JSON-RPC request and save response
test_tool() {
    local test_name=$1
    local json_request=$2
    local output_file="$TEST_OUTPUT_DIR/${test_name}.json"
    
    echo "Testing: $test_name"
    echo "$json_request" | $MCP_SERVER 2>/dev/null | jq '.' > "$output_file"
    echo "Result saved to: $output_file"
    echo "---"
}

# Test cases
echo "Starting MCP Gateway Tests..."
```

### 2. Core Functionality Tests

#### Test Suite 1: Discovery Tools
```bash
# Test 1.1: Get available chains
test_tool "get_chains" '{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "get_chains",
    "arguments": {}
  },
  "id": 1
}'

# Test 1.2: Get all connectors
test_tool "get_connectors_all" '{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "get_connectors",
    "arguments": {}
  },
  "id": 2
}'

# Test 1.3: Get connectors for specific chain
test_tool "get_connectors_solana" '{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "get_connectors",
    "arguments": {"chain": "solana"}
  },
  "id": 3
}'
```

#### Test Suite 2: Wallet Operations
```bash
# Test 2.1: List all wallets
test_tool "wallet_list_all" '{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "wallet_list",
    "arguments": {}
  },
  "id": 4
}'

# Test 2.2: List wallets for specific chain
test_tool "wallet_list_ethereum" '{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "wallet_list",
    "arguments": {"chain": "ethereum"}
  },
  "id": 5
}'
```

#### Test Suite 3: Balance Operations (Stub)
```bash
# Test 3.1: Get balance stub
test_tool "get_balance_stub" '{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "get_balance_stub",
    "arguments": {
      "chain": "ethereum",
      "network": "mainnet",
      "address": "0x1234567890abcdef"
    }
  },
  "id": 6
}'
```

### 3. Integration Tests with MCP Inspector

#### Using MCP Inspector
```bash
# Install MCP Inspector
npm install -g @modelcontextprotocol/inspector

# Run interactive tests
npx @modelcontextprotocol/inspector dist/mcp/index.js

# Test sequence in Inspector:
# 1. Connect to server
# 2. List available tools
# 3. Execute each tool with sample parameters
# 4. Verify responses match expected schema
```

### 4. MCP Client Integration Test

#### Option A: Claude Code (Primary)
```bash
# Add MCP server to Claude Code
claude mcp add gateway-test /absolute/path/to/gateway/dist/mcp/index.js \
  -e GATEWAY_URL=http://localhost:15888 \
  -e NODE_ENV=test

# Verify server is added
claude mcp get gateway-test

# Remove when done testing
claude mcp remove gateway-test
```

#### Option B: Claude Desktop
```json
// Add to Claude Desktop config
// macOS: ~/.claude/claude_desktop_config.json
// Windows: %APPDATA%\Claude\claude_desktop_config.json
{
  "mcpServers": {
    "gateway-test": {
      "command": "/absolute/path/to/gateway/dist/mcp/index.js",
      "env": {
        "GATEWAY_URL": "http://localhost:15888",
        "NODE_ENV": "test"
      }
    }
  }
}
```

#### Test Scenarios
1. **Discovery Flow**:
   - "What chains are available in Gateway?"
   - "Show me all DEX connectors for Solana"
   - "Use the gateway MCP server to list available chains"

2. **Wallet Operations**:
   - "List all my wallets using the gateway MCP"
   - "Show me my Ethereum wallets"

3. **Complex Queries**:
   - "What Solana DEXs can I use for trading?"
   - "Check what chains support Uniswap"

4. **Claude Code Specific**:
   - Use `/mcp` to check server status
   - Reference resources: `@gateway:chains` (if implemented)

### 5. Automated Test Runner

Create `run-mcp-tests.js`:
```javascript
const { spawn } from 'child_process';
const fs = require('fs').promises;
const path = require('path');

class MCPTestRunner {
  constructor(serverPath) {
    this.serverPath = serverPath;
    this.results = [];
  }

  async runTest(testName, request) {
    return new Promise((resolve, reject) => {
      const child = spawn('node', [this.serverPath]);
      let response = '';
      let error = '';

      child.stdout.on('data', (data) => {
        response += data.toString();
      });

      child.stderr.on('data', (data) => {
        error += data.toString();
      });

      child.on('close', (code) => {
        this.results.push({
          testName,
          request,
          response: response.trim(),
          error: error.trim(),
          exitCode: code,
          success: code === 0 && response.length > 0
        });
        resolve();
      });

      // Send request
      child.stdin.write(JSON.stringify(request) + '\n');
      child.stdin.end();
    });
  }

  async runAllTests() {
    const tests = [
      {
        name: 'list_tools',
        request: {
          jsonrpc: '2.0',
          method: 'tools/list',
          params: {},
          id: 1
        }
      },
      {
        name: 'get_chains',
        request: {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: { name: 'get_chains', arguments: {} },
          id: 2
        }
      },
      // Add more tests...
    ];

    for (const test of tests) {
      await this.runTest(test.name, test.request);
    }

    // Save results
    await this.saveResults();
  }

  async saveResults() {
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const resultsPath = path.join('mcp-test-results', `test-run-${timestamp}.json`);
    
    await fs.mkdir('mcp-test-results', { recursive: true });
    await fs.writeFile(resultsPath, JSON.stringify(this.results, null, 2));
    
    // Generate summary
    const passed = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;
    
    console.log(`\nTest Results:`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📄 Full results: ${resultsPath}`);
  }
}

// Run tests
const runner = new MCPTestRunner('./dist/mcp/index.js');
runner.runAllTests().catch(console.error);
```

### 6. Performance Benchmarks

Create `benchmark-mcp.js`:
```javascript
const { performance } = require('perf_hooks');

async function benchmarkTool(toolName, iterations = 100) {
  const times = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    // Execute tool call
    const end = performance.now();
    times.push(end - start);
  }
  
  return {
    tool: toolName,
    iterations,
    avgTime: times.reduce((a, b) => a + b) / times.length,
    minTime: Math.min(...times),
    maxTime: Math.max(...times),
    p95: times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)]
  };
}

// Run benchmarks for each tool
```

### 7. Evaluation Metrics

#### Success Criteria
1. **Functional Requirements**:
   - ✅ All tools respond within 500ms
   - ✅ Error responses include actionable messages
   - ✅ Tool discovery works without hard-coded values
   - ✅ Integration with Claude Desktop successful

2. **Performance Metrics**:
   - Response time p95 < 200ms for simple tools
   - Response time p95 < 500ms for complex tools
   - Memory usage < 100MB during normal operation
   - No memory leaks over extended operation

3. **Reliability Metrics**:
   - 100% success rate for valid requests
   - Graceful error handling for invalid inputs
   - Proper cleanup on server shutdown

### 8. Continuous Testing

#### GitHub Action for MCP Tests
```yaml
name: MCP Server Tests
on: [push, pull_request]

jobs:
  test-mcp:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: pnpm install
        
      - name: Build MCP server
        run: pnpm mcp:build
        
      - name: Run MCP tests
        run: node run-mcp-tests.js
        
      - name: Upload test results
        uses: actions/upload-artifact@v3
        with:
          name: mcp-test-results
          path: mcp-test-results/
```

### 9. Manual Testing Checklist

- [ ] MCP server builds without errors
- [ ] Server starts and responds to health check
- [ ] `get_chains` returns expected chains
- [ ] `get_connectors` returns expected connectors
- [ ] `wallet_list` reads wallet files correctly
- [ ] Error handling works for missing parameters
- [ ] Claude Desktop can discover and use the server
- [ ] All tools appear in MCP Inspector
- [ ] Performance meets target metrics
- [ ] No sensitive data exposed in responses

### 10. Test Data Management

#### Sample Test Data
```json
// test-data/chains.json
{
  "expected_response": {
    "chains": [
      {
        "chain": "ethereum",
        "networks": [
          "mainnet",
          "arbitrum",
          "optimism",
          "base",
          "sepolia",
          "bsc",
          "avalanche",
          "celo",
          "polygon",
          "blast",
          "zora",
          "worldchain"
        ]
      },
      {
        "chain": "solana",
        "networks": [
          "mainnet-beta",
          "devnet"
        ]
      }
    ]
  }
}

// test-data/connectors.json
{
  "expected_response": {
    "connectors": [
      {
        "name": "jupiter",
        "trading_types": ["swap"],
        "chain": "solana",
        "networks": ["mainnet-beta", "devnet"]
      },
      {
        "name": "meteora/clmm",
        "trading_types": ["clmm", "swap"],
        "chain": "solana",
        "networks": ["mainnet-beta", "devnet"]
      },
      {
        "name": "raydium/amm",
        "trading_types": ["amm", "swap"],
        "chain": "solana",
        "networks": ["mainnet-beta", "devnet"]
      },
      {
        "name": "raydium/clmm",
        "trading_types": ["clmm", "swap"],
        "chain": "solana",
        "networks": ["mainnet-beta", "devnet"]
      },
      {
        "name": "uniswap",
        "trading_types": ["swap"],
        "chain": "ethereum",
        "networks": ["mainnet"]
      },
      {
        "name": "uniswap/amm",
        "trading_types": ["amm", "swap"],
        "chain": "ethereum",
        "networks": ["mainnet", "arbitrum", "optimism", "base", "sepolia", "bsc", "avalanche", "celo", "polygon", "blast", "zora", "worldchain"]
      },
      {
        "name": "uniswap/clmm",
        "trading_types": ["clmm", "swap"],
        "chain": "ethereum",
        "networks": ["mainnet", "arbitrum", "optimism", "base", "sepolia", "bsc", "avalanche", "celo", "polygon", "blast", "zora", "worldchain"]
      }
    ]
  }
}
```

## Monitoring and Logging

### 1. MCP-Specific Metrics
```typescript
// Track tool usage
logger.info('MCP tool called', {
  tool: toolName,
  params: sanitizedParams,
  duration: executionTime,
  success: result.success
});
```

### 2. Error Tracking
```typescript
// Log MCP errors separately
logger.error('MCP tool error', {
  tool: toolName,
  error: error.message,
  stack: error.stack
});
```

## Future Enhancements

### 1. Additional Tools
- LP position management
- Cross-chain bridge operations
- Advanced order types (TWAP, DCA)
- MEV protection settings

### 2. Enhanced Resources
- Real-time price feeds
- Historical trade data
- Gas price predictions
- Network status monitoring

### 3. Advanced Agents
- Arbitrage detector
- Yield optimizer
- Risk manager
- Strategy backtester

## Success Criteria

1. **Tool Coverage**: All major Gateway operations exposed as MCP tools
2. **Agent Quality**: Prompts provide useful, actionable guidance
3. **Performance**: Tool responses under 500ms for simple operations
4. **Reliability**: 99.9% uptime with proper error handling
5. **Security**: No exposure of sensitive data through MCP interface