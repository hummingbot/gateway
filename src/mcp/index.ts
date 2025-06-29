#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { registerPrompts } from './prompts';
import { registerResources } from './resources';
import { registerCoinGeckoTools } from './tools/coingecko-gateway';
import { registerConfigTools } from './tools/config';
import { registerTradingTools } from './tools/trading';
import { GatewayApiClient } from './utils/api-client';
import { ToolRegistry } from './utils/tool-registry';
import { GATEWAY_VERSION } from './version';

// Initialize the MCP server with full capabilities
const server = new Server(
  {
    name: 'hummingbot-gateway',
    version: GATEWAY_VERSION,
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  },
);

// Initialize Gateway API client
const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:15888';
const apiClient = new GatewayApiClient({ url: gatewayUrl });

// Export for use in tool modules
export { server, apiClient };

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

  // Check if CoinGecko integration is requested
  const withCoinGecko = process.argv.includes('--with-coingecko');

  // Register Gateway tools
  registerConfigTools(server, apiClient);
  registerTradingTools(server, apiClient);

  // Register CoinGecko tools if requested
  if (withCoinGecko) {
    await registerCoinGeckoTools(server, apiClient);
  }

  // Set up tool handlers after all tools are registered
  ToolRegistry.setupHandlers(server);

  // Register resources for reading configs, tokens, and wallets
  registerResources(server, apiClient);

  // Register prompts
  registerPrompts(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const totalTools = ToolRegistry.getAllTools().length;
  if (withCoinGecko) {
    console.error(
      `Gateway MCP server v${GATEWAY_VERSION} running with ${totalTools} tools (5 Gateway + ${totalTools - 5} CoinGecko)`,
    );
  } else {
    console.error(
      `Gateway MCP server v${GATEWAY_VERSION} running with ${totalTools} Gateway tools`,
    );
  }
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
