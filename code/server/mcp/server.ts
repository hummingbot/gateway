/**
 * MCP Server Implementation
 * Implements a simple server that exposes Gateway functionality.
 * Note: This is a simplified implementation that doesn't require the MCP SDK.
 */

import fastify, { FastifyInstance } from 'fastify';
import { McpServerConfig, DEFAULT_CONFIG, mergeConfig, validateConfig } from './config';
import { logger } from '../../common/utils/logger';

// Simple McpServer implementation to replace the SDK dependency
class McpServer {
  private name: string;
  private version: string;
  private description: string;
  private tools: Map<string, { schema: any, handler: Function }> = new Map();

  constructor({ name, version, description }: { name: string, version: string, description: string }) {
    this.name = name;
    this.version = version;
    this.description = description;
  }

  tool(name: string, parameters: any, handler: Function) {
    this.tools.set(name, { schema: parameters, handler });
  }

  async handleRequest(body: any) {
    try {
      const { tool, params } = body;
      if (!tool || !this.tools.has(tool)) {
        return { error: `Tool '${tool}' not found` };
      }
      
      const toolDefinition = this.tools.get(tool);
      return await toolDefinition.handler(params);
    } catch (error) {
      return { error: error.message };
    }
  }
}

export class GatewayMcpServer {
  private server: McpServer;
  private httpServer: FastifyInstance;
  private config: McpServerConfig;

  constructor(userConfig: Partial<McpServerConfig> = {}) {
    // Initialize configuration
    this.config = mergeConfig(userConfig);
    validateConfig(this.config);

    // Initialize simple MCP server implementation
    this.server = new McpServer({
      name: this.config.name,
      version: this.config.version,
      description: this.config.description
    });

    // Initialize HTTP server
    this.httpServer = fastify({
      logger: this.config.logLevel === 'debug'
    });
  }

  /**
   * Register a tool with the MCP server
   * @param name Tool name
   * @param parameters Tool parameters schema
   * @param handler Tool handler function
   */
  registerTool<P>(
    name: string,
    parameters: any,
    handler: (params: P) => Promise<any>
  ): void {
    this.server.tool(name, parameters, async (params: P) => {
      try {
        logger.info(`Executing tool: ${name}`);
        logger.debug(`Tool parameters: ${JSON.stringify(params)}`);
        
        const result = await handler(params);
        
        logger.debug(`Tool result: ${JSON.stringify(result)}`);
        return {
          content: [
            { 
              type: 'text', 
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) 
            }
          ]
        };
      } catch (error) {
        logger.error(`Error executing tool ${name}: ${error}`);
        return {
          content: [
            { 
              type: 'text', 
              text: `Error executing ${name}: ${error.message}` 
            }
          ]
        };
      }
    });
  }

  /**
   * Register multiple tools at once
   * @param tools Array of tool definitions
   */
  registerTools(tools: Array<{
    name: string;
    parameters: any;
    handler: (params: any) => Promise<any>;
  }>): void {
    tools.forEach(tool => {
      this.registerTool(tool.name, tool.parameters, tool.handler);
    });
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    try {
      // Set up HTTP server routes for SSE transport
      this.httpServer.post('/mcp', async (request, reply) => {
        const result = await this.server.handleRequest(request.body);
        return reply.send(result);
      });

      // Set up SSE endpoint
      this.httpServer.get('/mcp/sse', (request, reply) => {
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });

        // Handle client disconnect
        request.raw.on('close', () => {
          logger.info('Client disconnected from SSE stream');
        });

        // Keep the connection alive with a periodic message
        const keepAliveInterval = setInterval(() => {
          reply.raw.write('event: keepalive\ndata: {}\n\n');
        }, 30000);

        // Clear interval on connection close
        request.raw.on('close', () => {
          clearInterval(keepAliveInterval);
        });
      });

      // Start HTTP server
      await this.httpServer.listen({
        port: this.config.port,
        host: this.config.host
      });

      logger.info(`MCP Server started at ${this.config.host}:${this.config.port}`);
      logger.info(`Connected to Gateway API at ${this.config.gatewayApiUrl}:${this.config.gatewayApiPort}`);
    } catch (error) {
      logger.error(`Failed to start MCP Server: ${error.message}`);
      throw error;
    }
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    try {
      await this.httpServer.close();
      logger.info('MCP Server stopped');
    } catch (error) {
      logger.error(`Error stopping MCP Server: ${error.message}`);
      throw error;
    }
  }
}

// Factory function to create and initialize a Gateway MCP server
export async function createMcpServer(config: Partial<McpServerConfig> = {}): Promise<GatewayMcpServer> {
  const server = new GatewayMcpServer(config);
  return server;
}