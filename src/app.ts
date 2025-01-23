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
import { configRoutes } from './config/config.routes';
import { walletRoutes } from './wallet/wallet.routes';
import { connectorsRoutes } from './connectors/connector.routes';
import { solanaRoutes } from './chains/solana/solana.routes';
import { ethereumRoutes } from './chains/ethereum/ethereum.routes';
import { jupiterRoutes } from './connectors/jupiter/jupiter.routes';
import { meteoraRoutes } from './connectors/meteora/meteora.routes';
import { uniswapRoutes } from './connectors/uniswap/uniswap.routes';

// Change version for each release
const GATEWAY_VERSION = 'dev-2.3.0';

// Define swagger options once
const swaggerOptions = {
  openapi: {
    info: {
      title: 'Hummingbot Gateway',
      description: 'API endpoints for interacting with DEX connectors on various blockchain networks',
      version: GATEWAY_VERSION
    },
    servers: [
      {
        url: `http://localhost:${ConfigManagerV2.getInstance().get('server.port')}`,
      },
    ],
    tags: [
      { name: 'connectors', description: 'Available connectors' },
      { name: 'config', description: 'Configuration endpoints' },
      { name: 'wallet', description: 'Wallet endpoints' },
      { name: 'solana', description: 'Solana chain endpoints' },
      { name: 'ethereum', description: 'Ethereum chain endpoints' },
      { name: 'jupiter', description: 'Jupiter connector endpoints' },
      { name: 'meteora', description: 'Meteora connector endpoints' },
      { name: 'uniswap', description: 'Uniswap connector endpoints' },
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
    logger: ConfigManagerV2.getInstance().get('server.fastifyLogs') ? {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    } : false,
    https: ConfigManagerV2.getInstance().get('server.devHTTPMode') 
      ? undefined 
      : getHttpsOptions()
  });
  
  const docsPort = ConfigManagerV2.getInstance().get('server.docsPort');
  
  // Only create separate docs server if docsPort is specified and non-zero
  const docsServer = docsPort ? Fastify() : null;
  
  // Register TypeBox provider
  server.withTypeProvider<TypeBoxTypeProvider>();
  if (docsServer) {
    docsServer.withTypeProvider<TypeBoxTypeProvider>();
  }

  // Register Swagger
  server.register(fastifySwagger, swaggerOptions);
  
  // Register Swagger UI based on configuration
  if (!docsPort) {
    // If no docs port, serve docs on main server at /docs
    server.register(fastifySwaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: false,
        tryItOutEnabled: true,
      },
    });
  } else {
    // Otherwise set up separate docs server
    docsServer?.register(fastifySwagger, swaggerOptions);
    docsServer?.register(fastifySwaggerUi, {
      routePrefix: '/',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: false,
        tryItOutEnabled: true,
      },
    });
  }

  // Register routes on both servers
  const registerRoutes = async (app: FastifyInstance) => {
    app.register(configRoutes, { prefix: '/config' });
    app.register(connectorsRoutes, { prefix: '/connectors' });
    app.register(walletRoutes, { prefix: '/wallet' });
    app.register(jupiterRoutes, { prefix: '/jupiter' });
    app.register(meteoraRoutes, { prefix: '/meteora' });
    app.register(uniswapRoutes, { prefix: '/uniswap' });
    app.register(solanaRoutes, { prefix: '/solana' });
    app.register(ethereumRoutes, { prefix: '/ethereum' });
  };

  // Register routes on main server
  registerRoutes(server);
  // Register routes on docs server (for OpenAPI generation) only if it exists
  if (docsServer) {
    registerRoutes(docsServer);
  }

  // Start docs server only if docsPort is specified
  if (docsServer && docsPort) {
    docsServer.listen({ port: docsPort, host: '0.0.0.0' }, (err) => {
      if (err) {
        logger.error('Failed to start docs server:', err);
      } else {
        logger.info(`📓 Documentation available at http://localhost:${docsPort}`);
      }
    });
  } else {
    const protocol = ConfigManagerV2.getInstance().get('server.devHTTPMode') ? 'http' : 'https';
    logger.info(`📓 Documentation available at ${protocol}://localhost:${ConfigManagerV2.getInstance().get('server.port')}/docs`);
  }

  // Register request body parsers
  server.addContentTypeParser('application/json', { parseAs: 'string' }, server.getDefaultJsonParser('ignore', 'ignore'));

  // Global error handler
  server.setErrorHandler((error: Error | NodeError | HttpException, _request, reply) => {
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
  const port = ConfigManagerV2.getInstance().get('server.port');
  const protocol = ConfigManagerV2.getInstance().get('server.devHTTPMode') ? 'http' : 'https';
  
  logger.info(`⚡️ Gateway version ${GATEWAY_VERSION} starting at ${protocol}://localhost:${port}`);

  try {
    if (ConfigManagerV2.getInstance().get('server.devHTTPMode')) {
      logger.info('🔴 Running in development mode with (unsafe!) HTTP endpoints');
      await gatewayApp.listen({ port, host: '0.0.0.0' });
    } else {
      logger.info('🟢 Running in secured mode with behind HTTPS endpoints');
      await gatewayApp.listen({ port, host: '0.0.0.0' });
    }
  } catch (err) {
    logger.error(
      `Failed to start the server: ${err}`
    );
    process.exit(1);
  }
};
