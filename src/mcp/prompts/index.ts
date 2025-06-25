import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListPromptsRequestSchema, GetPromptRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export function registerPrompts(server: Server) {
  // List available prompts
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        {
          name: "swap_optimizer",
          description: "Find the best swap route across multiple DEXs",
          arguments: [
            {
              name: "tokenIn",
              description: "Input token symbol",
              required: true
            },
            {
              name: "tokenOut",
              description: "Output token symbol",
              required: true
            },
            {
              name: "amountIn",
              description: "Amount to swap",
              required: true
            },
            {
              name: "chain",
              description: "Blockchain network",
              required: true
            },
            {
              name: "network",
              description: "Network name",
              required: true
            }
          ]
        },
        {
          name: "portfolio_analyzer",
          description: "Analyze wallet portfolio across chains",
          arguments: [
            {
              name: "walletAddress",
              description: "Wallet address to analyze",
              required: true
            },
            {
              name: "chains",
              description: "Comma-separated list of chains to check",
              required: true
            }
          ]
        },
        {
          name: "liquidity_finder",
          description: "Find best liquidity pools for a token pair",
          arguments: [
            {
              name: "baseToken",
              description: "Base token symbol",
              required: true
            },
            {
              name: "quoteToken",
              description: "Quote token symbol",
              required: true
            },
            {
              name: "chain",
              description: "Blockchain network",
              required: true
            }
          ]
        },
        {
          name: "gas_optimizer",
          description: "Optimize gas settings for transactions",
          arguments: [
            {
              name: "chain",
              description: "Blockchain network",
              required: true
            },
            {
              name: "network",
              description: "Network name",
              required: true
            },
            {
              name: "transactionType",
              description: "Type of transaction (swap, transfer, liquidity)",
              required: true
            }
          ]
        }
      ]
    };
  });

  // Get specific prompt
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const promptName = request.params.name;
    const args = request.params.arguments || {};

    if (promptName === "swap_optimizer") {
      const { tokenIn, tokenOut, amountIn, chain, network } = args;
      
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `You are a DEX swap optimizer with access to Gateway MCP tools.

Task: Find the best swap route for:
- Input: ${amountIn} ${tokenIn}
- Output: ${tokenOut}
- Chain: ${chain}
- Network: ${network}

Instructions:
1. First, use get_connectors to find available DEXs for ${chain}
2. For each compatible DEX, use quote_swap to get quotes
3. Compare all quotes considering:
   - Output amount
   - Price impact
   - Gas costs (use estimate_gas)
   - Total cost including fees
4. Return the optimal route with detailed analysis

Format your response as:
## Best Route
- DEX: [connector name]
- Expected output: [amount] ${tokenOut}
- Price: [price per token]
- Price impact: [percentage]
- Estimated gas: [cost in native token]

## Alternative Routes
[List other options with brief comparison]

## Recommendation
[Explain why this route is optimal]`
            }
          }
        ]
      };
    }

    if (promptName === "portfolio_analyzer") {
      const { walletAddress, chains } = args;
      const chainList = chains.split(',').map((c: string) => c.trim());
      
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `You are a portfolio analyzer with access to Gateway MCP tools.

Task: Analyze the portfolio for wallet: ${walletAddress}
Chains to analyze: ${chainList.join(", ")}

Instructions:
1. For each chain:
   - Use get_status to check network availability
   - Use get_balances to fetch token balances
   - Use get_tokens to get token metadata
2. Calculate total portfolio value (if prices available)
3. Identify:
   - Token distribution across chains
   - Largest holdings
   - Concentration risks
   - Cross-chain opportunities

Format your response as:
## Portfolio Summary
- Total chains: [count]
- Total unique tokens: [count]
- Primary chain: [chain with most value]

## Holdings by Chain
### [Chain Name]
- Native token: [amount]
- Tokens: [list with amounts]
- Estimated value: [if available]

## Analysis
- Concentration: [analysis of diversification]
- Opportunities: [cross-chain arbitrage, yield, etc.]
- Risks: [identified risks]

## Recommendations
[Actionable suggestions for portfolio optimization]`
            }
          }
        ]
      };
    }

    if (promptName === "liquidity_finder") {
      const { baseToken, quoteToken, chain } = args;
      
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `You are a liquidity pool analyzer with access to Gateway MCP tools.

Task: Find the best liquidity pools for ${baseToken}/${quoteToken} on ${chain}

Instructions:
1. Use get_connectors to find DEXs supporting ${chain}
2. For each DEX with AMM or CLMM support:
   - Use get_pool_info to fetch pool details
   - Check liquidity depth
   - Compare fee tiers
   - Analyze price impact for different trade sizes
3. Rank pools by:
   - Total liquidity (TVL)
   - Fee efficiency
   - Price stability
   - Volume/liquidity ratio

Format your response as:
## Top Liquidity Pools

### 1. [DEX Name] - [Pool Type]
- Pool address: [address]
- TVL: [baseToken amount] / [quoteToken amount]
- Fee: [percentage]
- Current price: [price]
- 24h volume: [if available]
- Price impact for $1000 trade: [percentage]

## Comparison Summary
[Table comparing key metrics across pools]

## Recommendations
- Best for small trades: [pool]
- Best for large trades: [pool]
- Best overall: [pool with reasoning]`
            }
          }
        ]
      };
    }

    if (promptName === "gas_optimizer") {
      const { chain, network, transactionType } = args;
      
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `You are a gas optimization expert with access to Gateway MCP tools.

Task: Optimize gas settings for ${transactionType} on ${chain} ${network}

Instructions:
1. Use estimate_gas to get current gas prices
2. Analyze gas requirements for ${transactionType}:
   - Base gas limit needed
   - Priority fee recommendations
   - Total cost estimation
3. Provide optimization strategies:
   - Best time to transact (if patterns exist)
   - Batch transaction opportunities
   - Alternative routes with lower gas
4. Compare with recent transactions

Format your response as:
## Current Gas Conditions
- Base fee: [amount] [unit]
- Priority fee: [amount] [unit]
- Network congestion: [low/medium/high]

## ${transactionType} Gas Requirements
- Minimum gas limit: [amount]
- Recommended gas limit: [amount with buffer]
- Estimated cost: [in native token and USD if available]

## Optimization Strategies
1. [Strategy with expected savings]
2. [Alternative approach]

## Recommended Settings
\`\`\`json
{
  "gasLimit": [amount],
  "priorityFeePerCU": [amount],
  "maxFeePerGas": [amount if applicable]
}
\`\`\`

## Cost Comparison
- Slow: [cost and time]
- Standard: [cost and time]
- Fast: [cost and time]`
            }
          }
        ]
      };
    }

    // Unknown prompt
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Unknown prompt: ${promptName}`
          }
        }
      ]
    };
  });
}