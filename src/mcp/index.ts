#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";

// Initialize the MCP server
const server = new Server(
  {
    name: "hummingbot-gateway",
    version: "2.7.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
      prompts: {},
    },
  }
);

const walletPath = "./conf/wallets";

// Tool: wallet_list
(server as any).setRequestHandler(
  "tools/call",
  async (request: any) => {
    if (request.params.name === "wallet_list") {
      try {
        const args = request.params.arguments as { chain?: string };
        
        // Read wallet files from disk
        const wallets: any[] = [];
        
        try {
          const chains = args.chain ? [args.chain] : await fs.readdir(walletPath);
          
          for (const chain of chains) {
            const chainPath = path.join(walletPath, chain);
            try {
              const stat = await fs.stat(chainPath);
              if (stat.isDirectory()) {
                const files = await fs.readdir(chainPath);
                for (const file of files) {
                  if (file.endsWith('.json')) {
                    const address = file.replace('.json', '');
                    wallets.push({
                      address,
                      chain,
                      name: `${chain}-wallet`
                    });
                  }
                }
              }
            } catch (e) {
              // Chain directory doesn't exist
            }
          }
        } catch (e) {
          // Wallet directory doesn't exist
        }
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                wallets,
                count: wallets.length
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

    // Tool: get_balance_stub
    if (request.params.name === "get_balance_stub") {
      try {
        const args = request.params.arguments as {
          chain: string;
          network: string;
          address: string;
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                message: "Balance checking requires the Gateway server to be running",
                chain: args.chain,
                network: args.network,
                address: args.address,
                hint: "Start the Gateway server with 'pnpm start' to enable balance checking"
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
                error: "Failed to process request",
                message: error instanceof Error ? error.message : String(error)
              })
            }
          ]
        };
      }
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
  }
);

// List available tools
(server as any).setRequestHandler("tools/list", async () => {
  return {
    tools: [
      {
        name: "wallet_list",
        description: "List all wallets or filter by chain",
        inputSchema: {
          type: "object",
          properties: {
            chain: {
              type: "string",
              description: "Optional chain to filter by (ethereum, solana, polygon, avalanche, arbitrum)",
              enum: ["ethereum", "solana", "polygon", "avalanche", "arbitrum"]
            }
          }
        }
      },
      {
        name: "get_balance_stub",
        description: "Placeholder for balance checking (requires Gateway server)",
        inputSchema: {
          type: "object",
          properties: {
            chain: {
              type: "string",
              description: "Blockchain network",
              enum: ["ethereum", "solana", "polygon", "avalanche", "arbitrum"]
            },
            network: {
              type: "string",
              description: "Network name (mainnet, testnet, etc)"
            },
            address: {
              type: "string",
              description: "Wallet address"
            }
          },
          required: ["chain", "network", "address"]
        }
      }
    ]
  };
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Gateway MCP server running on stdio");
}

main().catch((error) => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
});