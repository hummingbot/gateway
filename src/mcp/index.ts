#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import axios from "axios";
import { GATEWAY_VERSION } from "../version";

// Initialize the MCP server
const server = new Server(
  {
    name: "hummingbot-gateway",
    version: GATEWAY_VERSION,
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
const gatewayUrl = process.env.GATEWAY_URL || "http://localhost:15888";

// Helper to fetch chains from Gateway API
async function getAvailableChains() {
  try {
    const response = await axios.get(`${gatewayUrl}/chains/`);
    return response.data;
  } catch (e) {
    // Fallback to reading config files if Gateway is not running
    const configPath = "./conf";
    try {
      const files = await fs.readdir(configPath);
      const chainConfigs = files
        .filter(f => f.endsWith('.yml'))
        .map(f => f.replace('.yml', ''))
        .filter(name => ['ethereum', 'solana'].includes(name));
      
      return {
        chains: chainConfigs.map(chain => ({
          chain: chain,
          networks: chain === 'solana' ? ['mainnet-beta', 'devnet'] : ['mainnet']
        }))
      };
    } catch (err) {
      // Return minimal fallback
      return {
        chains: [
          { chain: 'ethereum', networks: ['mainnet'] },
          { chain: 'solana', networks: ['mainnet-beta', 'devnet'] }
        ]
      };
    }
  }
}

// Helper to fetch connectors from Gateway API
async function getAvailableConnectors(chain?: string) {
  try {
    const response = await axios.get(`${gatewayUrl}/connectors/`);
    let connectors = response.data.connectors;
    
    if (chain) {
      connectors = connectors.filter((c: any) => c.chain === chain);
    }
    
    return { connectors };
  } catch (e) {
    // Fallback to reading config files if Gateway is not running
    const configPath = "./conf";
    try {
      const files = await fs.readdir(configPath);
      const connectorConfigs = files
        .filter(f => f.endsWith('.yml'))
        .map(f => f.replace('.yml', ''))
        .filter(name => ['uniswap', 'jupiter', 'meteora', 'raydium'].includes(name));
      
      const connectorMap: Record<string, any> = {
        'uniswap': { chain: 'ethereum', trading_types: ['swap', 'amm', 'clmm'] },
        'jupiter': { chain: 'solana', trading_types: ['swap'] },
        'meteora': { chain: 'solana', trading_types: ['clmm', 'swap'] },
        'raydium': { chain: 'solana', trading_types: ['amm', 'swap'] }
      };
      
      let connectors = connectorConfigs.map(name => ({
        name,
        trading_types: connectorMap[name]?.trading_types || ['swap'],
        chain: connectorMap[name]?.chain || 'ethereum',
        networks: connectorMap[name]?.chain === 'solana' ? ['mainnet-beta', 'devnet'] : ['mainnet']
      }));
      
      if (chain) {
        connectors = connectors.filter(c => c.chain === chain);
      }
      
      return { connectors };
    } catch (err) {
      return { connectors: [] };
    }
  }
}

// Tool implementations
server.setRequestHandler(
  CallToolRequestSchema,
  async (request) => {
    // Tool: get_chains
    if (request.params.name === "get_chains") {
      try {
        const chainsData = await getAvailableChains();
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(chainsData, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Failed to get chains",
                message: error instanceof Error ? error.message : String(error),
                hint: "Make sure Gateway server is running on port 15888"
              })
            }
          ]
        };
      }
    }

    // Tool: get_connectors
    if (request.params.name === "get_connectors") {
      try {
        const args = request.params.arguments as { chain?: string };
        const connectorsData = await getAvailableConnectors(args.chain);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(connectorsData, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Failed to get connectors",
                message: error instanceof Error ? error.message : String(error),
                hint: "Make sure Gateway server is running on port 15888"
              })
            }
          ]
        };
      }
    }

    // Tool: wallet_list
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
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_chains",
        description: "Get available blockchain networks from Gateway API",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "get_connectors",
        description: "Get available DEX connectors from Gateway API",
        inputSchema: {
          type: "object",
          properties: {
            chain: {
              type: "string",
              description: "Optional: filter connectors by chain (ethereum, solana)"
            }
          }
        }
      },
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
      {
        name: "get_balance_stub",
        description: "Placeholder for balance checking (requires Gateway server)",
        inputSchema: {
          type: "object",
          properties: {
            chain: {
              type: "string",
              description: "Blockchain network (use get_chains to see available)"
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