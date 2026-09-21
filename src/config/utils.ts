import { FastifyInstance } from 'fastify';

import { ConfigManagerV2 } from '../services/config-manager-v2';
import { logger } from '../services/logger';

// Known blockchain chains for chain-network parsing
const KNOWN_CHAINS = ['solana', 'ethereum'];

/**
 * Is this config namespace a chain-network one, and if so which?
 *
 * Distinct from services/chain-network's parser, which reads a caller's selector and
 * rejects a malformed one. This classifies a namespace against the known chains and
 * answers null for anything else — `server`, `uniswap` — which is not an error here.
 */
function parseChainNetworkNamespace(namespace: string): { chain: string; network: string } | null {
  for (const chain of KNOWN_CHAINS) {
    if (namespace.startsWith(`${chain}-`)) {
      const network = namespace.slice(chain.length + 1);
      if (network) {
        return { chain, network };
      }
    }
  }
  return null;
}

export const getConfig = (fastify: FastifyInstance, namespace?: string): object => {
  if (namespace) {
    logger.info(`Getting configuration for namespace: ${namespace}`);
    const namespaceConfig = ConfigManagerV2.getInstance().getNamespace(namespace);

    if (!namespaceConfig) {
      throw fastify.httpErrors.notFound(`Namespace '${namespace}' not found`);
    }

    // Check if this is a chain-network format (e.g., solana-mainnet-beta)
    const parsed = parseChainNetworkNamespace(namespace);
    if (parsed) {
      // Get the parent chain config and merge it
      const chainConfig = ConfigManagerV2.getInstance().getNamespace(parsed.chain);
      if (chainConfig) {
        // Merge chain config into network config (network config takes precedence for conflicts)
        return {
          ...chainConfig.configuration,
          ...namespaceConfig.configuration,
        };
      }
    }

    return namespaceConfig.configuration;
  }

  logger.info('Getting all configurations');
  return ConfigManagerV2.getInstance().allConfigurations;
};

/**
 * A network named in `defaultNetwork` or `defaultNetworks` has to be one this Gateway has
 * a config for. The JSON schema only says "string" and "array of strings", so a typo was
 * saved and surfaced later, as a missing namespace on the first balance call that used
 * it. The Hummingbot client checks the single field before sending; the list, and any
 * caller that is not the client, reached the file unchecked.
 */
function assertKnownNetworks(fastify: FastifyInstance, chain: string, field: string, value: unknown): void {
  if (field !== 'defaultNetwork' && field !== 'defaultNetworks') {
    return;
  }
  // a value of the wrong shape is left to the JSON schema, which names the type
  if (field === 'defaultNetwork' && typeof value !== 'string') {
    return;
  }
  if (field === 'defaultNetworks' && !(Array.isArray(value) && value.every((v) => typeof v === 'string'))) {
    return;
  }
  const named: string[] = Array.isArray(value) ? value : [value];
  const known = ConfigManagerV2.getInstance()
    .getSupportedChainNetworks()
    .filter((chainNetwork) => chainNetwork.startsWith(`${chain}-`))
    .map((chainNetwork) => chainNetwork.slice(chain.length + 1));
  const unknown = named.filter((network) => !known.includes(network));
  if (unknown.length > 0) {
    throw fastify.httpErrors.badRequest(
      `Unknown ${chain} network${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. ` +
        `Configured networks: ${known.join(', ')}`,
    );
  }
}

export const updateConfig = (fastify: FastifyInstance, configPath: string, configValue: any): void => {
  logger.info(`Updating config path: ${configPath} with value: ${JSON.stringify(configValue)}`);

  try {
    // Check if the configPath uses a chain-network namespace with a chain-level field
    // e.g., "solana-mainnet-beta.defaultWallet" should route to "solana.defaultWallet"
    const [namespace, ...pathParts] = configPath.split('.');
    const field = pathParts[0];

    const parsed = parseChainNetworkNamespace(namespace);
    if (parsed && field) {
      // Check if this field exists in the chain config (not network config)
      const chainConfig = ConfigManagerV2.getInstance().getNamespace(parsed.chain);
      if (chainConfig && field in chainConfig.configuration) {
        // Route to the chain namespace instead
        const chainConfigPath = `${parsed.chain}.${pathParts.join('.')}`;
        logger.info(`Routing chain-level field to: ${chainConfigPath}`);
        assertKnownNetworks(fastify, parsed.chain, field, configValue);
        ConfigManagerV2.getInstance().set(chainConfigPath, configValue);
        logger.info(`Successfully updated configuration: ${chainConfigPath}`);
        return;
      }
    }

    if (KNOWN_CHAINS.includes(namespace) && field) {
      assertKnownNetworks(fastify, namespace, field, configValue);
    }

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
