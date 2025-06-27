#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { GATEWAY_VERSION } from "./version";
import { GatewayApiClient } from "./utils/api-client";
import { FallbackDataProvider } from "./utils/fallback";
import { registerDiscoveryTools } from "./tools/discovery";
import { registerConfigTools } from "./tools/config";
import { registerTradingTools } from "./tools/trading";
import { registerWalletTools } from "./tools/wallet";
import { registerTokenTools } from "./tools/tokens";
import { registerResources } from "./resources";
import { registerPrompts } from "./prompts";
import { ToolRegistry } from "./utils/tool-registry";
import { createDynamicTools } from "./dynamic-tools";
import { registerCoinGeckoTools } from "./tools/coingecko-gateway";

// Initialize the MCP server with full capabilities
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

// Initialize Gateway API client
const gatewayUrl = process.env.GATEWAY_URL || "http://localhost:15888";
const apiClient = new GatewayApiClient({ url: gatewayUrl });

// Export for use in tool modules
export { server, apiClient };

// First, register all Gateway tools internally to make them available
registerDiscoveryTools(server, apiClient);
registerConfigTools(server, apiClient);
registerTradingTools(server, apiClient);
registerWalletTools(server, apiClient);
registerTokenTools(server, apiClient);

// Store all registered tools and handlers
const allGatewayTools = ToolRegistry.getAllTools();
const allGatewayHandlers = new Map();
allGatewayTools.forEach(tool => {
  allGatewayHandlers.set(tool.name, ToolRegistry.getHandler(tool.name));
});

// Start the server
async function main() {
  // Parse environment variables from command line arguments
  process.argv.forEach((arg, index) => {
    if (arg === '-e' && index + 1 < process.argv.length) {
      const envVar = process.argv[index + 1];
      const [key, value] = envVar.split('=');
      if (key && value) {
        process.env[key] = value;
      }
    }
  });

  // Check command line arguments
  const isDynamicMode = process.argv.includes("--tools=dynamic");
  const withCoinGecko = process.argv.includes("--with-coingecko");

  if (isDynamicMode) {
    // Clear the registry to use only dynamic tools
    ToolRegistry.clear();
    
    // Register only the 3 dynamic gateway tools
    createDynamicTools(apiClient, allGatewayTools, allGatewayHandlers);
    
    // Register CoinGecko dynamic tools if requested
    if (withCoinGecko) {
      await registerCoinGeckoTools(server, apiClient, true);
      console.error("Gateway MCP server starting with dynamic tools only (6 tools: 3 Gateway + 3 CoinGecko)");
    } else {
      console.error("Gateway MCP server starting with dynamic tools only (3 Gateway tools)");
    }
  } else {
    // Keep all Gateway tools registered (don't add dynamic tools in this mode)
    
    // Register all CoinGecko tools if requested
    if (withCoinGecko) {
      await registerCoinGeckoTools(server, apiClient, false);
    }
    
    const totalTools = ToolRegistry.getAllTools().length;
    if (withCoinGecko) {
      console.error(`Gateway MCP server starting with all tools (${totalTools} total)`);
    } else {
      console.error(`Gateway MCP server starting with all Gateway tools (${totalTools} total)`);
    }
  }

  // Set up tool handlers after all tools are registered
  ToolRegistry.setupHandlers(server);

  // Register resources (available in both modes)
  registerResources(server, apiClient);

  // Register prompts (available in both modes)
  registerPrompts(server);
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Gateway MCP server v${GATEWAY_VERSION} running on stdio`);
}

main().catch((error) => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
});