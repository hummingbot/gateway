/**
 * LLM Provider Interface
 * Defines a common interface for different LLM providers.
 */

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  toolName?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface CompletionOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  stopSequences?: string[];
}

export interface CompletionResponse {
  id: string;
  text: string;
  toolCalls?: ToolCall[];
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LlmProviderConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  organization?: string;
}

/**
 * Base interface for all LLM providers
 */
export interface LlmProvider {
  /**
   * Get the name of the provider
   */
  getName(): string;
  
  /**
   * Get available models for this provider
   */
  getAvailableModels(): Promise<string[]>;
  
  /**
   * Generate a completion from a list of messages
   */
  generateCompletion(
    messages: Message[], 
    options?: Partial<CompletionOptions>
  ): Promise<CompletionResponse>;
  
  /**
   * Generate a streaming completion from a list of messages
   */
  streamCompletion(
    messages: Message[],
    options?: Partial<CompletionOptions>,
    onChunk?: (chunk: { text: string, toolCalls?: Partial<ToolCall>[] }) => void
  ): Promise<CompletionResponse>;
  
  /**
   * Format tools in the provider-specific format
   */
  formatTools(tools: ToolDefinition[]): any;
  
  /**
   * Extract tool calls from the provider's response format
   */
  extractToolCalls(response: any): ToolCall[];
}