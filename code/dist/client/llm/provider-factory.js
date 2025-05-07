"use strict";
/**
 * LLM Provider Factory
 * Creates and manages instances of different LLM providers.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LlmProviderFactory = void 0;
const claude_provider_1 = require("./claude-provider");
const openai_provider_1 = require("./openai-provider");
const deepseek_provider_1 = require("./deepseek-provider");
class LlmProviderFactory {
    /**
     * Create or retrieve a provider instance
     * @param type Provider type ('claude', 'openai', 'deepseek')
     * @param config Provider configuration
     * @returns LLM provider instance
     */
    static getProvider(type, config) {
        const key = `${type}-${config.apiKey}`;
        if (!this.providers.has(key)) {
            let provider;
            switch (type) {
                case 'claude':
                    provider = new claude_provider_1.ClaudeProvider(config);
                    break;
                case 'openai':
                    provider = new openai_provider_1.OpenAIProvider(config);
                    break;
                case 'deepseek':
                    provider = new deepseek_provider_1.DeepSeekProvider(config);
                    break;
                default:
                    throw new Error(`Unsupported provider type: ${type}`);
            }
            this.providers.set(key, provider);
        }
        return this.providers.get(key);
    }
    /**
     * Get all supported provider types
     * @returns Array of supported provider types
     */
    static getSupportedProviders() {
        return ['claude', 'openai', 'deepseek'];
    }
    /**
     * Clear all provider instances
     */
    static clearProviders() {
        this.providers.clear();
    }
}
exports.LlmProviderFactory = LlmProviderFactory;
LlmProviderFactory.providers = new Map();
//# sourceMappingURL=provider-factory.js.map