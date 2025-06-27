import { spawn, ChildProcess } from "child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ToolRegistry } from "../utils/tool-registry";
import { GatewayApiClient } from "../utils/api-client";

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
  private isDynamicMode: boolean;

  constructor(private server: Server, private apiClient: GatewayApiClient, isDynamicMode: boolean = false) {
    this.isDynamicMode = isDynamicMode;
    if (isDynamicMode) {
      // Register the 3 dynamic tools for dynamic mode
      this.registerDynamicTools();
    }
    // In all tools mode, we'll proxy all tools from the subprocess
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
      
      // In all tools mode, discover and register all CoinGecko tools
      if (!this.isDynamicMode) {
        await this.registerAllTools();
      }
      
      console.error("CoinGecko gateway initialized successfully");
    } catch (error) {
      console.error("Failed to initialize CoinGecko gateway:", error);
      // Don't throw - allow Gateway to work without CoinGecko
    }
  }

  private async connectToCoinGecko() {
    console.error("Starting CoinGecko MCP server subprocess...");
    
    // Create stdio transport for the subprocess
    const args = ["-y", "@coingecko/coingecko-mcp@latest"];
    if (this.isDynamicMode) {
      args.push("--tools=dynamic");
    }
    // In all tools mode, don't pass --tools=dynamic to get all individual tools
    
    this.transport = new StdioClientTransport({
      command: "npx",
      args,
      env: { ...process.env }
    });
    
    this.coingeckoClient = new Client(
      { name: "gateway-coingecko", version: "1.0.0" },
      { capabilities: {} }
    );
    
    try {
      await this.coingeckoClient.connect(this.transport);
      this.connected = true;
      console.error("Connected to CoinGecko MCP server");
    } catch (error) {
      console.error("Failed to connect to CoinGecko MCP server:", error);
      throw error;
    }
  }

  private async registerAllTools() {
    // List all available tools from CoinGecko
    try {
      const toolsResponse = await this.coingeckoClient!.listTools();
      
      console.error(`Registering ${toolsResponse.tools.length} CoinGecko tools...`);
      
      // Register each tool with coingecko_ prefix
      for (const tool of toolsResponse.tools) {
        const prefixedName = `coingecko_${tool.name}`;
        
        ToolRegistry.registerTool(
          {
            name: prefixedName,
            description: tool.description,
            inputSchema: tool.inputSchema
          },
          async (request) => {
            await this.ensureConnected();
            
            try {
              const result = await this.coingeckoClient!.callTool({
                name: tool.name,
                arguments: request.params.arguments || {}
              });
              return result;
            } catch (error: any) {
              throw new Error(`CoinGecko API error: ${error.message}`);
            }
          }
        );
      }
      
      console.error(`Registered ${toolsResponse.tools.length} CoinGecko tools`);
    } catch (error) {
      console.error("Failed to register CoinGecko tools:", error);
    }
  }

  private registerDynamicTools() {
    // 1. List API endpoints
    ToolRegistry.registerTool(
      {
        name: "coingecko_list_api_endpoints",
        description: "List all available CoinGecko API endpoints with optional filtering",
        inputSchema: {
          type: "object",
          properties: {
            search_query: {
              type: "string",
              description: "Optional search query to filter endpoints"
            }
          },
          additionalProperties: false
        }
      },
      async (request) => {
        await this.ensureConnected();
        
        try {
          const result = await this.coingeckoClient!.callTool({
            name: "list_api_endpoints",
            arguments: request.params.arguments || {}
          });
          return result;
        } catch (error: any) {
          throw new Error(`CoinGecko API error: ${error.message}`);
        }
      }
    );

    // 2. Get endpoint schema
    ToolRegistry.registerTool(
      {
        name: "coingecko_get_api_endpoint_schema",
        description: "Get the schema for a specific CoinGecko API endpoint",
        inputSchema: {
          type: "object",
          properties: {
            endpoint: {
              type: "string",
              description: "The name of the endpoint to get the schema for"
            }
          },
          required: ["endpoint"],
          additionalProperties: false
        }
      },
      async (request) => {
        await this.ensureConnected();
        
        try {
          const result = await this.coingeckoClient!.callTool({
            name: "get_api_endpoint_schema",
            arguments: request.params.arguments || {}
          });
          return result;
        } catch (error: any) {
          throw new Error(`CoinGecko API error: ${error.message}`);
        }
      }
    );

    // 3. Invoke API endpoint
    ToolRegistry.registerTool(
      {
        name: "coingecko_invoke_api_endpoint",
        description: "Invoke a CoinGecko API endpoint with the specified arguments",
        inputSchema: {
          type: "object",
          properties: {
            endpoint_name: {
              type: "string",
              description: "The name of the endpoint to invoke"
            },
            args: {
              type: "object",
              description: "The arguments to pass to the endpoint",
              additionalProperties: true
            }
          },
          required: ["endpoint_name"],
          additionalProperties: false
        }
      },
      async (request) => {
        await this.ensureConnected();
        
        try {
          const result = await this.coingeckoClient!.callTool({
            name: "invoke_api_endpoint",
            arguments: request.params.arguments || {}
          });
          return result;
        } catch (error: any) {
          throw new Error(`CoinGecko API error: ${error.message}`);
        }
      }
    );
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
        throw new Error("CoinGecko MCP server not connected. Check your COINGECKO_DEMO_API_KEY or COINGECKO_PRO_API_KEY environment variable.");
      }
    }
  }

  async shutdown() {
    if (this.coingeckoClient && this.connected) {
      try {
        await this.coingeckoClient.close();
        this.connected = false;
        console.error("CoinGecko gateway disconnected");
      } catch (error) {
        console.error("Error disconnecting from CoinGecko:", error);
      }
    }
  }
}

// Global instance to ensure single subprocess
let globalGateway: CoinGeckoGateway | null = null;

// Export function to register CoinGecko tools
export async function registerCoinGeckoTools(server: Server, apiClient: GatewayApiClient, isDynamicMode: boolean = false): Promise<CoinGeckoGateway> {
  if (!globalGateway) {
    globalGateway = new CoinGeckoGateway(server, apiClient, isDynamicMode);
    
    // Initialize and wait for completion
    try {
      await globalGateway.initialize();
    } catch (error) {
      console.error("Failed to initialize CoinGecko gateway:", error);
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