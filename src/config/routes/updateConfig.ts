import { FastifyPluginAsync } from 'fastify';

import { Ethereum } from '../../chains/ethereum/ethereum';
import { Solana } from '../../chains/solana/solana';
import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { logger } from '../../services/logger';
import {
  ConfigUpdateRequest,
  ConfigUpdateResponse,
  ConfigUpdateRequestSchema,
  ConfigUpdateResponseSchema,
} from '../schemas';
import { updateConfig } from '../utils';

export const updateConfigRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: ConfigUpdateRequest; Reply: ConfigUpdateResponse }>(
    '/update',
    {
      schema: {
        description: 'Update a specific configuration value',
        tags: ['/config'],
        body: {
          ...ConfigUpdateRequestSchema,
          examples: [
            {
              namespace: 'solana-mainnet-beta',
              path: 'maxFee',
              value: 0.01,
            },
            {
              namespace: 'ethereum-mainnet',
              path: 'nodeURL',
              value: 'https://eth-mainnet.g.alchemy.com/v2/your-api-key',
            },
            {
              namespace: 'ethereum-mainnet',
              path: 'gasLimitTransaction',
              value: 3000000,
            },
            {
              namespace: 'solana-devnet',
              path: 'retryCount',
              value: 5,
            },
            {
              namespace: 'server',
              path: 'port',
              value: 15888,
            },
          ],
        },
        response: {
          200: ConfigUpdateResponseSchema,
        },
      },
    },
    async (request) => {
      const { namespace, path, value } = request.body;

      try {
        // Validate namespace exists
        const namespaceConfig = ConfigManagerV2.getInstance().getNamespace(namespace);
        if (!namespaceConfig) {
          throw fastify.httpErrors.notFound(`Namespace '${namespace}' not found`);
        }

        // Build the full config path
        const fullPath = `${namespace}.${path}`;

        // Type conversion for string inputs
        let processedValue = value;
        if (typeof processedValue === 'string') {
          const currentValue = ConfigManagerV2.getInstance().get(fullPath);

          switch (typeof currentValue) {
            case 'number':
              processedValue = Number(processedValue);
              break;
            case 'boolean':
              processedValue = processedValue.toLowerCase() === 'true';
              break;
          }
        }

        updateConfig(fastify, fullPath, processedValue);

        // If nodeURL changed, evict the cached chain instance so the next request
        // re-creates it with the new provider (Blockchain lens: network RPC is runtime config).
        if (path === 'nodeURL') {
          // namespace is e.g. "ethereum-bsc" or "solana-mainnet-beta"
          const nsParts = namespace.split('-');
          const chain = nsParts[0];
          const network = nsParts.slice(1).join('-');
          if (chain === 'ethereum' && network) {
            Ethereum.resetInstance(network);
          } else if (chain === 'solana' && network) {
            Solana.resetInstance(network);
          }
        }

        // Build descriptive message
        const description = `'${namespace}.${path}'`;

        return {
          message: `Configuration updated successfully: ${description} set to ${JSON.stringify(processedValue)}`,
        };
      } catch (error) {
        logger.error(`Config update failed: ${error.message}`);
        // Re-throw the error if it's already a Fastify HTTP error
        if (error.statusCode) {
          throw error;
        }
        // Otherwise, throw a generic internal server error
        throw fastify.httpErrors.internalServerError('Failed to update configuration');
      }
    },
  );
};

export default updateConfigRoute;
