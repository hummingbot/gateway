/**
 * Model Configuration Manager
 * Handles loading and management of LLM model configurations
 */
export interface ModelConfig {
    name: string;
    description: string;
    contextWindow: number;
    default?: boolean;
}
export interface ProviderConfig {
    apiKey: string;
    baseUrl?: string;
    organizationId?: string;
    models: ModelConfig[];
    parameters?: {
        temperature?: number;
        topP?: number;
        maxTokens?: number;
        presencePenalty?: number;
        frequencyPenalty?: number;
    };
}
export interface ModelConfigurations {
    claude?: ProviderConfig;
    openai?: ProviderConfig;
    deepseek?: ProviderConfig;
    [key: string]: ProviderConfig | undefined;
}
export declare class ModelsConfigManager {
    private static instance;
    private configurations;
    private configDir;
    private constructor();
    /**
     * Get singleton instance of the config manager
     */
    static getInstance(gatewayDir?: string): ModelsConfigManager;
    /**
     * Load configurations from YAML files
     */
    private loadConfigurations;
    /**
     * Load a specific provider's configuration
     */
    private loadProviderConfig;
    /**
     * Get a provider's configuration
     */
    getProviderConfig(provider: string): ProviderConfig | undefined;
    /**
     * Get API key for a provider
     */
    getApiKey(provider: string): string | undefined;
    /**
     * Get available models for a provider
     */
    getModels(provider: string): ModelConfig[];
    /**
     * Get default model for a provider
     */
    getDefaultModel(provider: string): string | undefined;
    /**
     * Save updated provider configuration
     */
    saveProviderConfig(provider: string, config: ProviderConfig): void;
    /**
     * Update API key for a provider
     */
    setApiKey(provider: string, apiKey: string): void;
}
export default ModelsConfigManager;
