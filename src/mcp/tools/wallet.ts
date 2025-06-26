import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { z } from "zod";
import { GatewayApiClient } from "../utils/api-client";
import { FallbackDataProvider } from "../utils/fallback";
import { ToolRegistry } from "../utils/tool-registry";

export function registerWalletTools(_server: Server, apiClient: GatewayApiClient) {
  // Tool: wallet_list
  ToolRegistry.registerTool(
    {
      name: "wallet_list",
      description: "List all wallets or filter by chain",
      inputSchema: {
        type: "object",
        properties: {
          chain: {
            type: "string",
            description: "Optional: filter wallets by chain (use get_chains to see available)"
          }
        }
      }
    },
    async (request) => {
      try {
        const args = request.params.arguments as { chain?: string };
        
        // Try API first, fallback to reading files
        const wallets = await apiClient.get("/wallet/")
          .then((data: any) => {
            // Transform API response to flat wallet list
            const allWallets: any[] = [];
            for (const item of data) {
              for (const address of item.walletAddresses) {
                allWallets.push({
                  address,
                  chain: item.chain,
                  name: `${item.chain}-wallet`
                });
              }
            }
            return allWallets;
          })
          .catch(() => FallbackDataProvider.getWallets(args.chain));
        
        // Filter by chain if specified
        const filteredWallets = args.chain 
          ? wallets.filter((w: any) => w.chain === args.chain)
          : wallets;
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                wallets: filteredWallets,
                count: filteredWallets.length
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Failed to list wallets",
                message: error instanceof Error ? error.message : String(error)
              })
            }
          ]
        };
      }
    }
  );

  // Tool: wallet_add
  ToolRegistry.registerTool(
    {
      name: "wallet_add",
      description: "Add a new wallet using a private key",
      inputSchema: {
        type: "object",
        properties: {
          chain: {
            type: "string",
            description: "Blockchain network (ethereum, solana)"
          },
          privateKey: {
            type: "string",
            description: "Private key in hex format"
          }
        },
        required: ["chain", "privateKey"]
      }
    },
    async (request) => {
      try {
        const args = request.params.arguments as {
          chain: string;
          privateKey: string;
        };
        
        const result = await apiClient.post("/wallet/add", {
          chain: args.chain,
          privateKey: args.privateKey
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
                error: "Failed to add wallet",
                message: error instanceof Error ? error.message : String(error),
                hint: "Gateway server must be running to add wallets"
              })
            }
          ]
        };
      }
    }
  );

  // Tool: wallet_remove
  ToolRegistry.registerTool(
    {
      name: "wallet_remove",
      description: "Remove a wallet by its address",
      inputSchema: {
        type: "object",
        properties: {
          chain: {
            type: "string",
            description: "Blockchain network (ethereum, solana)"
          },
          address: {
            type: "string",
            description: "Wallet address to remove"
          }
        },
        required: ["chain", "address"]
      }
    },
    async (request) => {
      try {
        const args = request.params.arguments as {
          chain: string;
          address: string;
        };
        
        const result = await apiClient.delete("/wallet/remove", {
          chain: args.chain,
          address: args.address
        });
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                message: `Wallet ${args.address} removed from ${args.chain}`
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Failed to remove wallet",
                message: error instanceof Error ? error.message : String(error),
                hint: "Gateway server must be running to remove wallets"
              })
            }
          ]
        };
      }
    }
  );

  // Tool: get_balances
  ToolRegistry.registerTool(
    {
      name: "get_balances",
      description: "Get token balances for a wallet address",
      inputSchema: {
        type: "object",
        properties: {
          chain: {
            type: "string",
            description: "Blockchain network (ethereum, solana)"
          },
          network: {
            type: "string",
            description: "Network name (mainnet, mainnet-beta, etc)"
          },
          address: {
            type: "string",
            description: "Wallet address"
          },
          tokens: {
            type: "array",
            items: { type: "string" },
            description: "Optional: specific tokens to check (symbols or addresses)"
          }
        },
        required: ["chain", "network", "address"]
      }
    },
    async (request) => {
      try {
        const args = request.params.arguments as {
          chain: string;
          network: string;
          address: string;
          tokens?: string[];
        };
        
        const result = await apiClient.post(`/chains/${args.chain}/balances`, {
          network: args.network,
          address: args.address,
          tokens: args.tokens
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
                error: "Failed to get balances",
                message: error instanceof Error ? error.message : String(error),
                hint: "Gateway server must be running to fetch balances"
              })
            }
          ]
        };
      }
    }
  );
}