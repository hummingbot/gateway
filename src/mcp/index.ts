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
import { registerResources } from "./resources";
import { registerPrompts } from "./prompts";
import { ToolRegistry } from "./utils/tool-registry";

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

// Register all tools
registerDiscoveryTools(server, apiClient);
registerConfigTools(server, apiClient);
registerTradingTools(server, apiClient);
registerWalletTools(server, apiClient);

// Set up tool handlers after all tools are registered
ToolRegistry.setupHandlers(server);

// Register resources
registerResources(server, apiClient);

// Register prompts
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