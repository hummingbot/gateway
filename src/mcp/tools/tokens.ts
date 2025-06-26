import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { GatewayApiClient } from "../utils/api-client";
import { ToolRegistry } from "../utils/tool-registry";

export function registerTokenTools(_server: Server, apiClient: GatewayApiClient) {
  // Tool: list_tokens
  ToolRegistry.registerTool(
    {
      name: "list_tokens",
      description: "List tokens from token lists with optional filtering",
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
          search: {
            type: "string",
            description: "Search term for filtering tokens by symbol or name"
          }
        }
      }
    },
    async (_request) => {
      try {
        const args = _request.params.arguments as {
          chain?: string;
          network?: string;
          search?: string;
        };

        const tokensData = await apiClient.get("/tokens", args);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(tokensData, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Failed to list tokens",
                message: error instanceof Error ? error.message : String(error),
                hint: "Make sure Gateway server is running and chain/network are valid"
              })
            }
          ]
        };
      }
    }
  );

  // Tool: search_tokens
  ToolRegistry.registerTool(
    {
      name: "search_tokens",
      description: "Search for specific tokens across chains and networks",
      inputSchema: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Search term (symbol, name, or address)"
          },
          chain: {
            type: "string",
            description: "Optional: filter by blockchain (ethereum, solana)"
          },
          network: {
            type: "string",
            description: "Optional: filter by network (mainnet, mainnet-beta, etc)"
          }
        },
        required: ["search"]
      }
    },
    async (_request) => {
      try {
        const args = _request.params.arguments as {
          search: string;
          chain?: string;
          network?: string;
        };

        const tokensData = await apiClient.get("/tokens", {
          chain: args.chain,
          network: args.network,
          search: args.search
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(tokensData, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Failed to search tokens",
                message: error instanceof Error ? error.message : String(error),
                hint: "Make sure Gateway server is running"
              })
            }
          ]
        };
      }
    }
  );

  // Tool: get_token
  ToolRegistry.registerTool(
    {
      name: "get_token",
      description: "Get details for a specific token by symbol or address",
      inputSchema: {
        type: "object",
        properties: {
          symbolOrAddress: {
            type: "string",
            description: "Token symbol or address"
          },
          chain: {
            type: "string",
            description: "Blockchain (ethereum, solana)"
          },
          network: {
            type: "string",
            description: "Network name (mainnet, mainnet-beta, etc)"
          }
        },
        required: ["symbolOrAddress", "chain", "network"]
      }
    },
    async (_request) => {
      try {
        const args = _request.params.arguments as {
          symbolOrAddress: string;
          chain: string;
          network: string;
        };

        const tokenData = await apiClient.get(`/tokens/${args.symbolOrAddress}`, {
          chain: args.chain,
          network: args.network
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(tokenData, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Failed to get token",
                message: error instanceof Error ? error.message : String(error),
                hint: "Token may not exist or chain/network may be invalid"
              })
            }
          ]
        };
      }
    }
  );

  // Tool: add_token
  ToolRegistry.registerTool(
    {
      name: "add_token",
      description: "Add a new token to a token list",
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
          },
          symbol: {
            type: "string",
            description: "Token symbol"
          },
          name: {
            type: "string",
            description: "Token name"
          },
          address: {
            type: "string",
            description: "Token contract address"
          },
          decimals: {
            type: "number",
            description: "Number of decimals (0-255)"
          }
        },
        required: ["chain", "network", "symbol", "name", "address", "decimals"]
      }
    },
    async (_request) => {
      try {
        const args = _request.params.arguments as {
          chain: string;
          network: string;
          symbol: string;
          name: string;
          address: string;
          decimals: number;
        };

        const result = await apiClient.post("/tokens", {
          chain: args.chain,
          network: args.network,
          token: {
            symbol: args.symbol,
            name: args.name,
            address: args.address,
            decimals: args.decimals
          }
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
                error: "Failed to add token",
                message: error instanceof Error ? error.message : String(error),
                hint: "Check if token already exists or if parameters are valid"
              })
            }
          ]
        };
      }
    }
  );

  // Tool: remove_token
  ToolRegistry.registerTool(
    {
      name: "remove_token",
      description: "Remove a token from a token list by address",
      inputSchema: {
        type: "object",
        properties: {
          address: {
            type: "string",
            description: "Token address to remove"
          },
          chain: {
            type: "string",
            description: "Blockchain (ethereum, solana)"
          },
          network: {
            type: "string",
            description: "Network name (mainnet, mainnet-beta, etc)"
          }
        },
        required: ["address", "chain", "network"]
      }
    },
    async (_request) => {
      try {
        const args = _request.params.arguments as {
          address: string;
          chain: string;
          network: string;
        };

        const result = await apiClient.delete(`/tokens/${args.address}`, {
          chain: args.chain,
          network: args.network
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
                error: "Failed to remove token",
                message: error instanceof Error ? error.message : String(error),
                hint: "Token may not exist in the specified chain/network"
              })
            }
          ]
        };
      }
    }
  );
}