import { FastifyPluginAsync } from 'fastify';
import { logger } from '../../../services/logger';
import { updateConfig, updateAllowedSlippageToFraction } from '../utils';
import { ConfigUpdateRequest, ConfigUpdateResponse, ConfigUpdateRequestSchema, ConfigUpdateResponseSchema } from '../schemas';
import { ConfigManagerV2 } from '../../../services/config-manager-v2';

export const updateConfigRoute: FastifyPluginAsync = async (fastify) => {
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
      const { configPath, configValue } = request.body;
      
      // Type conversion for string inputs
      let processedValue = configValue;
      
      if (typeof processedValue === 'string') {
        const config = ConfigManagerV2.getInstance().get(configPath);
        
        switch (typeof config) {
          case 'number':
            processedValue = Number(processedValue);
            break;
          case 'boolean':
            processedValue = processedValue.toLowerCase() === 'true';
            break;
        }
      }
      
      // Special handling for allowedSlippage
      if (configPath.endsWith('allowedSlippage')) {
        const body = { configPath, configValue: processedValue };
        updateAllowedSlippageToFraction(body);
        processedValue = body.configValue;
      }
      
      updateConfig(fastify, configPath, processedValue);
      
      return { message: 'The config has been updated' };
    }
  );
};

export default updateConfigRoute;