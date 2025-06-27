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

// Check if dynamic tools mode is enabled
const isDynamicMode = process.argv.includes("--tools=dynamic");

if (isDynamicMode) {
  // First, we need to register all tools internally to make them available via dynamic tools
  // But we clear the registry after to only expose the 3 dynamic tools
  registerDiscoveryTools(server, apiClient);
  registerConfigTools(server, apiClient);
  registerTradingTools(server, apiClient);
  registerWalletTools(server, apiClient);
  registerTokenTools(server, apiClient);
  
  // Store all registered tools
  const allTools = ToolRegistry.getAllTools();
  const allHandlers = new Map();
  allTools.forEach(tool => {
    allHandlers.set(tool.name, ToolRegistry.getHandler(tool.name));
  });
  
  // Clear the registry
  ToolRegistry.clear();
  
  // Create and register only the 3 dynamic tools
  createDynamicTools(apiClient, allTools, allHandlers);
  console.error("Gateway MCP server starting with dynamic tools (3 tools)");
} else {
  // Register all tools normally
  registerDiscoveryTools(server, apiClient);
  registerConfigTools(server, apiClient);
  registerTradingTools(server, apiClient);
  registerWalletTools(server, apiClient);
  registerTokenTools(server, apiClient);
  console.error("Gateway MCP server starting with all tools");
}

// Set up tool handlers after all tools are registered
ToolRegistry.setupHandlers(server);

// Register resources (available in both modes)
registerResources(server, apiClient);

// Register prompts (available in both modes)
registerPrompts(server);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Gateway MCP server v${GATEWAY_VERSION} running on stdio`);
}

main().catch((error) => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
});