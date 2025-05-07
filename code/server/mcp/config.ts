/**
 * MCP Server Configuration
 * Defines configuration for the Model Context Protocol (MCP) server.
 */

export interface McpServerConfig {
  // Server identification
  name: string;
  version: string;
  description: string;
  
  // Gateway API configuration
  gatewayApiUrl: string;
  gatewayApiPort: number;
  
  // Server configuration
  port: number;
  host: string;
  
  // Security configuration
  authToken?: string;
  
  // Logging configuration
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export const DEFAULT_CONFIG: McpServerConfig = {
  name: 'gateway-mcp-server',
  version: '0.1.0',
  description: 'Model Context Protocol server for Hummingbot Gateway',
  
  gatewayApiUrl: 'http://localhost',
  gatewayApiPort: 15888,
  
  port: 15889,
  host: 'localhost',
  
  logLevel: 'info'
};

export function mergeConfig(userConfig: Partial<McpServerConfig>): McpServerConfig {
  return {
    ...DEFAULT_CONFIG,
    ...userConfig
  };
}

export function getGatewayApiBaseUrl(config: McpServerConfig): string {
  return `${config.gatewayApiUrl}:${config.gatewayApiPort}`;
}

export function validateConfig(config: McpServerConfig): void {
  // Validate required fields
  if (!config.name) throw new Error('Server name is required');
  if (!config.version) throw new Error('Server version is required');
  if (!config.gatewayApiUrl) throw new Error('Gateway API URL is required');
  
  // Validate port ranges
  if (config.port < 0 || config.port > 65535) {
    throw new Error('Port must be between 0 and 65535');
  }
  
  if (config.gatewayApiPort < 0 || config.gatewayApiPort > 65535) {
    throw new Error('Gateway API port must be between 0 and 65535');
  }
}