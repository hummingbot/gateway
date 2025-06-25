import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ToolRegistry } from "../utils/tool-registry";
import { GatewayApiClient } from "../utils/api-client";

export function registerTradingTools(server: Server, apiClient: GatewayApiClient) {
  // Tool: quote_swap
  ToolRegistry.registerTool(
    {
      name: "quote_swap",
      description: "Get a quote for a token swap on a DEX",
      inputSchema: {
        type: "object",
        properties: {
          connector: {
            type: "string",
            description: "DEX connector (e.g., 'uniswap', 'jupiter', 'raydium/amm')"
          },
          network: {
            type: "string",
            description: "Network name (e.g., 'mainnet', 'mainnet-beta')"
          },
          baseToken: {
            type: "string",
            description: "Base token symbol"
          },
          quoteToken: {
            type: "string",
            description: "Quote token symbol"
          },
          amount: {
            type: "number",
            description: "Amount to swap"
          },
          side: {
            type: "string",
            enum: ["BUY", "SELL"],
            description: "Trade side"
          },
          slippagePct: {
            type: "number",
            description: "Optional: slippage tolerance in percent"
          },
          poolAddress: {
            type: "string",
            description: "Optional: specific pool address"
          }
        },
        required: ["connector", "network", "baseToken", "quoteToken", "amount", "side"]
      }
    },
    async (request) => {
      try {
        const args = request.params.arguments as {
          connector: string;
          network: string;
          baseToken: string;
          quoteToken: string;
          amount: number;
          side: "BUY" | "SELL";
          slippagePct?: number;
          poolAddress?: string;
        };
        
        // Determine the connector path
        const connectorPath = args.connector.includes("/") 
          ? args.connector 
          : `${args.connector}`;
        
        const result = await apiClient.get(`/connectors/${connectorPath}/quote-swap`, {
          network: args.network,
          baseToken: args.baseToken,
          quoteToken: args.quoteToken,
          amount: args.amount,
          side: args.side,
          slippagePct: args.slippagePct,
          poolAddress: args.poolAddress
        });
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Failed to get swap quote",
                message: error instanceof Error ? error.message : String(error),
                hint: "Gateway server must be running to quote swaps"
              })
            }
          ]
        };
      }
    }
  );

  // Tool: execute_swap
  ToolRegistry.registerTool(
    {
      name: "execute_swap",
      description: "Execute a token swap on a DEX",
      inputSchema: {
        type: "object",
        properties: {
          connector: {
            type: "string",
            description: "DEX connector (e.g., 'uniswap', 'jupiter', 'raydium/amm')"
          },
          network: {
            type: "string",
            description: "Network name (e.g., 'mainnet', 'mainnet-beta')"
          },
          walletAddress: {
            type: "string",
            description: "Wallet address to execute the swap from"
          },
          baseToken: {
            type: "string",
            description: "Base token symbol"
          },
          quoteToken: {
            type: "string",
            description: "Quote token symbol"
          },
          amount: {
            type: "number",
            description: "Amount to swap"
          },
          side: {
            type: "string",
            enum: ["BUY", "SELL"],
            description: "Trade side"
          },
          slippagePct: {
            type: "number",
            description: "Optional: slippage tolerance in percent"
          },
          poolAddress: {
            type: "string",
            description: "Optional: specific pool address"
          },
          priorityFeePerCU: {
            type: "number",
            description: "Optional: priority fee (lamports/CU for Solana, Gwei for Ethereum)"
          },
          computeUnits: {
            type: "number",
            description: "Optional: compute units for transaction"
          }
        },
        required: ["connector", "network", "walletAddress", "baseToken", "quoteToken", "amount", "side"]
      }
    },
    async (request) => {
      try {
        const args = request.params.arguments as {
          connector: string;
          network: string;
          walletAddress: string;
          baseToken: string;
          quoteToken: string;
          amount: number;
          side: "BUY" | "SELL";
          slippagePct?: number;
          poolAddress?: string;
          priorityFeePerCU?: number;
          computeUnits?: number;
        };
        
        const connectorPath = args.connector.includes("/") 
          ? args.connector 
          : `${args.connector}`;
        
        const result = await apiClient.post(`/connectors/${connectorPath}/execute-swap`, {
          network: args.network,
          walletAddress: args.walletAddress,
          baseToken: args.baseToken,
          quoteToken: args.quoteToken,
          amount: args.amount,
          side: args.side,
          slippagePct: args.slippagePct,
          poolAddress: args.poolAddress,
          priorityFeePerCU: args.priorityFeePerCU,
          computeUnits: args.computeUnits
        });
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Failed to execute swap",
                message: error instanceof Error ? error.message : String(error),
                hint: "Gateway server must be running to execute swaps"
              })
            }
          ]
        };
      }
    }
  );

  // Tool: get_pool_info
  ToolRegistry.registerTool(
    {
      name: "get_pool_info",
      description: "Get information about a liquidity pool",
      inputSchema: {
        type: "object",
        properties: {
          connector: {
            type: "string",
            description: "DEX connector (e.g., 'raydium/amm', 'uniswap/clmm')"
          },
          network: {
            type: "string",
            description: "Network name"
          },
          poolAddress: {
            type: "string",
            description: "Optional: specific pool address"
          },
          baseToken: {
            type: "string",
            description: "Optional: base token symbol (required if poolAddress not provided)"
          },
          quoteToken: {
            type: "string",
            description: "Optional: quote token symbol (required if poolAddress not provided)"
          }
        },
        required: ["connector", "network"]
      }
    },
    async (request) => {
      try {
        const args = request.params.arguments as {
          connector: string;
          network: string;
          poolAddress?: string;
          baseToken?: string;
          quoteToken?: string;
        };
        
        const connectorPath = args.connector.includes("/") 
          ? args.connector 
          : `${args.connector}`;
        
        const result = await apiClient.get(`/connectors/${connectorPath}/pool-info`, {
          network: args.network,
          poolAddress: args.poolAddress,
          baseToken: args.baseToken,
          quoteToken: args.quoteToken
        });
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Failed to get pool info",
                message: error instanceof Error ? error.message : String(error),
                hint: "Gateway server must be running to fetch pool information"
              })
            }
          ]
        };
      }
    }
  );

  // Tool: estimate_gas
  ToolRegistry.registerTool(
    {
      name: "estimate_gas",
      description: "Estimate gas prices for blockchain transactions",
      inputSchema: {
        type: "object",
        properties: {
          chain: {
            type: "string",
            description: "Blockchain (ethereum, solana)"
          },
          network: {
            type: "string",
            description: "Network name"
          },
          gasLimit: {
            type: "number",
            description: "Optional: gas limit for the transaction"
          }
        },
        required: ["chain", "network"]
      }
    },
    async (request) => {
      try {
        const args = request.params.arguments as {
          chain: string;
          network: string;
          gasLimit?: number;
        };
        
        const result = await apiClient.post(`/chains/${args.chain}/estimate-gas`, {
          network: args.network,
          gasLimit: args.gasLimit
        });
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Failed to estimate gas",
                message: error instanceof Error ? error.message : String(error),
                hint: "Gateway server must be running to estimate gas"
              })
            }
          ]
        };
      }
    }
  );

  // Tool: poll_transaction
  ToolRegistry.registerTool(
    {
      name: "poll_transaction",
      description: "Poll the status of a blockchain transaction",
      inputSchema: {
        type: "object",
        properties: {
          chain: {
            type: "string",
            description: "Blockchain (ethereum, solana)"
          },
          network: {
            type: "string",
            description: "Network name"
          },
          signature: {
            type: "string",
            description: "Transaction signature/hash"
          }
        },
        required: ["chain", "network", "signature"]
      }
    },
    async (request) => {
      try {
        const args = request.params.arguments as {
          chain: string;
          network: string;
          signature: string;
        };
        
        const result = await apiClient.post(`/chains/${args.chain}/poll`, {
          network: args.network,
          signature: args.signature
        });
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Failed to poll transaction",
                message: error instanceof Error ? error.message : String(error),
                hint: "Gateway server must be running to poll transactions"
              })
            }
          ]
        };
      }
    }
  );
}