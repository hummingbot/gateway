/**
 * Base Tool
 * Abstract base class for all Gateway tools.
 */

import axios from 'axios';
import { z } from 'zod';
import { getGatewayApiBaseUrl } from '../mcp/config';
import { logger } from '../../common/utils/logger';
import { McpServerConfig } from '../mcp/config';

export interface ToolDefinition<P = any, R = any> {
  name: string;
  description: string;
  category: string;
  parameters: z.ZodType<P>;
  execute: (params: P) => Promise<R>;
}

export abstract class BaseTool<P = any, R = any> implements ToolDefinition<P, R> {
  abstract name: string;
  abstract description: string;
  abstract category: string;
  abstract parameters: z.ZodType<P>;
  
  protected config: McpServerConfig;
  
  constructor(config: McpServerConfig) {
    this.config = config;
  }
  
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
  protected async callGatewayApi<T = any>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    data?: any
  ): Promise<T> {
    const baseUrl = getGatewayApiBaseUrl(this.config);
    const url = `${baseUrl}/${endpoint}`;
    
    try {
      logger.debug(`Calling Gateway API: ${method} ${url}`);
      if (data) {
        logger.debug(`Request data: ${JSON.stringify(data)}`);
      }
      
      const response = await axios({
        method,
        url,
        data,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      logger.debug(`Gateway API response: ${JSON.stringify(response.data)}`);
      return response.data as T;
    } catch (error) {
      logger.error(`Error calling Gateway API: ${error.message}`);
      
      if (axios.isAxiosError(error) && error.response) {
        logger.error(`Response status: ${error.response.status}`);
        logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
        throw new Error(`Gateway API error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
      }
      
      throw error;
    }
  }
  
  /**
   * Get tool metadata for registration
   * @returns Tool metadata
   */
  getMetadata(): { name: string; description: string; category: string } {
    return {
      name: this.name,
      description: this.description,
      category: this.category
    };
  }
}