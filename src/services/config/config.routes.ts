import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { ConfigManagerV2 } from '../config-manager-v2';
import {
  validateConfigUpdateRequest,
  updateAllowedSlippageToFraction,
} from './config.validators';
import { ConfigUpdateRequest } from './config.requests';

// Define request schema using TypeBox
const configUpdateSchema = {
  body: Type.Object({
    configPath: Type.String(),
    configValue: Type.Union([
      Type.String(),
      Type.Number(),
      Type.Boolean(),
      Type.Object({}),
      Type.Array(Type.Any()),
    ]),
  }),
  response: {
    200: Type.Object({
      message: Type.String(),
    }),
    400: Type.Object({
      error: Type.String(),
    }),
  },
};

export const configRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: ConfigUpdateRequest }>(
    '/update',
    {
      schema: configUpdateSchema,
    },
    async (request) => {
      validateConfigUpdateRequest(request.body);
      
      const config = ConfigManagerV2.getInstance().get(request.body.configPath);
      
      // Type conversion for string inputs
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
