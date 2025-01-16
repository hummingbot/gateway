import { FastifyPluginAsync } from 'fastify';
import { ConfigManagerV2 } from '../services/config-manager-v2';
import { logger } from '../services/logger';
import {
  validateConfigUpdateRequest,
  updateAllowedSlippageToFraction,
} from './config.validators';
import { Type, Static } from '@sinclair/typebox';

// Define schemas inline
export const ConfigUpdateRequestSchema = Type.Object({
  configPath: Type.String({ description: 'Configuration path' }),
  configValue: Type.Union([
    Type.String(),
    Type.Number(),
    Type.Boolean(),
    Type.Object({}),
    Type.Array(Type.Any())
  ], { description: 'Configuration value' })
});

const ConfigUpdateResponseSchema = Type.Object({
  message: Type.String({ description: 'Status message' })
});

// TypeScript types
type ConfigUpdateRequest = Static<typeof ConfigUpdateRequestSchema>;
type ConfigUpdateResponse = Static<typeof ConfigUpdateResponseSchema>;

export const configRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /config
  fastify.get('/', {
    schema: {
      description: 'Get configuration settings. Returns all configurations if no chain/connector is specified.',
      tags: ['config'],
      querystring: Type.Object({
        chainOrConnector: Type.Optional(Type.String({
          description: 'Optional chain or connector name (e.g., "solana", "ethereum", "uniswap")',
          examples: ['solana']
        })),
      }),
      response: {
        200: {
          description: 'Configuration object containing settings',
          type: 'object',
          additionalProperties: true
        }
      }
    },
  }, async (request) => {
    const { chainOrConnector } = request.query as { chainOrConnector?: string };
    
    if (chainOrConnector) {
      logger.info(`Getting configuration for chain/connector: ${chainOrConnector}`);
      const namespace = ConfigManagerV2.getInstance().getNamespace(chainOrConnector);
      return namespace ? namespace.configuration : {};
    }
    
    logger.info('Getting all configurations');
    return ConfigManagerV2.getInstance().allConfigurations;
  });

  // POST /config/update
  fastify.post<{ Body: ConfigUpdateRequest; Reply: ConfigUpdateResponse }>(
    '/update',
    {
      schema: {
        description: 'Update a specific configuration value by its path',
        tags: ['config'],
        body: {
          ...ConfigUpdateRequestSchema,
          examples: [{
            configPath: 'solana.priorityFeeMultiplier',
            configValue: 3
          }]
        },
        response: {
          200: {
            description: 'Success response when config is updated',
            ...ConfigUpdateResponseSchema,
            examples: [{
              message: 'The config has been updated'
            }]
          }
        }
      }
    },
    async (request) => {
      logger.info(`Updating config path: ${request.body.configPath} with value: ${JSON.stringify(request.body.configValue)}`);
      
      validateConfigUpdateRequest(request.body);
      
      const config = ConfigManagerV2.getInstance().get(request.body.configPath);
      
      if (typeof request.body.configValue === 'string') {
        switch (typeof config) {
          case 'number':
            request.body.configValue = Number(request.body.configValue);
            break;
          case 'boolean':
            request.body.configValue =
              request.body.configValue.toLowerCase() === 'true';
            break;
        }
      }

      if (request.body.configPath.endsWith('allowedSlippage')) {
        updateAllowedSlippageToFraction(request.body);
      }

      ConfigManagerV2.getInstance().set(
        request.body.configPath,
        request.body.configValue
      );

      logger.info(`Successfully updated configuration: ${request.body.configPath}`);
      return { message: 'The config has been updated' };
    }
  );
};

export default configRoutes;
