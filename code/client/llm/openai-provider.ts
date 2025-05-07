/**
 * OpenAI LLM Provider Implementation
 */

import OpenAI from 'openai';
import {
  LlmProvider,
  LlmProviderConfig,
  Message,
  CompletionOptions,
  CompletionResponse,
  ToolDefinition,
  ToolCall
} from './provider-interface';

const DEFAULT_MODEL = 'gpt-4-turbo-preview';

export class OpenAIProvider implements LlmProvider {
  private client: OpenAI;
  private model: string;
  
  constructor(config: LlmProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      organization: config.organization
    });
    this.model = config.model || DEFAULT_MODEL;
  }
  
  getName(): string {
    return 'openai';
  }
  
  async getAvailableModels(): Promise<string[]> {
    try {
      const models = await this.client.models.list();
      return models.data.map(model => model.id);
    } catch (error) {
      console.error('Error fetching OpenAI models:', error);
      return [
        'gpt-4-turbo-preview',
        'gpt-4-0125-preview',
        'gpt-4-1106-preview',
        'gpt-4',
        'gpt-4-32k',
        'gpt-3.5-turbo',
        'gpt-3.5-turbo-16k'
      ];
    }
  }
  
  async generateCompletion(
    messages: Message[],
    options: Partial<CompletionOptions> = {}
  ): Promise<CompletionResponse> {
    const formattedMessages = this.formatMessages(messages);
    const tools = options.tools ? this.formatTools(options.tools) : undefined;
    
    try {
      const response = await this.client.chat.completions.create({
        model: options.model || this.model,
        messages: formattedMessages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        tools: tools,
        stop: options.stopSequences
      });
      
      const content = response.choices[0]?.message.content || '';
      const toolCalls = this.extractToolCalls(response.choices[0]?.message);
      
      return {
        id: response.id,
        text: content,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        finishReason: this.mapFinishReason(response.choices[0]?.finish_reason),
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0
        }
      };
    } catch (error) {
      throw new Error(`OpenAI API error: ${error.message}`);
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
      const stream = await this.client.chat.completions.create({
        model: options.model || this.model,
        messages: formattedMessages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        tools: tools,
        stop: options.stopSequences,
        stream: true
      });
      
      let fullText = '';
      let responseId = '';
      let finishReason = '';
      let toolCalls: any[] = [];
      
      for await (const chunk of stream) {
        responseId = chunk.id;
        
        if (chunk.choices[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason;
        }
        
        // Handle text content
        const deltaPart = chunk.choices[0]?.delta?.content || '';
        if (deltaPart) {
          fullText += deltaPart;
          if (onChunk) {
            onChunk({ text: deltaPart });
          }
        }
        
        // Handle tool calls
        if (chunk.choices[0]?.delta?.tool_calls) {
          for (const toolCall of chunk.choices[0].delta.tool_calls) {
            const toolCallId = toolCall.index?.toString() || '0';
            
            // Initialize tool call if it doesn't exist
            if (!toolCalls[toolCallId]) {
              toolCalls[toolCallId] = {
                id: toolCall.id || `call_${toolCallId}`,
                name: toolCall.function?.name || '',
                arguments: ''
              };
            }
            
            // Append to existing tool call
            if (toolCall.function?.name) {
              toolCalls[toolCallId].name = toolCall.function.name;
            }
            
            if (toolCall.function?.arguments) {
              toolCalls[toolCallId].arguments += toolCall.function.arguments;
            }
            
            if (onChunk) {
              onChunk({
                text: '',
                toolCalls: [{
                  id: toolCalls[toolCallId].id,
                  name: toolCalls[toolCallId].name,
                  arguments: {} // We'll parse this at the end when we have complete JSON
                }]
              });
            }
          }
        }
      }
      
      // Parse tool call arguments from strings to objects
      const parsedToolCalls = toolCalls.map(tc => {
        let args = {};
        try {
          args = tc.arguments ? JSON.parse(tc.arguments) : {};
        } catch (error) {
          console.warn(`Failed to parse tool call arguments for ${tc.name}:`, error);
        }
        
        return {
          id: tc.id,
          name: tc.name,
          arguments: args
        };
      });
      
      // We don't have usage stats from streaming API, so estimate based on tokens
      const promptTokens = this.estimateTokenCount(JSON.stringify(formattedMessages));
      const completionTokens = this.estimateTokenCount(fullText);
      
      return {
        id: responseId,
        text: fullText,
        toolCalls: parsedToolCalls.length > 0 ? parsedToolCalls : undefined,
        finishReason: this.mapFinishReason(finishReason),
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens
        }
      };
    } catch (error) {
      throw new Error(`OpenAI streaming API error: ${error.message}`);
    }
  }
  
  formatTools(tools: ToolDefinition[]): any {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: tool.parameters,
          required: Object.keys(tool.parameters).filter(
            key => !tool.parameters[key].optional
          )
        }
      }
    }));
  }
  
  extractToolCalls(responseMessage: any): ToolCall[] {
    if (!responseMessage?.tool_calls) {
      return [];
    }
    
    return responseMessage.tool_calls.map((toolCall: any) => {
      let args = {};
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch (error) {
        console.warn(`Failed to parse tool call arguments for ${toolCall.function.name}:`, error);
      }
      
      return {
        id: toolCall.id,
        name: toolCall.function.name,
        arguments: args
      };
    });
  }
  
  private formatMessages(messages: Message[]): any[] {
    return messages.map(msg => {
      if (msg.role === 'tool') {
        return {
          role: 'tool',
          tool_call_id: msg.toolCallId,
          content: msg.content
        };
      }
      
      return {
        role: msg.role,
        content: msg.content,
        ...(msg.name ? { name: msg.name } : {})
      };
    });
  }
  
  private mapFinishReason(reason?: string): CompletionResponse['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'tool_calls':
        return 'tool_calls';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'stop';
    }
  }
  
  // Simple token estimator (very rough)
  private estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  }
}