/**
 * Claude LLM Provider Implementation
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  LlmProvider,
  LlmProviderConfig,
  Message,
  CompletionOptions,
  CompletionResponse,
  ToolDefinition,
  ToolCall
} from './provider-interface';

const DEFAULT_MODEL = 'claude-3-opus-20240229';

export class ClaudeProvider implements LlmProvider {
  private client: Anthropic;
  private model: string;
  
  constructor(config: LlmProviderConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl
    });
    this.model = config.model || DEFAULT_MODEL;
  }
  
  getName(): string {
    return 'claude';
  }
  
  async getAvailableModels(): Promise<string[]> {
    return [
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
      'claude-2.1',
      'claude-2.0',
      'claude-instant-1.2'
    ];
  }
  
  async generateCompletion(
    messages: Message[],
    options: Partial<CompletionOptions> = {}
  ): Promise<CompletionResponse> {
    const formattedMessages = this.formatMessages(messages);
    const tools = options.tools ? this.formatTools(options.tools) : undefined;
    
    try {
      const response = await this.client.messages.create({
        model: options.model || this.model,
        messages: formattedMessages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        tools: tools,
        system: this.extractSystemPrompt(messages),
        stop_sequences: options.stopSequences
      });
      
      const toolCalls = this.extractToolCalls(response);
      
      return {
        id: response.id,
        text: response.content[0]?.text || '',
        toolCalls: toolCalls,
        finishReason: this.mapFinishReason(response.stop_reason),
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens
        }
      };
    } catch (error) {
      throw new Error(`Claude API error: ${error.message}`);
    }
  }
  
  async streamCompletion(
    messages: Message[],
    options: Partial<CompletionOptions> = {},
    onChunk?: (chunk: { text: string; toolCalls?: Partial<ToolCall>[] }) => void
  ): Promise<CompletionResponse> {
    const formattedMessages = this.formatMessages(messages);
    const tools = options.tools ? this.formatTools(options.tools) : undefined;
    
    try {
      const stream = await this.client.messages.create({
        model: options.model || this.model,
        messages: formattedMessages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        tools: tools,
        system: this.extractSystemPrompt(messages),
        stop_sequences: options.stopSequences,
        stream: true
      });
      
      let fullText = '';
      let responseId = '';
      let usage = { input_tokens: 0, output_tokens: 0 };
      let stopReason = '';
      let toolCalls: any[] = [];
      
      for await (const chunk of stream) {
        responseId = chunk.id;
        if (chunk.usage) {
          usage = chunk.usage;
        }
        
        if (chunk.stop_reason) {
          stopReason = chunk.stop_reason;
        }
        
        // Handle text content
        const deltaText = chunk.delta?.text || '';
        if (deltaText) {
          fullText += deltaText;
          if (onChunk) {
            onChunk({ text: deltaText });
          }
        }
        
        // Handle tool calls
        if (chunk.delta?.tool_calls && chunk.delta.tool_calls.length > 0) {
          for (const toolCall of chunk.delta.tool_calls) {
            const existingToolCall = toolCalls.find(tc => tc.id === toolCall.id);
            
            if (existingToolCall) {
              existingToolCall.input = {
                ...existingToolCall.input,
                ...(toolCall.input || {})
              };
            } else {
              toolCalls.push(toolCall);
            }
            
            if (onChunk) {
              onChunk({ 
                text: '',
                toolCalls: [{
                  id: toolCall.id,
                  name: toolCall.name,
                  arguments: toolCall.input || {}
                }]
              });
            }
          }
        }
      }
      
      const extractedToolCalls = toolCalls.map(tc => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.input || {}
      }));
      
      return {
        id: responseId,
        text: fullText,
        toolCalls: extractedToolCalls.length > 0 ? extractedToolCalls : undefined,
        finishReason: this.mapFinishReason(stopReason),
        usage: {
          promptTokens: usage.input_tokens,
          completionTokens: usage.output_tokens,
          totalTokens: usage.input_tokens + usage.output_tokens
        }
      };
    } catch (error) {
      throw new Error(`Claude streaming API error: ${error.message}`);
    }
  }
  
  formatTools(tools: ToolDefinition[]): any {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object',
        properties: tool.parameters,
        required: Object.keys(tool.parameters).filter(
          key => !tool.parameters[key].optional
        )
      }
    }));
  }
  
  extractToolCalls(response: any): ToolCall[] {
    if (!response.content) {
      return [];
    }
    
    const toolCalls: ToolCall[] = [];
    
    for (const content of response.content) {
      if (content.type === 'tool_use') {
        toolCalls.push({
          id: content.id,
          name: content.name,
          arguments: content.input || {}
        });
      }
    }
    
    return toolCalls;
  }
  
  private formatMessages(messages: Message[]): any[] {
    return messages
      .filter(msg => msg.role !== 'system') // Remove system messages as they're handled separately
      .map(msg => {
        if (msg.role === 'tool') {
          return {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: msg.toolCallId,
                name: msg.toolName,
                input: JSON.parse(msg.content)
              }
            ]
          };
        }
        
        return {
          role: msg.role,
          content: msg.content
        };
      });
  }
  
  private extractSystemPrompt(messages: Message[]): string | undefined {
    const systemMessage = messages.find(msg => msg.role === 'system');
    return systemMessage?.content;
  }
  
  private mapFinishReason(reason: string): CompletionResponse['finishReason'] {
    switch (reason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'tool_use':
        return 'tool_calls';
      case 'content_filtered':
        return 'content_filter';
      default:
        return 'stop';
    }
  }
}