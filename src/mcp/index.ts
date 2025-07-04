#!/usr/bin/env node
import { join } from 'path';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { configureServer, ServerContext } from './server';
import { GatewayApiClient } from './utils/api-client';
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

// Start the server
async function main() {
  // Parse environment variables from command line arguments
  const envVars: Record<string, string> = {};
  process.argv.forEach((arg, index) => {
    if (arg === '-e' && index + 1 < process.argv.length) {
      const envVar = process.argv[index + 1];
      const [key, value] = envVar.split('=');
      if (key && value) {
        process.env[key] = value;
        envVars[key] = value;
      }
    }
  });

  // Initialize Gateway API client
  const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:15888';
  const apiClient = new GatewayApiClient({ url: gatewayUrl });

  // Check if CoinGecko integration is requested
  const withCoinGecko = process.argv.includes('--with-coingecko');

  // Set up server context
  const context: ServerContext = {
    apiClient,
    configPath: process.env.GATEWAY_CONFIG_PATH || join(process.cwd(), 'conf'),
    logsPath: process.env.GATEWAY_LOGS_PATH || join(process.cwd(), 'logs'),
    withCoinGecko,
    envVars,
  };

  // Configure the server with all handlers
  await configureServer({ server, context });

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log startup message
  const { ToolRegistry } = await import('./utils/tool-registry');
  const totalTools = ToolRegistry.getAllTools().length;

  if (withCoinGecko) {
    console.error(
      `Gateway MCP server v${GATEWAY_VERSION} running with ${totalTools} tools (6 Gateway + ${totalTools - 6} CoinGecko)`,
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
