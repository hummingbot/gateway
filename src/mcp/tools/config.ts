import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ToolRegistry } from "../utils/tool-registry";
import { GatewayApiClient } from "../utils/api-client";

export function registerConfigTools(server: Server, apiClient: GatewayApiClient) {
  // Tool: get_config
  ToolRegistry.registerTool(
    {
      name: "get_config",
      description: "Get configuration settings for chains or connectors",
      inputSchema: {
        type: "object",
        properties: {
          chainOrConnector: {
            type: "string",
            description: "Optional: specific chain or connector name (e.g., 'solana', 'uniswap')"
          }
        }
      }
    },
    async (request) => {
      try {
        const args = request.params.arguments as { chainOrConnector?: string };
        
        const result = await apiClient.get("/config/", 
          args.chainOrConnector ? { chainOrConnector: args.chainOrConnector } : undefined
        );
        
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
                error: "Failed to get configuration",
                message: error instanceof Error ? error.message : String(error),
                hint: "Gateway server must be running to fetch configuration"
              })
            }
          ]
        };
      }
    }
  );

  // Tool: update_config
  ToolRegistry.registerTool(
    {
      name: "update_config",
      description: "Update a specific configuration value",
      inputSchema: {
        type: "object",
        properties: {
          configPath: {
            type: "string",
            description: "Configuration path (e.g., 'solana.priorityFeeMultiplier')"
          },
          configValue: {
            description: "New configuration value (string, number, boolean, object, or array)"
          }
        },
        required: ["configPath", "configValue"]
      }
    },
    async (request) => {
      try {
        const args = request.params.arguments as {
          configPath: string;
          configValue: any;
        };
        
        const result = await apiClient.post("/config/update", {
          configPath: args.configPath,
          configValue: args.configValue
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
                error: "Failed to update configuration",
                message: error instanceof Error ? error.message : String(error),
                hint: "Gateway server must be running to update configuration"
              })
            }
          ]
        };
      }
    }
  );

  // Tool: get_pools
  ToolRegistry.registerTool(
    {
      name: "get_pools",
      description: "Get default pools for a specific connector",
      inputSchema: {
        type: "object",
        properties: {
          connector: {
            type: "string",
            description: "Connector name (e.g., 'raydium/amm', 'uniswap/clmm')"
          }
        },
        required: ["connector"]
      }
    },
    async (request) => {
      try {
        const args = request.params.arguments as { connector: string };
        
        const result = await apiClient.get("/config/pools", {
          connector: args.connector
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
                error: "Failed to get pools",
                message: error instanceof Error ? error.message : String(error),
                hint: "Gateway server must be running to fetch pool configuration"
              })
            }
          ]
        };
      }
    }
  );

  // Tool: add_pool
  ToolRegistry.registerTool(
    {
      name: "add_pool",
      description: "Add a default pool for a specific connector",
      inputSchema: {
        type: "object",
        properties: {
          connector: {
            type: "string",
            description: "Connector name (e.g., 'raydium/amm', 'uniswap/clmm')"
          },
          baseToken: {
            type: "string",
            description: "Base token symbol"
          },
          quoteToken: {
            type: "string",
            description: "Quote token symbol"
          },
          poolAddress: {
            type: "string",
            description: "Pool address"
          }
        },
        required: ["connector", "baseToken", "quoteToken", "poolAddress"]
      }
    },
    async (request) => {
      try {
        const args = request.params.arguments as {
          connector: string;
          baseToken: string;
          quoteToken: string;
          poolAddress: string;
        };
        
        const result = await apiClient.post("/config/pools/add", args);
        
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
                error: "Failed to add pool",
                message: error instanceof Error ? error.message : String(error),
                hint: "Gateway server must be running to add pools"
              })
            }
          ]
        };
      }
    }
  );

  // Tool: remove_pool
  ToolRegistry.registerTool(
    {
      name: "remove_pool",
      description: "Remove a default pool for a specific connector",
      inputSchema: {
        type: "object",
        properties: {
          connector: {
            type: "string",
            description: "Connector name (e.g., 'raydium/amm', 'uniswap/clmm')"
          },
          baseToken: {
            type: "string",
            description: "Base token symbol"
          },
          quoteToken: {
            type: "string",
            description: "Quote token symbol"
          }
        },
        required: ["connector", "baseToken", "quoteToken"]
      }
    },
    async (request) => {
      try {
        const args = request.params.arguments as {
          connector: string;
          baseToken: string;
          quoteToken: string;
        };
        
        const result = await apiClient.post("/config/pools/remove", args);
        
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
                error: "Failed to remove pool",
                message: error instanceof Error ? error.message : String(error),
                hint: "Gateway server must be running to remove pools"
              })
            }
          ]
        };
      }
    }
  );

}