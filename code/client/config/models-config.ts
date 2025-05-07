/**
 * Model Configuration Manager
 * Handles loading and management of LLM model configurations
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { logger } from '../../common/utils/logger';

// Define types for model configuration
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

export class ModelsConfigManager {
  private static instance: ModelsConfigManager;
  private configurations: ModelConfigurations = {};
  private configDir: string;

  private constructor(gatewayDir: string) {
    this.configDir = path.join(gatewayDir, 'conf/llm');
    this.loadConfigurations();
  }

  /**
   * Get singleton instance of the config manager
   */
  public static getInstance(gatewayDir?: string): ModelsConfigManager {
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
  private loadConfigurations(): void {
    try {
      // Check if the conf directory exists
      if (!fs.existsSync(this.configDir)) {
        logger.warn(`Config directory not found: ${this.configDir}`);
        return;
      }

      // Try to load each provider's configuration
      this.loadProviderConfig('claude');
      this.loadProviderConfig('openai');
      this.loadProviderConfig('deepseek');

      logger.debug('Loaded model configurations', Object.keys(this.configurations));
    } catch (error) {
      logger.error('Error loading model configurations:', error);
    }
  }

  /**
   * Load a specific provider's configuration
   */
  private loadProviderConfig(provider: string): void {
    try {
      const configPath = path.join(this.configDir, `${provider}.yml`);
      
      // Skip if file doesn't exist
      if (!fs.existsSync(configPath)) {
        logger.debug(`Configuration file not found for ${provider}: ${configPath}`);
        return;
      }

      // Load and parse YAML
      const fileContent = fs.readFileSync(configPath, 'utf8');
      const config = yaml.load(fileContent) as ProviderConfig;

      // Store in configurations
      this.configurations[provider] = config;
      logger.debug(`Loaded configuration for ${provider}`);
    } catch (error) {
      logger.error(`Error loading ${provider} configuration:`, error);
    }
  }

  /**
   * Get a provider's configuration
   */
  public getProviderConfig(provider: string): ProviderConfig | undefined {
    return this.configurations[provider];
  }

  /**
   * Get API key for a provider
   */
  public getApiKey(provider: string): string | undefined {
    return this.configurations[provider]?.apiKey;
  }

  /**
   * Get available models for a provider
   */
  public getModels(provider: string): ModelConfig[] {
    return this.configurations[provider]?.models || [];
  }

  /**
   * Get default model for a provider
   */
  public getDefaultModel(provider: string): string | undefined {
    const models = this.getModels(provider);
    const defaultModel = models.find(model => model.default);
    return defaultModel?.name || models[0]?.name;
  }

  /**
   * Save updated provider configuration
   */
  public saveProviderConfig(provider: string, config: ProviderConfig): void {
    try {
      const configPath = path.join(this.configDir, `${provider}.yml`);
      
      // Convert to YAML and save
      const yamlContent = yaml.dump(config, { indent: 2 });
      fs.writeFileSync(configPath, yamlContent, 'utf8');
      
      // Update in-memory configuration
      this.configurations[provider] = config;
      
      logger.debug(`Saved configuration for ${provider}`);
    } catch (error) {
      logger.error(`Error saving ${provider} configuration:`, error);
      throw new Error(`Failed to save configuration for ${provider}: ${error.message}`);
    }
  }

  /**
   * Update API key for a provider
   */
  public setApiKey(provider: string, apiKey: string): void {
    let config = this.getProviderConfig(provider);
    
    if (!config) {
      // If no configuration exists, create a minimal one
      config = {
        apiKey,
        models: []
      };
    } else {
      config.apiKey = apiKey;
    }
    
    this.saveProviderConfig(provider, config);
  }
}

export default ModelsConfigManager;