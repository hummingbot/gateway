import { FastifyInstance } from 'fastify';

import { fromFractionString, toFractionString } from '../services/base';
import { ConfigManagerV2 } from '../services/config-manager-v2';
import { logger } from '../services/logger';
import { isFloatString, isFractionString } from '../services/string-utils';

export const invalidAllowedSlippage: string =
  'allowedSlippage should be a number between 0.0 and 1.0 or a string of a fraction.';

// Only permit percentages 0.0 (inclusive) to less than 1.0
export const isAllowedPercentage = (val: string | number): boolean => {
  if (typeof val === 'string') {
    if (isFloatString(val)) {
      const num: number = parseFloat(val);
      return num >= 0.0 && num < 1.0;
    } else {
      const num: number | null = fromFractionString(val);
      return num !== null && num >= 0.0 && num < 1.0;
    }
  }
  return val >= 0.0 && val < 1.0;
};

export const validateAllowedSlippage = (
  fastify: FastifyInstance,
  configPath: string,
  configValue: any,
): void => {
  if (configPath.endsWith('allowedSlippage')) {
    if (
      !(
        (typeof configValue === 'number' ||
          (typeof configValue === 'string' &&
            (isFractionString(configValue) || isFloatString(configValue)))) &&
        isAllowedPercentage(configValue)
      )
    ) {
      throw fastify.httpErrors.badRequest(invalidAllowedSlippage);
    }
  }
};

// Mutates the input value in place to convert to fraction string format
export const updateAllowedSlippageToFraction = (
  body: { configPath: string; configValue: any },
): void => {
  if (body.configPath.endsWith('allowedSlippage')) {
    if (
      typeof body.configValue === 'number' ||
      (typeof body.configValue === 'string' &&
        !isFractionString(body.configValue))
    ) {
      body.configValue = toFractionString(body.configValue);
    }
  }
};

export const getConfig = (
  fastify: FastifyInstance,
  namespace?: string,
  network?: string,
): object => {
  if (namespace) {
    logger.info(
      `Getting configuration for namespace: ${namespace}${network ? `, network: ${network}` : ''}`,
    );
    const namespaceConfig =
      ConfigManagerV2.getInstance().getNamespace(namespace);
    
    if (!namespaceConfig) {
      throw fastify.httpErrors.notFound(
        `Namespace '${namespace}' not found`,
      );
    }

    // If network is specified, return only that network's config
    if (network) {
      // Check if this namespace has networks property
      if (!namespaceConfig.configuration.networks) {
        throw fastify.httpErrors.badRequest(
          `Network parameter '${network}' is not valid for '${namespace}'. The '${namespace}' namespace does not support network configurations.`,
        );
      }

      // Check if the network exists
      if (!namespaceConfig.configuration.networks[network]) {
        const availableNetworks = Object.keys(namespaceConfig.configuration.networks);
        throw fastify.httpErrors.notFound(
          `Network '${network}' not found for '${namespace}'. Available networks: ${availableNetworks.join(', ')}`,
        );
      }

      // Return only the network configuration
      return namespaceConfig.configuration.networks[network];
    }

    return namespaceConfig.configuration;
  }

  logger.info('Getting all configurations');
  return ConfigManagerV2.getInstance().allConfigurations;
};

export const updateConfig = (
  fastify: FastifyInstance,
  configPath: string,
  configValue: any,
): void => {
  logger.info(
    `Updating config path: ${configPath} with value: ${JSON.stringify(configValue)}`,
  );

  validateAllowedSlippage(fastify, configPath, configValue);

  try {
    ConfigManagerV2.getInstance().set(configPath, configValue);
    logger.info(`Successfully updated configuration: ${configPath}`);
  } catch (error) {
    logger.error(`Failed to update configuration: ${error.message}`);
    throw fastify.httpErrors.internalServerError(
      `Failed to update configuration: ${error.message}`,
    );
  }
};

export const getDefaultPools = (
  fastify: FastifyInstance,
  connector: string,
): Record<string, string> => {
  // Parse connector name
  const [baseConnector, connectorType] = connector.split('/');

  if (!baseConnector) {
    throw fastify.httpErrors.badRequest('Connector name is required');
  }

  if (!connectorType) {
    throw fastify.httpErrors.badRequest(
      'Connector type is required (e.g., amm, clmm)',
    );
  }

  try {
    // Get connector config
    const connectorConfig =
      ConfigManagerV2.getInstance().getNamespace(baseConnector)?.configuration;

    if (!connectorConfig || !connectorConfig.networks) {
      logger.error(
        `Connector ${baseConnector} configuration not found or missing networks`,
      );
      return {};
    }

    // Get active network
    const activeNetworks = Object.keys(connectorConfig.networks);
    if (activeNetworks.length === 0) {
      return {};
    }

    // Use mainnet-beta for Solana, mainnet for Ethereum by default, or first available network
    let activeNetwork = 'mainnet-beta';
    if (!connectorConfig.networks[activeNetwork]) {
      activeNetwork = activeNetworks[0];
    }

    // Get pools for the specific connector type
    const pools = connectorConfig.networks[activeNetwork][connectorType] || {};

    logger.info(
      `Retrieved default pools for ${connector} on network ${activeNetwork}`,
    );
    return pools;
  } catch (error) {
    logger.error(`Failed to get default pools for ${connector}: ${error}`);
    throw fastify.httpErrors.internalServerError('Failed to get default pools');
  }
};

export const addDefaultPool = (
  fastify: FastifyInstance,
  connector: string,
  baseToken: string,
  quoteToken: string,
  poolAddress?: string,
): void => {
  const pairKey = `${baseToken}-${quoteToken}`;

  if (!poolAddress) {
    throw fastify.httpErrors.badRequest(
      'Pool address is required for adding a default pool',
    );
  }

  const [baseConnector, connectorType] = connector.split('/');

  if (!baseConnector) {
    throw fastify.httpErrors.badRequest('Connector name is required');
  }

  if (!connectorType) {
    throw fastify.httpErrors.badRequest(
      'Connector type is required (e.g., amm, clmm)',
    );
  }

  try {
    // Get connector config
    const connectorConfig =
      ConfigManagerV2.getInstance().getNamespace(baseConnector)?.configuration;

    if (!connectorConfig || !connectorConfig.networks) {
      throw new Error(
        `Connector ${baseConnector} configuration not found or missing networks`,
      );
    }

    // Get active network
    const activeNetworks = Object.keys(connectorConfig.networks);
    if (activeNetworks.length === 0) {
      throw new Error(`No networks configured for ${baseConnector}`);
    }

    // Use mainnet-beta for Solana, mainnet for Ethereum by default, or first available network
    let activeNetwork = 'mainnet-beta';
    if (!connectorConfig.networks[activeNetwork]) {
      activeNetwork = activeNetworks[0];
    }

    // Set the pool in the active network and connector type
    const configPath = `${baseConnector}.networks.${activeNetwork}.${connectorType}.${pairKey}`;
    ConfigManagerV2.getInstance().set(configPath, poolAddress);

    logger.info(
      `Added default pool for ${connector}: ${pairKey} (address: ${poolAddress}) on network ${activeNetwork}`,
    );
  } catch (error) {
    logger.error(`Failed to add default pool: ${error}`);
    throw fastify.httpErrors.internalServerError(
      `Failed to add default pool: ${error.message}`,
    );
  }
};

export const removeDefaultPool = (
  fastify: FastifyInstance,
  connector: string,
  baseToken: string,
  quoteToken: string,
): void => {
  const pairKey = `${baseToken}-${quoteToken}`;

  const [baseConnector, connectorType] = connector.split('/');

  if (!baseConnector) {
    throw fastify.httpErrors.badRequest('Connector name is required');
  }

  if (!connectorType) {
    throw fastify.httpErrors.badRequest(
      'Connector type is required (e.g., amm, clmm)',
    );
  }

  try {
    // Get connector config
    const connectorConfig =
      ConfigManagerV2.getInstance().getNamespace(baseConnector)?.configuration;

    if (!connectorConfig || !connectorConfig.networks) {
      throw new Error(
        `Connector ${baseConnector} configuration not found or missing networks`,
      );
    }

    // Get active network
    const activeNetworks = Object.keys(connectorConfig.networks);
    if (activeNetworks.length === 0) {
      throw new Error(`No networks configured for ${baseConnector}`);
    }

    // Use mainnet-beta for Solana, mainnet for Ethereum by default, or first available network
    let activeNetwork = 'mainnet-beta';
    if (!connectorConfig.networks[activeNetwork]) {
      activeNetwork = activeNetworks[0];
    }

    // Delete the pool from the active network and connector type
    const configPath = `${baseConnector}.networks.${activeNetwork}.${connectorType}.${pairKey}`;
    ConfigManagerV2.getInstance().delete(configPath);

    logger.info(
      `Removed default pool for ${connector}: ${pairKey} on network ${activeNetwork}`,
    );
  } catch (error) {
    logger.error(`Failed to remove default pool: ${error}`);
    throw fastify.httpErrors.internalServerError(
      `Failed to remove default pool: ${error.message}`,
    );
  }
};
