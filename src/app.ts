// External dependencies
import Fastify, { FastifyInstance } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { Type } from '@sinclair/typebox';
// Internal services
import { logger } from './services/logger';
import { getHttpsOptions } from './https';
import { 
  gatewayErrorMiddleware, 
  HttpException, 
  NodeError 
} from './services/error-handler';
import { ConfigManagerV2 } from './services/config-manager-v2';

// Routes
import { configRoutes } from './services/config/config.routes';
import { chainRoutes } from './chains/chain.routes';
import { walletRoutes } from './wallet/wallet.routes';
import { ammRoutes } from './amm/amm.routes';
import { connectorsRoutes } from './connectors/connectors.routes';

// Define swagger options once
const swaggerOptions = {
  openapi: {
    info: {
      title: 'Gateway API',
      description: 'API documentation for the Gateway service',
      version: '2.2.0'
    },
    servers: [
      {
        url: `http://localhost:${ConfigManagerV2.getInstance().get('server.port')}`,
      },
    ],
    tags: [
      { name: 'connectors', description: 'Connector endpoints' },
      { name: 'config', description: 'Configuration endpoints' },
      { name: 'wallet', description: 'Wallet endpoints' },
      { name: 'chain', description: 'Chain endpoints' },
      { name: 'amm', description: 'AMM endpoints' },
    ],
  },
  transform: ({ schema, url }) => {
    try {
      return {
        schema: schema ? Type.Strict(schema) : schema,
        url: url,
      };
    } catch (error) {
      return { schema, url };
    }
  },
};

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
  });
  
  // Create a separate server instance for docs
  const docsServer = Fastify();
  
  // Register TypeBox provider for both servers
  server.withTypeProvider<TypeBoxTypeProvider>();
  docsServer.withTypeProvider<TypeBoxTypeProvider>();

  // Register Swagger with both servers
  server.register(fastifySwagger, swaggerOptions);
  docsServer.register(fastifySwagger, swaggerOptions);
  docsServer.register(fastifySwaggerUi, {
    routePrefix: '/',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
      tryItOutEnabled: true,
    },
  });

  // Register routes on both servers
  const registerRoutes = async (app: FastifyInstance) => {
    app.register(configRoutes, { prefix: '/config' });
    app.register(chainRoutes, { prefix: '/chain' });
    app.register(ammRoutes, { prefix: '/amm' });
    app.register(connectorsRoutes, { prefix: '/connectors' });
    app.register(walletRoutes, { prefix: '/wallet' });
  };

  // Register routes on main server
  registerRoutes(server);
  // Register routes on docs server (for OpenAPI generation)
  registerRoutes(docsServer);

  // Start docs server on port 8080
  docsServer.listen({ port: 8080, host: '0.0.0.0' }, (err) => {
    if (err) {
      logger.error('Failed to start docs server:', err);
    } else {
      logger.info('Documentation available at http://localhost:8080');
    }
  });

  // Register request body parsers
  server.addContentTypeParser('application/json', { parseAs: 'string' }, server.getDefaultJsonParser('ignore', 'ignore'));

  // Global error handler
  server.setErrorHandler((error: Error | NodeError | HttpException, request, reply) => {
    logger.error(error);
    const response = gatewayErrorMiddleware(error);
    return reply.status(response.httpErrorCode).send(response);
  });

  // Health check route (outside registerRoutes, only on main server)
  server.get('/', async () => {
    return { status: 'ok' };
  });

  // Restart endpoint (outside registerRoutes, only on main server)
  server.post('/restart', async () => {
    process.exit(1);
  });

  return server;
};

// Export the server instance
export const gatewayApp = configureGatewayServer();

export const startGateway = async () => {
  const gateway_version = 'dev-2.3.0';
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
