/**
 * MCP Server Configuration
 * Defines configuration for the Model Context Protocol (MCP) server.
 */
export interface McpServerConfig {
    name: string;
    version: string;
    description: string;
    gatewayApiUrl: string;
    gatewayApiPort: number;
    port: number;
    host: string;
    authToken?: string;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
}
export declare const DEFAULT_CONFIG: McpServerConfig;
export declare function mergeConfig(userConfig: Partial<McpServerConfig>): McpServerConfig;
export declare function getGatewayApiBaseUrl(config: McpServerConfig): string;
export declare function validateConfig(config: McpServerConfig): void;
