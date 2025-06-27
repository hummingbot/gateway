import { z } from "zod";
import { GatewayApiClient } from "./utils/api-client";
import { ToolRegistry, ToolDefinition } from "./utils/tool-registry";

// Simple helper to convert zod schema to JSON schema format
// Since we're defining schemas manually, this is just a placeholder
const zodToJsonSchema = (schema: z.ZodSchema) => {
  return {
    type: "object" as const,
    properties: {},
    required: [],
    additionalProperties: false,
  };
};

/**
 * Dynamic tools for Gateway MCP that expose all tools through a discovery interface.
 * This allows users to approve only 3 tools instead of all individual tools.
 */
export function createDynamicTools(
  apiClient: GatewayApiClient, 
  allTools: ToolDefinition[],
  allHandlers: Map<string, (request: any) => Promise<any>>
) {
  
  // 1. List Gateway Tools
  const listToolsSchema = z.object({
    search_query: z
      .string()
      .optional()
      .describe("Optional search query to filter tools by name, description, or category"),
    category: z
      .string()
      .optional()
      .describe("Filter by tool category (discovery, config, trading, wallet, tokens)"),
  });

  ToolRegistry.registerTool(
    {
      name: "list_gateway_tools",
      description: "List or search for available Gateway MCP tools",
      inputSchema: {
        type: "object",
        properties: {
          search_query: { type: "string", description: "Optional search query" },
          category: { 
            type: "string", 
            enum: ["discovery", "config", "trading", "wallet", "tokens"],
            description: "Filter by category" 
          },
        },
        additionalProperties: false,
      },
    },
    async (request) => {
      const { search_query, category } = request.params.arguments || {};
      
      let filteredTools = allTools;
      
      // Filter by category
      if (category) {
        filteredTools = filteredTools.filter(tool => 
          tool.name.toLowerCase().includes(category.toLowerCase())
        );
      }
      
      // Filter by search query
      if (search_query && search_query.trim().length > 0) {
        const query = search_query.toLowerCase();
        filteredTools = filteredTools.filter(tool => {
          const fieldsToMatch = [
            tool.name,
            tool.description,
          ];
          return fieldsToMatch.some(field => field.toLowerCase().includes(query));
        });
      }
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              tools: filteredTools.map(tool => ({
                name: tool.name,
                description: tool.description,
                category: tool.name.split('_')[0] // Extract category from tool name
              })),
              total: filteredTools.length
            }, null, 2),
          },
        ],
      };
    }
  );

  // 2. Get Tool Schema
  const getSchemaSchema = z.object({
    tool_name: z.string().describe("The name of the tool to get the schema for"),
  });

  ToolRegistry.registerTool(
    {
      name: "get_tool_schema",
      description: "Get the input schema and details for a specific Gateway tool",
      inputSchema: {
        type: "object",
        properties: {
          tool_name: { type: "string", description: "Tool name" },
        },
        required: ["tool_name"],
        additionalProperties: false,
      },
    },
    async (request) => {
      const { tool_name } = request.params.arguments || {};
      
      if (!tool_name) {
        throw new Error("tool_name is required");
      }
      
      const tool = allTools.find(t => t.name === tool_name);
      if (!tool) {
        throw new Error(`Tool '${tool_name}' not found. Use list_gateway_tools to see available tools.`);
      }
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema,
            }, null, 2),
          },
        ],
      };
    }
  );

  // 3. Invoke Gateway Tool
  const invokeToolSchema = z.object({
    tool_name: z.string().describe("The name of the tool to invoke"),
    arguments: z
      .record(z.string(), z.any())
      .describe("Arguments to pass to the tool, matching its input schema"),
  });

  ToolRegistry.registerTool(
    {
      name: "invoke_gateway_tool",
      description: "Invoke a Gateway tool with the specified arguments. Use list_gateway_tools to discover tools and get_tool_schema to see required arguments.",
      inputSchema: {
        type: "object",
        properties: {
          tool_name: { type: "string", description: "Tool name to invoke" },
          arguments: { 
            type: "object", 
            description: "Arguments matching the tool's schema",
            additionalProperties: true 
          },
        },
        required: ["tool_name"],
        additionalProperties: false,
      },
    },
    async (request) => {
      const { tool_name, arguments: toolArgs = {} } = request.params.arguments || {};
      
      if (!tool_name) {
        throw new Error("tool_name is required");
      }
      
      const handler = allHandlers.get(tool_name);
      if (!handler) {
        throw new Error(`Tool '${tool_name}' not found. Use list_gateway_tools to see available tools.`);
      }
      
      // Create a new request with the tool arguments
      const toolRequest = {
        ...request,
        params: {
          ...request.params,
          arguments: toolArgs,
        },
      };
      
      // Invoke the actual tool handler
      return await handler(toolRequest);
    }
  );

  return [
    "list_gateway_tools",
    "get_tool_schema", 
    "invoke_gateway_tool"
  ];
}