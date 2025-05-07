"use strict";
/**
 * Model Configuration Manager
 * Handles loading and management of LLM model configurations
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelsConfigManager = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const js_yaml_1 = __importDefault(require("js-yaml"));
const logger_1 = require("../../common/utils/logger");
class ModelsConfigManager {
    constructor(gatewayDir) {
        this.configurations = {};
        this.configDir = path_1.default.join(gatewayDir, 'conf/llm');
        this.loadConfigurations();
    }
    /**
     * Get singleton instance of the config manager
     */
    static getInstance(gatewayDir) {
        if (!ModelsConfigManager.instance) {
            if (!gatewayDir) {
                // Use a reasonable default if not specified
                gatewayDir = process.cwd();
            }
            ModelsConfigManager.instance = new ModelsConfigManager(gatewayDir);
        }
        return ModelsConfigManager.instance;
    }
    /**
     * Load configurations from YAML files
     */
    loadConfigurations() {
        try {
            // Check if the conf directory exists
            if (!fs_1.default.existsSync(this.configDir)) {
                logger_1.logger.warn(`Config directory not found: ${this.configDir}`);
                return;
            }
            // Try to load each provider's configuration
            this.loadProviderConfig('claude');
            this.loadProviderConfig('openai');
            this.loadProviderConfig('deepseek');
            logger_1.logger.debug('Loaded model configurations', Object.keys(this.configurations));
        }
        catch (error) {
            logger_1.logger.error('Error loading model configurations:', error);
        }
    }
    /**
     * Load a specific provider's configuration
     */
    loadProviderConfig(provider) {
        try {
            const configPath = path_1.default.join(this.configDir, `${provider}.yml`);
            // Skip if file doesn't exist
            if (!fs_1.default.existsSync(configPath)) {
                logger_1.logger.debug(`Configuration file not found for ${provider}: ${configPath}`);
                return;
            }
            // Load and parse YAML
            const fileContent = fs_1.default.readFileSync(configPath, 'utf8');
            const config = js_yaml_1.default.load(fileContent);
            // Store in configurations
            this.configurations[provider] = config;
            logger_1.logger.debug(`Loaded configuration for ${provider}`);
        }
        catch (error) {
            logger_1.logger.error(`Error loading ${provider} configuration:`, error);
        }
    }
    /**
     * Get a provider's configuration
     */
    getProviderConfig(provider) {
        return this.configurations[provider];
    }
    /**
     * Get API key for a provider
     */
    getApiKey(provider) {
        return this.configurations[provider]?.apiKey;
    }
    /**
     * Get available models for a provider
     */
    getModels(provider) {
        return this.configurations[provider]?.models || [];
    }
    /**
     * Get default model for a provider
     */
    getDefaultModel(provider) {
        const models = this.getModels(provider);
        const defaultModel = models.find(model => model.default);
        return defaultModel?.name || models[0]?.name;
    }
    /**
     * Save updated provider configuration
     */
    saveProviderConfig(provider, config) {
        try {
            const configPath = path_1.default.join(this.configDir, `${provider}.yml`);
            // Convert to YAML and save
            const yamlContent = js_yaml_1.default.dump(config, { indent: 2 });
            fs_1.default.writeFileSync(configPath, yamlContent, 'utf8');
            // Update in-memory configuration
            this.configurations[provider] = config;
            logger_1.logger.debug(`Saved configuration for ${provider}`);
        }
        catch (error) {
            logger_1.logger.error(`Error saving ${provider} configuration:`, error);
            throw new Error(`Failed to save configuration for ${provider}: ${error.message}`);
        }
    }
    /**
     * Update API key for a provider
     */
    setApiKey(provider, apiKey) {
        let config = this.getProviderConfig(provider);
        if (!config) {
            // If no configuration exists, create a minimal one
            config = {
                apiKey,
                models: []
            };
        }
        else {
            config.apiKey = apiKey;
        }
        this.saveProviderConfig(provider, config);
    }
}
exports.ModelsConfigManager = ModelsConfigManager;
exports.default = ModelsConfigManager;
//# sourceMappingURL=models-config.js.map