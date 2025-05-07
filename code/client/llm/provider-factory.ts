/**
 * LLM Provider Factory
 * Creates and manages instances of different LLM providers.
 */

import { LlmProvider, LlmProviderConfig } from './provider-interface';
import { ClaudeProvider } from './claude-provider';
import { OpenAIProvider } from './openai-provider';
import { DeepSeekProvider } from './deepseek-provider';

export type ProviderType = 'claude' | 'openai' | 'deepseek';

export class LlmProviderFactory {
  private static providers: Map<string, LlmProvider> = new Map();
  
  /**
   * Create or retrieve a provider instance
   * @param type Provider type ('claude', 'openai', 'deepseek')
   * @param config Provider configuration
   * @returns LLM provider instance
   */
  static getProvider(type: ProviderType, config: LlmProviderConfig): LlmProvider {
    const key = `${type}-${config.apiKey}`;
    
    if (!this.providers.has(key)) {
      let provider: LlmProvider;
      
      switch (type) {
        case 'claude':
          provider = new ClaudeProvider(config);
          break;
        case 'openai':
          provider = new OpenAIProvider(config);
          break;
        case 'deepseek':
          provider = new DeepSeekProvider(config);
          break;
        default:
          throw new Error(`Unsupported provider type: ${type}`);
      }
      
      this.providers.set(key, provider);
    }
    
    return this.providers.get(key)!;
  }
  
  /**
   * Get all supported provider types
   * @returns Array of supported provider types
   */
  static getSupportedProviders(): ProviderType[] {
    return ['claude', 'openai', 'deepseek'];
  }
  
  /**
   * Clear all provider instances
   */
  static clearProviders(): void {
    this.providers.clear();
  }
}