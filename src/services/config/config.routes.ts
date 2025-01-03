import { FastifyPluginAsync } from 'fastify';
import { ConfigManagerV2 } from '../config-manager-v2';
import {
  validateConfigUpdateRequest,
  updateAllowedSlippageToFraction,
} from './config.validators';
import { 
  ConfigUpdateRequest, 
  ConfigUpdateResponse,
  ConfigUpdateRequestSchema,
  ConfigUpdateResponseSchema 
} from './config.requests';

export const configRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: ConfigUpdateRequest; Reply: ConfigUpdateResponse }>(
    '/update',
    {
      schema: {
        description: 'Update configuration',
        tags: ['config'],
        body: ConfigUpdateRequestSchema,
        response: {
          200: ConfigUpdateResponseSchema,
        }
      }
    },
    async (request) => {
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

      return { message: 'The config has been updated' };
    }
  );
};

export default configRoutes;
