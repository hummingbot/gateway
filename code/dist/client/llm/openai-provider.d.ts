/**
 * OpenAI LLM Provider Implementation
 */
import { LlmProvider, LlmProviderConfig, Message, CompletionOptions, CompletionResponse, ToolDefinition, ToolCall } from './provider-interface';
export declare class OpenAIProvider implements LlmProvider {
    private client;
    private model;
    constructor(config: LlmProviderConfig);
    getName(): string;
    getAvailableModels(): Promise<string[]>;
    generateCompletion(messages: Message[], options?: Partial<CompletionOptions>): Promise<CompletionResponse>;
    streamCompletion(messages: Message[], options?: Partial<CompletionOptions>, onChunk?: (chunk: {
        text: string;
        toolCalls?: Partial<ToolCall>[];
    }) => void): Promise<CompletionResponse>;
    formatTools(tools: ToolDefinition[]): any;
    extractToolCalls(responseMessage: any): ToolCall[];
    private formatMessages;
    private mapFinishReason;
    private estimateTokenCount;
}
