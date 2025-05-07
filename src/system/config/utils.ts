import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { logger } from '../../services/logger';
import { isFloatString, isFractionString } from '../../services/string-utils';
import { fromFractionString, toFractionString } from '../../services/base';
import { ConfigUpdateRequest } from './schemas';
import { FastifyInstance } from 'fastify';

export const invalidAllowedSlippage: string = 'allowedSlippage should be a number between 0.0 and 1.0 or a string of a fraction.';

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
  configValue: any
): void => {
  if (configPath.endsWith('allowedSlippage')) {
    if (!(
      (typeof configValue === 'number' ||
        (typeof configValue === 'string' &&
          (isFractionString(configValue) || isFloatString(configValue)))) &&
      isAllowedPercentage(configValue)
    )) {
      throw fastify.httpErrors.badRequest(invalidAllowedSlippage);
    }
  }
};

// Mutates the input value in place to convert to fraction string format
export const updateAllowedSlippageToFraction = (
  body: ConfigUpdateRequest
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
  _fastify: FastifyInstance, // Underscore to indicate unused parameter
  chainOrConnector?: string
): object => {
  if (chainOrConnector) {
    logger.info(`Getting configuration for chain/connector: ${chainOrConnector}`);
    const namespace = ConfigManagerV2.getInstance().getNamespace(chainOrConnector);
    return namespace ? namespace.configuration : {};
  }
  
  logger.info('Getting all configurations');
  return ConfigManagerV2.getInstance().allConfigurations;
};

export const updateConfig = (
  fastify: FastifyInstance,
  configPath: string,
  configValue: any
): void => {
  logger.info(`Updating config path: ${configPath} with value: ${JSON.stringify(configValue)}`);
  
  validateAllowedSlippage(fastify, configPath, configValue);
  
  try {
    ConfigManagerV2.getInstance().set(configPath, configValue);
    logger.info(`Successfully updated configuration: ${configPath}`);
  } catch (error) {
    logger.error(`Failed to update configuration: ${error.message}`);
    throw fastify.httpErrors.internalServerError(`Failed to update configuration: ${error.message}`);
  }
};

export const getDefaultPools = (
  fastify: FastifyInstance,
  connector: string
): Record<string, string> => {
  // Parse connector name
  const [baseConnector, connectorType] = connector.split('/');
  let configPath;
  
  if (!baseConnector) {
    throw fastify.httpErrors.badRequest('Connector name is required');
  }

  // Handle both formats: "connector/type" and "connector"
  if (connectorType) {
    configPath = `${baseConnector}.${connectorType}.pools`;
  } else {
    configPath = `${baseConnector}.pools`;
  }

  try {
    const pools = ConfigManagerV2.getInstance().get(configPath) || {};
    logger.info(`Retrieved default pools for ${connector}`);
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
  poolAddress?: string
): void => {
  const pairKey = `${baseToken}-${quoteToken}`;

  if (!poolAddress) {
    throw fastify.httpErrors.badRequest('Pool address is required for adding a default pool');
  }

  const [baseConnector, connectorType] = connector.split('/');
  let configPath;
  
  if (!baseConnector) {
    throw fastify.httpErrors.badRequest('Connector name is required');
  }

  // Handle both formats: "connector/type" and "connector"
  if (connectorType) {
    configPath = `${baseConnector}.${connectorType}.pools.${pairKey}`;
  } else {
    configPath = `${baseConnector}.pools.${pairKey}`;
  }

  try {
    ConfigManagerV2.getInstance().set(configPath, poolAddress);
    logger.info(`Added default pool for ${connector}: ${pairKey} (address: ${poolAddress})`);
  } catch (error) {
    logger.error(`Failed to add default pool: ${error}`);
    throw fastify.httpErrors.internalServerError('Failed to add default pool');
  }
};

export const removeDefaultPool = (
  fastify: FastifyInstance,
  connector: string,
  baseToken: string,
  quoteToken: string
): void => {
  const pairKey = `${baseToken}-${quoteToken}`;

  const [baseConnector, connectorType] = connector.split('/');
  let configPath;
  
  if (!baseConnector) {
    throw fastify.httpErrors.badRequest('Connector name is required');
  }

  // Handle both formats: "connector/type" and "connector"
  if (connectorType) {
    configPath = `${baseConnector}.${connectorType}.pools.${pairKey}`;
  } else {
    configPath = `${baseConnector}.pools.${pairKey}`;
  }

  try {
    ConfigManagerV2.getInstance().delete(configPath);
    logger.info(`Removed default pool for ${connector}: ${pairKey}`);
  } catch (error) {
    logger.error(`Failed to remove default pool: ${error}`);
    throw fastify.httpErrors.internalServerError('Failed to remove default pool');
  }
};