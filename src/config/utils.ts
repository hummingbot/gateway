import { FastifyInstance } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

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
export const updateAllowedSlippageToFraction = (body: {
  configPath: string;
  configValue: any;
}): void => {
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
      throw fastify.httpErrors.notFound(`Namespace '${namespace}' not found`);
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
        const availableNetworks = Object.keys(
          namespaceConfig.configuration.networks,
        );
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
    // Check if this is a network-specific configuration for chains
    const pathParts = configPath.split('.');
    const namespace = pathParts[0];
    
    // Check if it's a chain namespace with network configuration
    if (pathParts[1] === 'networks' && pathParts.length >= 4) {
      const network = pathParts[2];
      const networkConfigPath = pathParts.slice(3).join('.');
      
      // Check if we should save to a separate network file
      const chainNamespaces = ['ethereum', 'solana']; // Add other chains as needed
      if (chainNamespaces.includes(namespace)) {
        // For chains, update the network-specific config file
        const networkConfigFile = `conf/networks/${namespace}/${network}.yml`;
        
        try {
          // Read existing network config or create new one
          let networkConfig = {};
          const fullPath = path.join(process.cwd(), networkConfigFile);
          const dirPath = path.dirname(fullPath);
          
          // Ensure directory exists
          if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
          }
          
          if (fs.existsSync(fullPath)) {
            networkConfig = yaml.load(fs.readFileSync(fullPath, 'utf8')) || {};
          }
          
          // Update the specific property in the network config
          const updatePath = (obj: any, path: string[], value: any) => {
            const key = path[0];
            if (path.length === 1) {
              obj[key] = value;
            } else {
              if (!obj[key]) obj[key] = {};
              updatePath(obj[key], path.slice(1), value);
            }
          };
          
          updatePath(networkConfig, networkConfigPath.split('.'), configValue);
          
          // Save the network config file
          fs.writeFileSync(fullPath, yaml.dump(networkConfig));
          logger.info(`Successfully updated network configuration file: ${networkConfigFile}`);
          
          // Also update the runtime configuration
          ConfigManagerV2.getInstance().set(configPath, configValue);
          return;
        } catch (fileError) {
          logger.error(`Failed to update network config file: ${fileError.message}`);
          // Fall back to updating only runtime config
        }
      }
    }
    
    // Default behavior: update the namespace config file
    ConfigManagerV2.getInstance().set(configPath, configValue);
    logger.info(`Successfully updated configuration: ${configPath}`);
  } catch (error) {
    logger.error(`Failed to update configuration: ${error.message}`);
    throw fastify.httpErrors.internalServerError(
      `Failed to update configuration: ${error.message}`,
    );
  }
};

export const getDefaultPools = async (
  fastify: FastifyInstance,
  connector: string,
  network?: string,
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
    // If network not provided, determine default network
    if (!network) {
      // Get connector config to find active network
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

      // Determine chain based on connector
      let defaultNetwork = 'mainnet';
      if (['raydium', 'meteora'].includes(baseConnector)) {
        defaultNetwork = 'mainnet-beta';
      }

      // Use default network or first available
      network = connectorConfig.networks[defaultNetwork] ? defaultNetwork : activeNetworks[0];
    }

    // Get pools from PoolService
    const poolService = PoolService.getInstance();
    const pools = await poolService.getDefaultPools(baseConnector, network, type);

    logger.info(
      `Retrieved default pools for ${connector} on ${network}`,
    );
    return pools;
  } catch (error) {
    logger.error(`Failed to get default pools for ${connector}: ${error}`);
    return {};
  }
};

// Note: Pool management functions have been moved to PoolService
// Use the /pools endpoints for pool management
