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
  version: "2.7.0",
  capabilities: {
    resources: {},
    tools: {},
    prompts: {}
  },
});
```

## Tool Implementations

### 1. Wallet Management Tools

#### `wallet_add`
```typescript
server.tool(
  "wallet_add",
  "Add a new wallet for a blockchain network",
  {
    chain: z.enum(["ethereum", "solana", "polygon", "avalanche", "arbitrum"]),
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
    chain: z.enum(["ethereum", "solana", "polygon", "avalanche", "arbitrum"]).optional()
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

### 2. Price Discovery Tools

#### `get_price`
```typescript
server.tool(
  "get_price",
  "Get current price and liquidity information for a trading pair",
  {
    connector: z.string().describe("DEX connector (jupiter, meteora, raydium, uniswap)"),
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

### 3. Trading Tools

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

### 4. Balance Tools

#### `get_balances`
```typescript
server.tool(
  "get_balances",
  "Get token balances for a wallet",
  {
    chain: z.enum(["ethereum", "solana", "polygon", "avalanche", "arbitrum"]),
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

### 5. Gas Management Tools

#### `estimate_gas`
```typescript
server.tool(
  "estimate_gas",
  "Estimate gas costs for a transaction",
  {
    chain: z.enum(["ethereum", "solana", "polygon", "avalanche", "arbitrum"]),
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
    const dexConnectors = chain === "solana" 
      ? ["jupiter", "meteora", "raydium"]
      : ["uniswap", "sushiswap", "pancakeswap"];
    
    const prompt = `You are a Swap Optimizer agent with access to Gateway MCP tools.

Task: Find the best swap route for:
- Input: ${amountIn} ${tokenIn}
- Output: ${tokenOut}
- Chain: ${chain}
- Network: ${network}

Available DEXs: ${dexConnectors.join(", ")}

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
  "version": "2.7.0",
  "description": "Gateway MCP server for DEX and blockchain operations",
  "main": "dist/mcp/index.js",
  "bin": {
    "gateway-mcp": "dist/mcp/index.js"
  },
  "mcp": {
    "transport": "stdio",
    "env": {
      "ANTHROPIC_API_KEY": {
        "required": true,
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
- **Standalone**: Run as separate MCP server process
- **Integrated**: Include MCP endpoints in main Gateway server
- **Docker**: Create MCP-specific Docker image

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