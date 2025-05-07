/**
 * MCP Server Implementation
 * Implements a simple server that exposes Gateway functionality.
 * Note: This is a simplified implementation that doesn't require the MCP SDK.
 */
import { McpServerConfig } from './config';
export declare class GatewayMcpServer {
    private server;
    private httpServer;
    private config;
    constructor(userConfig?: Partial<McpServerConfig>);
    /**
     * Register a tool with the MCP server
     * @param name Tool name
     * @param parameters Tool parameters schema
     * @param handler Tool handler function
     */
    registerTool<P>(name: string, parameters: any, handler: (params: P) => Promise<any>): void;
    /**
     * Register multiple tools at once
     * @param tools Array of tool definitions
     */
    registerTools(tools: Array<{
        name: string;
        parameters: any;
        handler: (params: any) => Promise<any>;
    }>): void;
    /**
     * Start the MCP server
     */
    start(): Promise<void>;
    /**
     * Stop the MCP server
     */
    stop(): Promise<void>;
}
export declare function createMcpServer(config?: Partial<McpServerConfig>): Promise<GatewayMcpServer>;
