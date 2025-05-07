"use strict";
/**
 * MCP Server Configuration
 * Defines configuration for the Model Context Protocol (MCP) server.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = void 0;
exports.mergeConfig = mergeConfig;
exports.getGatewayApiBaseUrl = getGatewayApiBaseUrl;
exports.validateConfig = validateConfig;
exports.DEFAULT_CONFIG = {
    name: 'gateway-mcp-server',
    version: '0.1.0',
    description: 'Model Context Protocol server for Hummingbot Gateway',
    gatewayApiUrl: 'http://localhost',
    gatewayApiPort: 15888,
    port: 15889,
    host: 'localhost',
    logLevel: 'info'
};
function mergeConfig(userConfig) {
    return {
        ...exports.DEFAULT_CONFIG,
        ...userConfig
    };
}
function getGatewayApiBaseUrl(config) {
    return `${config.gatewayApiUrl}:${config.gatewayApiPort}`;
}
function validateConfig(config) {
    // Validate required fields
    if (!config.name)
        throw new Error('Server name is required');
    if (!config.version)
        throw new Error('Server version is required');
    if (!config.gatewayApiUrl)
        throw new Error('Gateway API URL is required');
    // Validate port ranges
    if (config.port < 0 || config.port > 65535) {
        throw new Error('Port must be between 0 and 65535');
    }
    if (config.gatewayApiPort < 0 || config.gatewayApiPort > 65535) {
        throw new Error('Gateway API port must be between 0 and 65535');
    }
}
//# sourceMappingURL=config.js.map