/**
 * Base Tool
 * Abstract base class for all Gateway tools.
 */
import { z } from 'zod';
import { McpServerConfig } from '../mcp/config';
export interface ToolDefinition<P = any, R = any> {
    name: string;
    description: string;
    category: string;
    parameters: z.ZodType<P>;
    execute: (params: P) => Promise<R>;
}
export declare abstract class BaseTool<P = any, R = any> implements ToolDefinition<P, R> {
    abstract name: string;
    abstract description: string;
    abstract category: string;
    abstract parameters: z.ZodType<P>;
    protected config: McpServerConfig;
    constructor(config: McpServerConfig);
    /**
     * Execute the tool with the given parameters
     * @param params Tool parameters
     * @returns Tool execution result
     */
    abstract execute(params: P): Promise<R>;
    /**
     * Helper method to call Gateway API endpoints
     * @param endpoint Gateway API endpoint (without leading slash)
     * @param method HTTP method
     * @param data Request data
     * @returns API response
     */
    protected callGatewayApi<T = any>(endpoint: string, method?: 'GET' | 'POST' | 'PUT' | 'DELETE', data?: any): Promise<T>;
    /**
     * Get tool metadata for registration
     * @returns Tool metadata
     */
    getMetadata(): {
        name: string;
        description: string;
        category: string;
    };
}
