import { spawn, ChildProcess } from 'child_process';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

import { GatewayApiClient } from '../utils/api-client';
import { ToolRegistry } from '../utils/tool-registry';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

/**
 * CoinGecko Gateway spawns the CoinGecko MCP server as a subprocess
 * and proxies the dynamic discovery tools with coingecko_ prefix.
 */
export class CoinGeckoGateway {
  private coingeckoClient: Client | null = null;
  private coingeckoProcess: ChildProcess | null = null;
  private transport: StdioClientTransport | null = null;
  private connected = false;
  private initPromise: Promise<void> | null = null;
  constructor(
    private server: Server,
    private apiClient: GatewayApiClient,
  ) {
    // Always proxy all tools from the subprocess
  }

  async initialize() {
    // Prevent multiple initialization attempts
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  private async _doInitialize() {
    try {
      // Connect to CoinGecko MCP server via stdio
      await this.connectToCoinGecko();

      // Discover and register all CoinGecko tools
      await this.registerAllTools();

      console.error('CoinGecko gateway initialized successfully');
    } catch (error) {
      console.error('Failed to initialize CoinGecko gateway:', error);
      // Don't throw - allow Gateway to work without CoinGecko
    }
  }

  private async connectToCoinGecko() {
    console.error('Starting CoinGecko MCP server subprocess...');
    
    // Check for Pro key first, then Demo key
    const proKey = process.env.COINGECKO_PRO_API_KEY;
    const demoKey = process.env.COINGECKO_DEMO_API_KEY;
    const isPro = !!proKey;
    const apiKey = proKey || demoKey;
    
    console.error(`CoinGecko ${isPro ? 'PRO' : 'DEMO'} API key ${apiKey ? 'is set' : 'is NOT set'} (first 10 chars: ${apiKey ? apiKey.substring(0, 10) + '...' : 'N/A'})`);

    // Create stdio transport for the subprocess
    const args = ['-y', '@coingecko/coingecko-mcp@latest'];
    // Always get all individual tools (no dynamic mode)

    // Create a clean environment with only necessary variables
    const cgEnv: Record<string, string | undefined> = {
      // Include PATH and other essentials from process.env
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      USER: process.env.USER,
    };
    
    // Set appropriate API key based on what's available
    if (isPro) {
      cgEnv.COINGECKO_PRO_API_KEY = proKey;
      cgEnv.COINGECKO_ENVIRONMENT = 'pro';
      console.error('Using CoinGecko Pro API');
    } else if (demoKey) {
      cgEnv.COINGECKO_DEMO_API_KEY = demoKey;
      cgEnv.COINGECKO_ENVIRONMENT = 'demo';
      console.error('Using CoinGecko Demo API');
    }

    console.error('Passing environment to CoinGecko subprocess:', Object.keys(cgEnv).filter(k => k.includes('COINGECKO')).map(k => `${k}=${cgEnv[k] ? cgEnv[k].substring(0, 10) + '...' : 'undefined'}`));

    this.transport = new StdioClientTransport({
      command: 'npx',
      args,
      env: cgEnv,
    });

    this.coingeckoClient = new Client(
      { name: 'gateway-coingecko', version: '1.0.0' },
      { capabilities: {} },
    );

    try {
      await this.coingeckoClient.connect(this.transport);
      this.connected = true;
      console.error('Connected to CoinGecko MCP server');
    } catch (error) {
      console.error('Failed to connect to CoinGecko MCP server:', error);
      throw error;
    }
  }

  private async registerAllTools() {
    // Load the curated subset of tools from server config
    let toolSubset: string[] = [];
    try {
      const configManager = ConfigManagerV2.getInstance();
      const serverConfig = configManager.get('server.mcp.coingeckoTools');
      toolSubset = serverConfig || [];
      
      if (toolSubset.length > 0) {
        console.error(`Loading curated subset of ${toolSubset.length} CoinGecko tools from server config`);
      } else {
        console.error('No CoinGecko tools specified in server config, loading all tools');
      }
    } catch (error) {
      console.error('Failed to load CoinGecko tools from server config:', error);
      console.error('Loading all tools');
    }

    // List all available tools from CoinGecko
    try {
      const toolsResponse = await this.coingeckoClient!.listTools();

      // Filter tools if we have a subset defined
      const toolsToRegister = toolSubset.length > 0
        ? toolsResponse.tools.filter(tool => toolSubset.includes(tool.name))
        : toolsResponse.tools;

      console.error(
        `Registering ${toolsToRegister.length} CoinGecko tools...`,
      );

      // Register each tool with coingecko_ prefix
      for (const tool of toolsToRegister) {
        const prefixedName = `coingecko_${tool.name}`;

        ToolRegistry.registerTool(
          {
            name: prefixedName,
            description: tool.description,
            inputSchema: tool.inputSchema,
          },
          async (request) => {
            await this.ensureConnected();

            try {
              console.error(`Calling CoinGecko tool: ${tool.name} with args:`, JSON.stringify(request.params.arguments || {}));
              const result = await this.coingeckoClient!.callTool({
                name: tool.name,
                arguments: request.params.arguments || {},
              });
              console.error(`CoinGecko tool ${tool.name} response received`);
              return result;
            } catch (error: any) {
              console.error(`CoinGecko tool ${tool.name} error:`, error);
              throw new Error(`CoinGecko API error: ${error.message}`);
            }
          },
        );
      }

      console.error(`Registered ${toolsToRegister.length} CoinGecko tools`);
    } catch (error) {
      console.error('Failed to register CoinGecko tools:', error);
    }
  }


  private async ensureConnected() {
    if (!this.connected || !this.coingeckoClient) {
      // Initialize if not already done
      if (!this.initPromise) {
        await this.initialize();
      } else {
        // Wait for initialization if it's in progress
        await this.initPromise;
      }

      if (!this.connected || !this.coingeckoClient) {
        throw new Error(
          'CoinGecko MCP server not connected. Check your COINGECKO_DEMO_API_KEY or COINGECKO_PRO_API_KEY environment variable.',
        );
      }
    }
  }

  async shutdown() {
    if (this.coingeckoClient && this.connected) {
      try {
        await this.coingeckoClient.close();
        this.connected = false;
        console.error('CoinGecko gateway disconnected');
      } catch (error) {
        console.error('Error disconnecting from CoinGecko:', error);
      }
    }
  }
}

// Global instance to ensure single subprocess
let globalGateway: CoinGeckoGateway | null = null;

// Export function to register CoinGecko tools
export async function registerCoinGeckoTools(
  server: Server,
  apiClient: GatewayApiClient,
): Promise<CoinGeckoGateway> {
  if (!globalGateway) {
    globalGateway = new CoinGeckoGateway(server, apiClient);

    // Initialize and wait for completion
    try {
      await globalGateway.initialize();
    } catch (error) {
      console.error('Failed to initialize CoinGecko gateway:', error);
      // Don't throw - allow Gateway to work without CoinGecko
    }

    // Handle graceful shutdown
    process.once('SIGINT', async () => {
      if (globalGateway) {
        await globalGateway.shutdown();
      }
    });

    process.once('SIGTERM', async () => {
      if (globalGateway) {
        await globalGateway.shutdown();
      }
    });
  }

  return globalGateway;
}
