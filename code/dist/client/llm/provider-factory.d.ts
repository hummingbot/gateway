/**
 * LLM Provider Factory
 * Creates and manages instances of different LLM providers.
 */
import { LlmProvider, LlmProviderConfig } from './provider-interface';
export type ProviderType = 'claude' | 'openai' | 'deepseek';
export declare class LlmProviderFactory {
    private static providers;
    /**
     * Create or retrieve a provider instance
     * @param type Provider type ('claude', 'openai', 'deepseek')
     * @param config Provider configuration
     * @returns LLM provider instance
     */
    static getProvider(type: ProviderType, config: LlmProviderConfig): LlmProvider;
    /**
     * Get all supported provider types
     * @returns Array of supported provider types
     */
    static getSupportedProviders(): ProviderType[];
    /**
     * Clear all provider instances
     */
    static clearProviders(): void;
}
