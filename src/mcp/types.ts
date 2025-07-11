import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { PROMPT_DEFINITIONS } from './promptDefinitions';
import { TOOL_DEFINITIONS } from './toolDefinitions';
import { GatewayApiClient } from './utils/api-client';

// Extract tool names as literal types
export type ToolName = (typeof TOOL_DEFINITIONS)[number]['name'];

// Extract prompt names as literal types
export type PromptName = (typeof PROMPT_DEFINITIONS)[number]['name'];

// Generic handler result type
export interface HandlerResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

// API response types
export interface SwapQuoteResponse {
  expectedOut: string;
  price: string;
  priceImpact: string;
  gasCost: string;
  gasToken: string;
  gasPrice: string;
  routes: any[];
}

export interface SwapExecuteResponse {
  txHash: string;
  status: string;
  expectedOut: string;
  gasUsed?: string;
}

export interface BalanceResponse {
  balances: Array<{
    symbol: string;
    balance: string;
    address?: string;
  }>;
}

export interface TransactionStatusResponse {
  status: string;
  blockNumber?: number;
  confirmations?: number;
  from: string;
  to: string;
  value: string;
  gasUsed?: string;
  gasPrice: string;
  logs?: any[];
}

// Error types
export class UserInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserInputError';
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Helper type utilities
type ZodifyRecord<T extends Record<string, z.ZodTypeAny>> = {
  [K in keyof T]: z.infer<T[K]>;
};

// Extract tool definition type
export type ToolDefinition<T extends ToolName> = Extract<(typeof TOOL_DEFINITIONS)[number], { name: T }>;

// Extract prompt definition type
export type PromptDefinition<T extends PromptName> = Extract<(typeof PROMPT_DEFINITIONS)[number], { name: T }>;

// Infer params from tool definitions
export type ToolParams<T extends ToolName> =
  ToolDefinition<T> extends {
    paramsSchema: Record<string, any>;
  }
    ? ZodifyRecord<ToolDefinition<T>['paramsSchema']>
    : Record<string, never>;

// Infer params from prompt definitions
export type PromptParams<T extends PromptName> =
  PromptDefinition<T> extends {
    paramsSchema: Record<string, any>;
  }
    ? ZodifyRecord<PromptDefinition<T>['paramsSchema']>
    : Record<string, never>;

// Handler function types with proper context
export type ToolHandlerExtended<T extends ToolName> = (context: any, params: ToolParams<T>) => Promise<string>;

export type PromptHandlerExtended<T extends PromptName> = (context: any, params: PromptParams<T>) => Promise<string>;

// Registry types
export interface ToolInfo {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface PromptInfo {
  name: string;
  description: string;
  arguments: Array<{
    name: string;
    description: string;
    required: boolean;
  }>;
}

export interface ResourceInfo {
  uri: string;
  name: string;
  mimeType: string;
  description: string;
}

// Legacy types for compatibility
export type Metadata = {
  resource: string;
  operation: 'read' | 'write';
  tags: string[];
  httpMethod?: string;
  httpPath?: string;
  operationId?: string;
};

export type HandlerFunction = (
  client: GatewayApiClient,
  args: Record<string, unknown> | undefined,
) => Promise<ToolCallResult>;

export type Endpoint = {
  metadata: Metadata;
  tool: Tool;
  handler: HandlerFunction;
};

type TextContentBlock = {
  type: 'text';
  text: string;
};

type ImageContentBlock = {
  type: 'image';
  data: string;
  mimeType: string;
};

type AudioContentBlock = {
  type: 'audio';
  data: string;
  mimeType: string;
};

type ResourceContentBlock = {
  type: 'resource';
  resource:
    | {
        uri: string;
        mimeType: string;
        text: string;
      }
    | {
        uri: string;
        mimeType: string;
        blob: string;
      };
};

export type ContentBlock = TextContentBlock | ImageContentBlock | AudioContentBlock | ResourceContentBlock;

export type ToolCallResult = {
  content: ContentBlock[];
  isError?: boolean;
};

export function asTextContentResult(result: object): ToolCallResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

export function asErrorContentResult(error: string, details?: any): ToolCallResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            error,
            ...(details && { details }),
          },
          null,
          2,
        ),
      },
    ],
    isError: true,
  };
}

// Fallback types
export interface ChainInfo {
  name: string;
  chain: string;
  networks: string[];
}

export interface ConnectorInfo {
  name: string;
  chains: string[];
}

export interface WalletInfo {
  address: string;
  chain: string;
}

export interface GatewayConfig {
  chains: ChainInfo[];
  connectors: ConnectorInfo[];
  wallets: WalletInfo[];
}
