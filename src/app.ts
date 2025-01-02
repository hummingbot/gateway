import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { Type } from '@sinclair/typebox';

import { logger } from './services/logger';
import { getHttpsOptions } from './https';
import { gatewayErrorMiddleware, HttpException, NodeError } from './services/error-handler';
import { ConfigManagerV2 } from './services/config-manager-v2';
import { SwaggerManager } from './services/swagger-manager';
import { ConnectorsRoutes } from './connectors/connectors.routes';
import { AmmRoutes } from './amm/amm.routes';

import { configRoutes } from './services/config/config.routes';
import { chainRoutes } from './chains/chain.routes';
import { walletRoutes } from './services/wallet/wallet.routes';

// Generate swagger document
export const swaggerDocument = SwaggerManager.generateSwaggerJson(
  './docs/swagger/swagger.yml',
  './docs/swagger/definitions.yml',
  [
    './docs/swagger/main-routes.yml',
    './docs/swagger/connectors-routes.yml',
    './docs/swagger/wallet-routes.yml',
    './docs/swagger/amm-routes.yml',
    './docs/swagger/amm-liquidity-routes.yml',
    './docs/swagger/chain-routes.yml',
  ]
);

// Create gateway app configuration function
const configureGatewayServer = () => {
  const server = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
    https: ConfigManagerV2.getInstance().get('server.unsafeDevModeWithHTTP') 
      ? undefined 
      : getHttpsOptions()
  }).withTypeProvider<TypeBoxTypeProvider>();

  // Register request body parsers (built into Fastify)
  server.addContentTypeParser('application/json', { parseAs: 'string' }, server.getDefaultJsonParser('ignore', 'ignore'));

  // Register routes
  server.register(configRoutes, { prefix: '/config' });
  server.register(chainRoutes, { prefix: '/chain' });
  // server.register(AmmRoutes.router, { prefix: '/amm' });
  // server.register(ConnectorsRoutes.router, { prefix: '/connectors' });
  server.register(walletRoutes, { prefix: '/wallet' });

  // Health check route
  server.get('/', async () => {
    return { status: 'ok' };
  });

  // Restart endpoint
  server.post('/restart', async () => {
    process.exit(1);
  });

  // Global error handler
  server.setErrorHandler((error: Error | NodeError | HttpException, request, reply) => {
    logger.error(error);
    const response = gatewayErrorMiddleware(error);
    return reply.status(response.httpErrorCode).send(response);
  });

  // Register Swagger
  server.register(fastifySwagger, { openapi: swaggerDocument });

  server.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
    staticCSP: false,
    transformStaticCSP: (header) => header,
  });

  return server;
};

// Export the server instance
export const gatewayApp = configureGatewayServer();

export const startGateway = async () => {
  const gateway_version = '2.2.0';
  const port = ConfigManagerV2.getInstance().get('server.port');

  if (!ConfigManagerV2.getInstance().get('server.id')) {
    ConfigManagerV2.getInstance().set(
      'server.id',
      Math.random().toString(16).substr(2, 14)
    );
  }

  logger.info(`Gateway Version: ${gateway_version}`);
  logger.info(`⚡️ Starting Gateway API on port ${port}...`);

  try {
    if (ConfigManagerV2.getInstance().get('server.unsafeDevModeWithHTTP')) {
      logger.info('Running in UNSAFE HTTP! This could expose private keys.');
      await gatewayApp.listen({ port, host: '0.0.0.0' });
    } else {
      await gatewayApp.listen({ port, host: '0.0.0.0' });
      logger.info('The gateway server is secured behind HTTPS.');
    }
  } catch (err) {
    logger.error(
      `Failed to start the server: ${err}`
    );
    process.exit(1);
  }
};
