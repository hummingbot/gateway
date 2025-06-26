import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { z } from "zod";
import { GatewayApiClient } from "../utils/api-client";
import { FallbackDataProvider } from "../utils/fallback";
import { ToolRegistry } from "../utils/tool-registry";

export function registerDiscoveryTools(_server: Server, apiClient: GatewayApiClient) {
  // Tool: get_chains
  ToolRegistry.registerTool(
    {
      name: "get_chains",
      description: "Get available blockchain networks from Gateway API",
      inputSchema: {
        type: "object",
        properties: {}
      }
    },
    async (_request) => {
      try {
        const chainsData = await apiClient.get("/chains/").catch(() => 
          FallbackDataProvider.getChains()
        );
        
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
  );

  // Tool: get_connectors
  ToolRegistry.registerTool(
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
    async (_request) => {
      try {
        const args = _request.params.arguments as { chain?: string };
        const connectorsData = await apiClient.get("/connectors/", args.chain ? { chain: args.chain } : undefined)
          .catch(() => FallbackDataProvider.getConnectors(args.chain));
        
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
  );

  // Tool: get_status
  ToolRegistry.registerTool(
    {
      name: "get_status",
      description: "Get blockchain network status including current block and RPC info",
      inputSchema: {
        type: "object",
        properties: {
          chain: {
            type: "string",
            description: "Blockchain (ethereum, solana)"
          },
          network: {
            type: "string",
            description: "Network name (mainnet, mainnet-beta, etc)"
          }
        },
        required: ["chain", "network"]
      }
    },
    async (_request) => {
      try {
        const args = _request.params.arguments as { 
          chain: string;
          network: string;
        };
        
        const statusData = await apiClient.get(`/chains/${args.chain}/status`, {
          network: args.network
        });
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(statusData, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Failed to get chain status",
                message: error instanceof Error ? error.message : String(error),
                hint: "Gateway server must be running to fetch chain status"
              })
            }
          ]
        };
      }
    }
  );
}