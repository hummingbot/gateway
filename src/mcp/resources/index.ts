import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListResourcesRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { GatewayApiClient } from "../utils/api-client";
import { FallbackDataProvider } from "../utils/fallback";
import * as fs from "fs/promises";
import * as path from "path";

export function registerResources(server: Server, apiClient: GatewayApiClient) {
  // Handle resource list requests
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: "gateway://chains",
          name: "Available Chains",
          description: "List of supported blockchain networks",
          mimeType: "application/json"
        },
        {
          uri: "gateway://connectors",
          name: "Available Connectors",
          description: "List of DEX connectors and their capabilities",
          mimeType: "application/json"
        },
        {
          uri: "gateway://config/ethereum",
          name: "Ethereum Configuration",
          description: "Current Ethereum configuration settings",
          mimeType: "application/json"
        },
        {
          uri: "gateway://config/solana",
          name: "Solana Configuration",
          description: "Current Solana configuration settings",
          mimeType: "application/json"
        },
        {
          uri: "gateway://wallets",
          name: "Wallet List",
          description: "List of configured wallets across all chains",
          mimeType: "application/json"
        },
        {
          uri: "gateway://token-lists/ethereum-mainnet",
          name: "Ethereum Mainnet Token List",
          description: "Supported tokens on Ethereum mainnet",
          mimeType: "application/json"
        },
        {
          uri: "gateway://token-lists/solana-mainnet",
          name: "Solana Mainnet Token List",
          description: "Supported tokens on Solana mainnet",
          mimeType: "application/json"
        },
        {
          uri: "gateway://openapi",
          name: "OpenAPI Specification",
          description: "Complete Gateway API specification",
          mimeType: "application/json"
        }
      ]
    };
  });

  // Handle resource read requests
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    
    try {
      // Chains resource
      if (uri === "gateway://chains") {
        const data = await apiClient.get("/chains/")
          .catch(() => FallbackDataProvider.getChains());
        
        return {
          contents: [{
            uri,
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2)
          }]
        };
      }

      // Connectors resource
      if (uri === "gateway://connectors") {
        const data = await apiClient.get("/connectors/")
          .catch(() => FallbackDataProvider.getConnectors());
        
        return {
          contents: [{
            uri,
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2)
          }]
        };
      }

      // Config resources
      if (uri.startsWith("gateway://config/")) {
        const configName = uri.replace("gateway://config/", "");
        const data = await apiClient.get("/config/", { namespace: configName })
          .catch(() => ({ error: "Configuration not available offline" }));
        
        return {
          contents: [{
            uri,
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2)
          }]
        };
      }

      // Wallets resource
      if (uri === "gateway://wallets") {
        const data = await apiClient.get("/wallet/")
          .then((response: any) => {
            // Transform to a more readable format
            const wallets: any[] = [];
            for (const item of response) {
              for (const address of item.walletAddresses) {
                wallets.push({
                  address,
                  chain: item.chain,
                  name: `${item.chain}-wallet`
                });
              }
            }
            return { wallets, count: wallets.length };
          })
          .catch(async () => {
            const wallets = await FallbackDataProvider.getWallets();
            return { wallets, count: wallets.length };
          });
        
        return {
          contents: [{
            uri,
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2)
          }]
        };
      }

      // Token lists
      if (uri.startsWith("gateway://token-lists/")) {
        const listName = uri.replace("gateway://token-lists/", "");
        let chain = "";
        let network = "";
        
        if (listName === "ethereum-mainnet") {
          chain = "ethereum";
          network = "mainnet";
        } else if (listName === "solana-mainnet") {
          chain = "solana";
          network = "mainnet-beta";
        }
        
        if (chain && network) {
          const data = await apiClient.get(`/tokens`, { chain, network })
            .catch(async () => {
              // Try to read from local token list files
              const tokenListPath = `./src/templates/tokens/${chain}/${network}.json`;
              try {
                const content = await fs.readFile(tokenListPath, 'utf-8');
                return { tokens: JSON.parse(content) };
              } catch {
                return { error: "Token list not available offline" };
              }
            });
          
          return {
            contents: [{
              uri,
              mimeType: "application/json",
              text: JSON.stringify(data, null, 2)
            }]
          };
        }
      }

      // OpenAPI spec
      if (uri === "gateway://openapi") {
        try {
          const content = await fs.readFile("./openapi.json", 'utf-8');
          return {
            contents: [{
              uri,
              mimeType: "application/json",
              text: content
            }]
          };
        } catch {
          return {
            contents: [{
              uri,
              mimeType: "application/json",
              text: JSON.stringify({
                error: "OpenAPI spec not found",
                hint: "Run 'pnpm generate:openapi' with Gateway server running"
              }, null, 2)
            }]
          };
        }
      }

      // Unknown resource
      return {
        contents: [{
          uri,
          mimeType: "text/plain",
          text: `Unknown resource: ${uri}`
        }]
      };
      
    } catch (error) {
      return {
        contents: [{
          uri,
          mimeType: "application/json",
          text: JSON.stringify({
            error: "Failed to read resource",
            message: error instanceof Error ? error.message : String(error)
          }, null, 2)
        }]
      };
    }
  });
}