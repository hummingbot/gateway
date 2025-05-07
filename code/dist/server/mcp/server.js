"use strict";
/**
 * MCP Server Implementation
 * Implements a simple server that exposes Gateway functionality.
 * Note: This is a simplified implementation that doesn't require the MCP SDK.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GatewayMcpServer = void 0;
exports.createMcpServer = createMcpServer;
const fastify_1 = __importDefault(require("fastify"));
const config_1 = require("./config");
const logger_1 = require("../../common/utils/logger");
// Simple McpServer implementation to replace the SDK dependency
class McpServer {
    constructor({ name, version, description }) {
        this.tools = new Map();
        this.name = name;
        this.version = version;
        this.description = description;
    }
    tool(name, parameters, handler) {
        this.tools.set(name, { schema: parameters, handler });
    }
    async handleRequest(body) {
        try {
            const { tool, params } = body;
            if (!tool || !this.tools.has(tool)) {
                return { error: `Tool '${tool}' not found` };
            }
            const toolDefinition = this.tools.get(tool);
            return await toolDefinition.handler(params);
        }
        catch (error) {
            return { error: error.message };
        }
    }
}
class GatewayMcpServer {
    constructor(userConfig = {}) {
        // Initialize configuration
        this.config = (0, config_1.mergeConfig)(userConfig);
        (0, config_1.validateConfig)(this.config);
        // Initialize simple MCP server implementation
        this.server = new McpServer({
            name: this.config.name,
            version: this.config.version,
            description: this.config.description
        });
        // Initialize HTTP server
        this.httpServer = (0, fastify_1.default)({
            logger: this.config.logLevel === 'debug'
        });
    }
    /**
     * Register a tool with the MCP server
     * @param name Tool name
     * @param parameters Tool parameters schema
     * @param handler Tool handler function
     */
    registerTool(name, parameters, handler) {
        this.server.tool(name, parameters, async (params) => {
            try {
                logger_1.logger.info(`Executing tool: ${name}`);
                logger_1.logger.debug(`Tool parameters: ${JSON.stringify(params)}`);
                const result = await handler(params);
                logger_1.logger.debug(`Tool result: ${JSON.stringify(result)}`);
                return {
                    content: [
                        {
                            type: 'text',
                            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
                        }
                    ]
                };
            }
            catch (error) {
                logger_1.logger.error(`Error executing tool ${name}: ${error}`);
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
    registerTools(tools) {
        tools.forEach(tool => {
            this.registerTool(tool.name, tool.parameters, tool.handler);
        });
    }
    /**
     * Start the MCP server
     */
    async start() {
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
                    logger_1.logger.info('Client disconnected from SSE stream');
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
            logger_1.logger.info(`MCP Server started at ${this.config.host}:${this.config.port}`);
            logger_1.logger.info(`Connected to Gateway API at ${this.config.gatewayApiUrl}:${this.config.gatewayApiPort}`);
        }
        catch (error) {
            logger_1.logger.error(`Failed to start MCP Server: ${error.message}`);
            throw error;
        }
    }
    /**
     * Stop the MCP server
     */
    async stop() {
        try {
            await this.httpServer.close();
            logger_1.logger.info('MCP Server stopped');
        }
        catch (error) {
            logger_1.logger.error(`Error stopping MCP Server: ${error.message}`);
            throw error;
        }
    }
}
exports.GatewayMcpServer = GatewayMcpServer;
// Factory function to create and initialize a Gateway MCP server
async function createMcpServer(config = {}) {
    const server = new GatewayMcpServer(config);
    return server;
}
//# sourceMappingURL=server.js.map