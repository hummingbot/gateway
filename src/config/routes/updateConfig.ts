import { FastifyPluginAsync } from 'fastify';

import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { logger } from '../../services/logger';
import {
  ConfigUpdateRequest,
  ConfigUpdateResponse,
  ConfigUpdateRequestSchema,
  ConfigUpdateResponseSchema,
} from '../schemas';
import { updateConfig, updateAllowedSlippageToFraction } from '../utils';

export const updateConfigRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: ConfigUpdateRequest; Reply: ConfigUpdateResponse }>(
    '/update',
    {
      schema: {
        description: 'Update a specific configuration value',
        tags: ['system'],
        body: {
          ...ConfigUpdateRequestSchema,
          examples: [
            {
              namespace: 'solana',
              path: 'priorityFeeMultiplier',
              value: 3,
            },
            {
              namespace: 'ethereum',
              network: 'mainnet',
              path: 'nodeURL',
              value: 'https://eth-mainnet.g.alchemy.com/v2/your-api-key',
            },
          ],
        },
        response: {
          200: ConfigUpdateResponseSchema,
        },
      },
    },
    async (request) => {
      const { namespace, network, path, value } = request.body;

      try {
        // Validate namespace exists
        const namespaceConfig = ConfigManagerV2.getInstance().getNamespace(namespace);
        if (!namespaceConfig) {
          throw fastify.httpErrors.notFound(`Namespace '${namespace}' not found`);
        }

        // Build the full config path
        let fullPath: string;
        if (network) {
          // Check if this namespace has networks property
          if (!namespaceConfig.configuration.networks) {
            throw fastify.httpErrors.badRequest(
              `Network parameter '${network}' is not valid for '${namespace}'. The '${namespace}' namespace does not support network configurations.`
            );
          }

          // Check if the network exists
          if (!namespaceConfig.configuration.networks[network]) {
            const availableNetworks = Object.keys(namespaceConfig.configuration.networks);
            throw fastify.httpErrors.notFound(
              `Network '${network}' not found for '${namespace}'. Available networks: ${availableNetworks.join(', ')}`
            );
          }

          fullPath = `${namespace}.networks.${network}.${path}`;
        } else {
          fullPath = `${namespace}.${path}`;
        }

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

        // Special handling for allowedSlippage
        if (path === 'allowedSlippage' || fullPath.endsWith('allowedSlippage')) {
          const body = { configPath: fullPath, configValue: processedValue };
          updateAllowedSlippageToFraction(body);
          processedValue = body.configValue;
        }

        updateConfig(fastify, fullPath, processedValue);

        // Build descriptive message
        let description = `'${namespace}`;
        if (network) {
          description += `.${network}`;
        }
        description += `.${path}'`;

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
