/**
 * Initialize Models Config
 * Utility to initialize the LLM model configuration files
 */

import fs from 'fs';
import path from 'path';
import { rootPath } from '../paths';
import { logger } from './logger';
import { initiateWithTemplate } from './config-manager-v2';

export function initializeModelsConfig(): void {
  logger.info('Initializing LLM models configuration files...');
  
  // Define paths
  const templatesDir = path.join(rootPath(), 'src/templates/llm');
  const configDir = path.join(rootPath(), 'conf/llm');
  
  // Ensure config directory exists
  if (!fs.existsSync(configDir)) {
    logger.info(`Creating config directory: ${configDir}`);
    fs.mkdirSync(configDir, { recursive: true });
  }
  
  // List of model config files to initialize
  const modelConfigFiles = [
    'claude.yml',
    'openai.yml',
    'deepseek.yml'
  ];
  
  // Initialize each model config file if it doesn't exist
  for (const configFile of modelConfigFiles) {
    const templatePath = path.join(templatesDir, configFile);
    const configPath = path.join(configDir, configFile);
    
    if (!fs.existsSync(configPath)) {
      try {
        logger.info(`Initializing ${configFile} from template`);
        initiateWithTemplate(templatePath, configPath);
      } catch (error) {
        logger.error(`Error initializing ${configFile}:`, error);
      }
    } else {
      logger.debug(`${configFile} already exists, skipping initialization`);
    }
  }
  
  logger.info('LLM models configuration files initialized');
}