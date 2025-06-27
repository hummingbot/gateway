import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { GatewayApiClient } from "../utils/api-client";

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

export function asTextContentResult(result: Object): ToolCallResult {
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
        text: JSON.stringify({
          error,
          ...(details && { details }),
        }, null, 2),
      },
    ],
    isError: true,
  };
}