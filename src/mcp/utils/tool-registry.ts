import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
}

// Global registry to track all tools
export class ToolRegistry {
  private static tools: ToolDefinition[] = [];
  private static handlers: Map<string, (request: any) => Promise<any>> = new Map();
  
  static registerTool(tool: ToolDefinition, handler: (request: any) => Promise<any>) {
    this.tools.push(tool);
    this.handlers.set(tool.name, handler);
  }
  
  static getTools() {
    return this.tools;
  }
  
  static getAllTools(): ToolDefinition[] {
    return [...this.tools];
  }
  
  static getHandler(name: string) {
    return this.handlers.get(name);
  }
  
  static clear() {
    this.tools = [];
    this.handlers.clear();
  }
  
  static setupHandlers(server: Server) {
    // Set up the call handler
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const handler = this.handlers.get(request.params.name);
      if (handler) {
        return await handler(request);
      }
      throw new Error(`Unknown tool: ${request.params.name}`);
    });
    
    // Set up the list handler
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: this.tools };
    });
  }
}