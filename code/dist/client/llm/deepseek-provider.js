"use strict";
/**
 * DeepSeek LLM Provider Implementation
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeepSeekProvider = void 0;
const axios_1 = __importDefault(require("axios"));
const DEFAULT_MODEL = 'deepseek-chat';
const DEFAULT_API_URL = 'https://api.deepseek.com/v1';
class DeepSeekProvider {
    constructor(config) {
        this.apiKey = config.apiKey;
        this.model = config.model || DEFAULT_MODEL;
        this.baseUrl = config.baseUrl || DEFAULT_API_URL;
    }
    getName() {
        return 'deepseek';
    }
    async getAvailableModels() {
        try {
            const response = await axios_1.default.get(`${this.baseUrl}/models`, {
                headers: { 'Authorization': `Bearer ${this.apiKey}` }
            });
            return response.data.data.map((model) => model.id);
        }
        catch (error) {
            console.error('Error fetching DeepSeek models:', error);
            return [
                'deepseek-chat',
                'deepseek-coder',
                'deepseek-lite'
            ];
        }
    }
    async generateCompletion(messages, options = {}) {
        const formattedMessages = this.formatMessages(messages);
        const tools = options.tools ? this.formatTools(options.tools) : undefined;
        try {
            const response = await axios_1.default.post(`${this.baseUrl}/chat/completions`, {
                model: options.model || this.model,
                messages: formattedMessages,
                temperature: options.temperature,
                max_tokens: options.maxTokens,
                tools: tools,
                stop: options.stopSequences
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });
            const data = response.data;
            const content = data.choices[0]?.message.content || '';
            const toolCalls = this.extractToolCalls(data.choices[0]?.message);
            return {
                id: data.id,
                text: content,
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                finishReason: this.mapFinishReason(data.choices[0]?.finish_reason),
                usage: {
                    promptTokens: data.usage?.prompt_tokens || 0,
                    completionTokens: data.usage?.completion_tokens || 0,
                    totalTokens: data.usage?.total_tokens || 0
                }
            };
        }
        catch (error) {
            throw new Error(`DeepSeek API error: ${error.response?.data?.error?.message || error.message}`);
        }
    }
    async streamCompletion(messages, options = {}, onChunk) {
        const formattedMessages = this.formatMessages(messages);
        const tools = options.tools ? this.formatTools(options.tools) : undefined;
        try {
            const response = await axios_1.default.post(`${this.baseUrl}/chat/completions`, {
                model: options.model || this.model,
                messages: formattedMessages,
                temperature: options.temperature,
                max_tokens: options.maxTokens,
                tools: tools,
                stop: options.stopSequences,
                stream: true
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                responseType: 'stream'
            });
            let fullText = '';
            let responseId = '';
            let finishReason = '';
            let toolCalls = [];
            let usageStats = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
            // Process the streaming response
            await new Promise((resolve, reject) => {
                response.data.on('data', (chunk) => {
                    // DeepSeek API returns data in the format: "data: {...}\n\n"
                    const lines = chunk.toString().split('\n\n');
                    for (const line of lines) {
                        if (!line.trim() || !line.startsWith('data: '))
                            continue;
                        try {
                            const data = JSON.parse(line.substring(6));
                            if (data.id) {
                                responseId = data.id;
                            }
                            if (data.choices && data.choices.length > 0) {
                                const choice = data.choices[0];
                                if (choice.finish_reason) {
                                    finishReason = choice.finish_reason;
                                }
                                // Handle text content
                                if (choice.delta?.content) {
                                    fullText += choice.delta.content;
                                    if (onChunk) {
                                        onChunk({ text: choice.delta.content });
                                    }
                                }
                                // Handle tool calls (similar to OpenAI format)
                                if (choice.delta?.tool_calls) {
                                    for (const toolCall of choice.delta.tool_calls) {
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
                                                        arguments: {} // We'll parse this at the end
                                                    }]
                                            });
                                        }
                                    }
                                }
                            }
                            // Collect usage statistics if available
                            if (data.usage) {
                                usageStats = data.usage;
                            }
                        }
                        catch (error) {
                            console.warn('Error parsing DeepSeek stream chunk:', error);
                        }
                    }
                });
                response.data.on('end', () => {
                    resolve();
                });
                response.data.on('error', (error) => {
                    reject(error);
                });
            });
            // Parse tool call arguments from strings to objects
            const parsedToolCalls = toolCalls.map(tc => {
                let args = {};
                try {
                    args = tc.arguments ? JSON.parse(tc.arguments) : {};
                }
                catch (error) {
                    console.warn(`Failed to parse tool call arguments for ${tc.name}:`, error);
                }
                return {
                    id: tc.id,
                    name: tc.name,
                    arguments: args
                };
            });
            return {
                id: responseId,
                text: fullText,
                toolCalls: parsedToolCalls.length > 0 ? parsedToolCalls : undefined,
                finishReason: this.mapFinishReason(finishReason),
                usage: {
                    promptTokens: usageStats.prompt_tokens,
                    completionTokens: usageStats.completion_tokens,
                    totalTokens: usageStats.total_tokens
                }
            };
        }
        catch (error) {
            throw new Error(`DeepSeek streaming API error: ${error.response?.data?.error?.message || error.message}`);
        }
    }
    formatTools(tools) {
        // DeepSeek follows OpenAI's tool format
        return tools.map(tool => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: {
                    type: 'object',
                    properties: tool.parameters,
                    required: Object.keys(tool.parameters).filter(key => !tool.parameters[key].optional)
                }
            }
        }));
    }
    extractToolCalls(responseMessage) {
        if (!responseMessage?.tool_calls) {
            return [];
        }
        return responseMessage.tool_calls.map((toolCall) => {
            let args = {};
            try {
                args = JSON.parse(toolCall.function.arguments);
            }
            catch (error) {
                console.warn(`Failed to parse tool call arguments for ${toolCall.function.name}:`, error);
            }
            return {
                id: toolCall.id,
                name: toolCall.function.name,
                arguments: args
            };
        });
    }
    formatMessages(messages) {
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
    mapFinishReason(reason) {
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
}
exports.DeepSeekProvider = DeepSeekProvider;
//# sourceMappingURL=deepseek-provider.js.map