import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { PROMPT_DEFINITIONS } from './promptDefinitions';
import { PROMPT_HANDLERS } from './prompts';
import { getAllResources, handleResource } from './resources';
import { TOOL_DEFINITIONS } from './toolDefinitions';
import { TOOL_HANDLERS } from './tools';
import { GatewayApiClient } from './utils/api-client';
import { ToolRegistry } from './utils/tool-registry';

// Server context that will be passed to handlers
export interface ServerContext {
  apiClient: GatewayApiClient;
  configPath: string;
  logsPath?: string;
  withCoinGecko: boolean;
  envVars: Record<string, string>;
}

// Configure and set up the MCP server
export async function configureServer({
  server,
  context,
}: {
  server: Server;
  context: ServerContext;
}) {
  // Register tools
  for (const toolDef of TOOL_DEFINITIONS) {
    const handler = TOOL_HANDLERS[toolDef.name];

    // Convert params schema to JSON schema for MCP SDK
    const paramsSchema = toolDef.paramsSchema || {};
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const [key, schema] of Object.entries(paramsSchema)) {
      // Extract the underlying Zod schema and convert to JSON schema
      const zodSchema = schema as z.ZodTypeAny;
      properties[key] = zodToJsonSchema(zodSchema);

      if (!zodSchema.isOptional()) {
        required.push(key);
      }
    }

    const inputSchema = {
      type: 'object' as const,
      properties,
      required: required.length > 0 ? required : undefined,
    };

    // Register with ToolRegistry (for compatibility)
    ToolRegistry.registerTool(
      {
        name: toolDef.name,
        description: toolDef.description,
        inputSchema,
      },
      async (request) => {
        try {
          const params = request.params.arguments as any;
          const result = await handler(
            {
              apiClient: context.apiClient,
              configPath: context.configPath,
            },
            params,
          );

          return {
            content: [
              {
                type: 'text',
                text: result,
              },
            ],
          };
        } catch (error: any) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      },
    );
  }

  // Register prompt get handler
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const promptName = request.params.name;
    const promptDef = PROMPT_DEFINITIONS.find((def) => def.name === promptName);

    if (!promptDef) {
      throw new Error(`Prompt not found: ${promptName}`);
    }

    const handler = PROMPT_HANDLERS[promptDef.name];
    const params = request.params.arguments || {};
    const result = await handler({}, params as any);

    return {
      description: promptDef.description,
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: result,
          },
        },
      ],
    };
  });

  // Register prompts list handler
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: PROMPT_DEFINITIONS.map((def) => ({
        name: def.name,
        description: def.description,
        arguments: Object.entries(def.paramsSchema || {}).map(
          ([key, schema]) => {
            const zodSchema = schema as z.ZodTypeAny;
            return {
              name: key,
              description: zodSchema.description || key,
              required: !zodSchema.isOptional(),
            };
          },
        ),
      })),
    };
  });

  // Register resources handlers
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const resources = await getAllResources({
      configPath: context.configPath,
      logsPath: context.logsPath,
    });

    return {
      resources: resources.map((r) => ({
        uri: r.uri,
        name: r.name,
        mimeType: r.mimeType,
        description: r.description,
      })),
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    try {
      const content = await handleResource(uri as string, {
        configPath: context.configPath,
        logsPath: context.logsPath,
      });

      return {
        contents: [
          {
            uri: uri as string,
            mimeType: 'text/plain',
            text: content,
          },
        ],
      };
    } catch (error: any) {
      throw new Error(`Failed to read resource: ${error.message}`);
    }
  });

  // Register CoinGecko tools if enabled
  if (context.withCoinGecko) {
    const { registerCoinGeckoTools } = await import(
      './tools/coingecko-gateway'
    );
    await registerCoinGeckoTools(server, context.apiClient);
  }

  // Set up tool list handler (for MCP SDK compatibility)
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: ToolRegistry.getAllTools(),
    };
  });

  // Set up tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    return ToolRegistry.callTool(request.params.name as string, request);
  });
}

// Helper function to convert Zod schema to JSON Schema
function zodToJsonSchema(schema: z.ZodTypeAny): any {
  if (schema instanceof z.ZodString) {
    return {
      type: 'string',
      description: schema.description,
    };
  } else if (schema instanceof z.ZodNumber) {
    return {
      type: 'number',
      description: schema.description,
    };
  } else if (schema instanceof z.ZodBoolean) {
    return {
      type: 'boolean',
      description: schema.description,
    };
  } else if (schema instanceof z.ZodEnum) {
    const values = schema._def.values;
    return {
      type: 'string',
      enum: values,
      description: schema.description,
    };
  } else if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema._def.innerType);
  } else if (schema instanceof z.ZodAny) {
    return {
      description: schema.description,
    };
  } else {
    // Default fallback
    return {
      type: 'string',
      description: schema.description,
    };
  }
}
