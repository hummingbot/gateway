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

// New schemas for default pools
const DefaultPoolRequestSchema = Type.Object({
  connector: Type.String({
    description: 'Connector name (e.g., raydium/amm, raydium/clmm)',
    examples: ['raydium/amm', 'raydium/clmm']
  }),
  baseToken: Type.String({
    description: 'Base token symbol',
    examples: ['SOL', 'USDC']
  }),
  quoteToken: Type.String({
    description: 'Quote token symbol',
    examples: ['USDC', 'USDT']
  }),
  poolAddress: Type.Optional(Type.String({
    description: 'Pool address (required for adding, optional for removal)',
    examples: ['3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv']
  }))
});

const DefaultPoolResponseSchema = Type.Object({
  message: Type.String({ description: 'Status message' })
});

type DefaultPoolRequest = Static<typeof DefaultPoolRequestSchema>;
type DefaultPoolResponse = Static<typeof DefaultPoolResponseSchema>;

// Add new schema for the GET response
const DefaultPoolListSchema = Type.Object({
  defaultPools: Type.Record(
    Type.String(),  // pair key (e.g., "SOL-USDC")
    Type.String()   // pool address
  )
});

type DefaultPoolListResponse = Static<typeof DefaultPoolListSchema>;

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
          200: ConfigUpdateResponseSchema
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

  // GET /config/pools
  fastify.get<{
    Querystring: { connector: string };
  }>(
    '/pools',
    {
      schema: {
        description: 'Get default pools for a specific connector',
        tags: ['config'],
        querystring: Type.Object({
          connector: Type.String({
            description: 'Connector name (e.g., raydium/amm, raydium/clmm)',
            examples: ['raydium/amm', 'raydium/clmm']
          })
        }),
        response: {
          200: Type.Record(
            Type.String({
              pattern: '^[A-Z]+-[A-Z]+$'
            }),
            Type.String()
          )
        }
      }
    },
    async (request) => {
      const { connector } = request.query;

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
    }
  );

  // POST /config/pools/add
  fastify.post<{ Body: DefaultPoolRequest; Reply: DefaultPoolResponse }>(
    '/pools/add',
    {
      schema: {
        description: 'Add a default pool for a specific connector',
        tags: ['config'],
        body: DefaultPoolRequestSchema,
        response: {
          200: DefaultPoolResponseSchema
        }
      }
    },
    async (request) => {
      const { connector, baseToken, quoteToken, poolAddress } = request.body;
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
        return { message: `Default pool added for ${pairKey}` };
      } catch (error) {
        logger.error(`Failed to add default pool: ${error}`);
        throw fastify.httpErrors.internalServerError('Failed to add default pool');
      }
    }
  );

  // POST /config/pools/remove
  fastify.post<{ Body: Omit<DefaultPoolRequest, 'poolAddress'>; Reply: DefaultPoolResponse }>(
    '/pools/remove',
    {
      schema: {
        description: 'Remove a default pool for a specific connector',
        tags: ['config'],
        body: Type.Object({
          connector: Type.String({
            description: 'Connector name (e.g., raydium/amm, raydium/clmm)',
            examples: ['raydium/amm', 'raydium/clmm']
          }),
          baseToken: Type.String({
            description: 'Base token symbol',
            examples: ['SOL', 'USDC']
          }),
          quoteToken: Type.String({
            description: 'Quote token symbol',
            examples: ['USDC', 'USDT']
          })
        }),
        response: {
          200: DefaultPoolResponseSchema
        }
      }
    },
    async (request, _reply) => {
      const { connector, baseToken, quoteToken } = request.body;
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
        return { message: `Default pool removed for ${pairKey}` };
      } catch (error) {
        logger.error(`Failed to remove default pool: ${error}`);
        throw new Error('Failed to remove default pool');
      }
    }
  );

};

export default configRoutes;
