import { LlmProvider } from '../llm/provider-interface';
import { GatewayMcpServer } from '../../server/mcp/server';
export declare const startInkApp: (llmProvider: LlmProvider, mcpServer: GatewayMcpServer, options?: {
    systemPrompt?: string;
}) => any;
