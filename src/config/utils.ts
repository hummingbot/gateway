import * as fs from 'fs';
import * as path from 'path';

import { FastifyInstance } from 'fastify';
import * as yaml from 'js-yaml';

import { ConfigManagerV2 } from '../services/config-manager-v2';
import { logger } from '../services/logger';

export const getConfig = (fastify: FastifyInstance, namespace?: string): object => {
  if (namespace) {
    logger.info(`Getting configuration for namespace: ${namespace}`);
    const namespaceConfig = ConfigManagerV2.getInstance().getNamespace(namespace);

    if (!namespaceConfig) {
      throw fastify.httpErrors.notFound(`Namespace '${namespace}' not found`);
    }

    return namespaceConfig.configuration;
  }

  logger.info('Getting all configurations');
  return ConfigManagerV2.getInstance().allConfigurations;
};

export const updateConfig = (fastify: FastifyInstance, configPath: string, configValue: any): void => {
  logger.info(`Updating config path: ${configPath} with value: ${JSON.stringify(configValue)}`);

  try {
    // Update the configuration using ConfigManagerV2
    ConfigManagerV2.getInstance().set(configPath, configValue);
    logger.info(`Successfully updated configuration: ${configPath}`);
  } catch (error) {
    logger.error(`Failed to update configuration: ${error.message}`);
    // Re-throw if it already has a statusCode (HttpError from ConfigManagerV2)
    if (error.statusCode) {
      throw error;
    }
    throw fastify.httpErrors.internalServerError(`Failed to update configuration: ${error.message}`);
  }
};

export const getDefaultPools = async (
  fastify: FastifyInstance,
  connector: string,
  network: string,
): Promise<Record<string, string>> => {
  // Import PoolService here to avoid circular dependency
  const { PoolService } = await import('../services/pool-service');

  // Parse connector name to extract base connector and type
  const [baseConnector, poolType] = connector.split('/');

  if (!baseConnector) {
    throw fastify.httpErrors.badRequest('Connector name is required');
  }

  // Determine the pool type (amm or clmm)
  const type = poolType as 'amm' | 'clmm' | undefined;
  if (!type || !['amm', 'clmm'].includes(type)) {
    // If no type specified or invalid type, return empty
    return {};
  }

  try {
    // Get pools from PoolService
    const poolService = PoolService.getInstance();
    const pools = await poolService.getDefaultPools(baseConnector, network, type);

    logger.info(`Retrieved default pools for ${connector} on ${network}`);
    return pools;
  } catch (error) {
    logger.error(`Failed to get default pools for ${connector}: ${error}`);
    return {};
  }
};

// Note: Pool management functions have been moved to PoolService
// Use the /pools endpoints for pool management

export const updateDefaultWallet = (fastify: FastifyInstance, chain: string, walletAddress: string): void => {
  logger.info(`Updating default wallet for ${chain} to: ${walletAddress}`);

  try {
    // Update the default wallet configuration
    const configPath = `${chain}.defaultWallet`;
    ConfigManagerV2.getInstance().set(configPath, walletAddress);
    logger.info(`Successfully updated default wallet for ${chain}`);
  } catch (error) {
    logger.error(`Failed to update default wallet: ${error.message}`);
    // Re-throw if it already has a statusCode (HttpError from ConfigManagerV2)
    if (error.statusCode) {
      throw error;
    }
    throw fastify.httpErrors.internalServerError(`Failed to update default wallet: ${error.message}`);
  }
};
