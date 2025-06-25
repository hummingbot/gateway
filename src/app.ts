// External dependencies
import { spawn } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';

import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import Fastify, { FastifyInstance } from 'fastify';

// Internal dependencies
import { GATEWAY_VERSION } from './version';

// Routes
import { chainRoutes } from './chains/chain.routes';
import { ethereumRoutes } from './chains/ethereum/ethereum.routes';
import { solanaRoutes } from './chains/solana/solana.routes';
import { configRoutes } from './config/config.routes';
import { connectorsRoutes } from './connectors/connector.routes';
import { jupiterRoutes } from './connectors/jupiter/jupiter.routes';
import { meteoraRoutes } from './connectors/meteora/meteora.routes';
import { raydiumRoutes } from './connectors/raydium/raydium.routes';
import { uniswapRoutes } from './connectors/uniswap/uniswap.routes';
import { getHttpsOptions } from './https';
import { ConfigManagerV2 } from './services/config-manager-v2';
import { logger } from './services/logger';
import { walletRoutes } from './wallet/wallet.routes';

import { asciiLogo } from './index';

// At the top level, define devMode once
// When true, runs server in HTTP mode (less secure but useful for development)
// When false, runs server in HTTPS mode (secure, default for production)
// Use --dev flag to enable HTTP mode, e.g.: pnpm start --dev
// Tests automatically run in dev mode via GATEWAY_TEST_MODE=dev
const devMode =
  process.argv.includes('--dev') || process.env.GATEWAY_TEST_MODE === 'dev';

// Promisify exec for async/await usage
const execPromise = promisify(exec);

const swaggerOptions = {
  openapi: {
    info: {
      title: 'Hummingbot Gateway',
      description:
        'API endpoints for interacting with DEX connectors on various blockchain networks',
      version: GATEWAY_VERSION,
    },
    servers: [
      {
        url: `http://localhost:${ConfigManagerV2.getInstance().get('server.port')}`,
      },
    ],
    tags: [
      // Main categories
      { name: 'system', description: 'System configuration endpoints' },
      { name: 'wallet', description: 'Wallet management endpoints' },

      // Chains
      { name: 'solana', description: 'Solana chain endpoints' },
      { name: 'ethereum', description: 'Ethereum chain endpoints' },

      // Connectors
      { name: 'jupiter', description: 'Jupiter DEX aggregator (Solana)' },
      {
        name: 'raydium/amm',
        description: 'Raydium Standard pool connector (Solana)',
      },
      {
        name: 'raydium/clmm',
        description: 'Raydium Concentrated pool connector (Solana)',
      },
      {
        name: 'meteora/clmm',
        description: 'Meteora DLMM pool connector (Solana)',
      },
      {
        name: 'uniswap',
        description: 'Uniswap router connector (Ethereum mainnet)',
      },
      {
        name: 'uniswap/amm',
        description: 'Uniswap V2 pool connector (Ethereum)',
      },
      {
        name: 'uniswap/clmm',
        description: 'Uniswap V3 pool connector (Ethereum)',
      },
    ],
    components: {
      parameters: {
        queryExample: {
          in: 'query',
          name: 'example',
          schema: {
            type: 'object' as const,
          },
        },
      },
    },
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
  hideUntagged: true,
  exposeRoute: true,
};

// Make docsServer accessible to startGateway
let docsServer: FastifyInstance | null = null;

// Create gateway app configuration function
const configureGatewayServer = () => {
  const server = Fastify({
    logger: ConfigManagerV2.getInstance().get('server.fastifyLogs')
      ? {
          level: 'info',
          transport: {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          },
        }
      : false,
    https: devMode ? undefined : getHttpsOptions(),
  });

  const docsPort = ConfigManagerV2.getInstance().get('server.docsPort');

  docsServer = docsPort ? Fastify() : null;

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
        docExpansion: 'none',
        deepLinking: false,
        tryItOutEnabled: true,
        displayRequestDuration: true,
        persistAuthorization: true,
        filter: true,
        defaultModelExpandDepth: 3,
        defaultModelsExpandDepth: 3,
      },
      staticCSP: true,
      transformStaticCSP: (header) => header,
    });
  } else {
    // Otherwise set up separate docs server
    docsServer?.register(fastifySwagger, swaggerOptions);
    docsServer?.register(fastifySwaggerUi, {
      routePrefix: '/',
      uiConfig: {
        docExpansion: 'none',
        deepLinking: false,
        tryItOutEnabled: true,
        displayRequestDuration: true,
        persistAuthorization: true,
        filter: true,
      },
    });
  }

  // Register routes on both servers
  const registerRoutes = async (app: FastifyInstance) => {
    // Register system routes
    app.register(configRoutes, { prefix: '/config' });
    app.register(walletRoutes, { prefix: '/wallet' });

    // Register connector list route
    app.register(connectorsRoutes, { prefix: '/connectors' });

    // Register chain list route
    app.register(chainRoutes, { prefix: '/chains' });

    // Register DEX connector routes
    app.register(jupiterRoutes.swap, { prefix: '/connectors/jupiter' });

    // Meteora routes
    app.register(meteoraRoutes.clmm, { prefix: '/connectors/meteora/clmm' });

    // Raydium routes
    app.register(raydiumRoutes.clmm, { prefix: '/connectors/raydium/clmm' });
    app.register(raydiumRoutes.amm, { prefix: '/connectors/raydium/amm' });

    app.register(uniswapRoutes, { prefix: '/connectors/uniswap' });

    // Register chain routes
    app.register(solanaRoutes, { prefix: '/chains/solana' });
    app.register(ethereumRoutes, { prefix: '/chains/ethereum' });
  };

  // Register routes on main server
  registerRoutes(server);
  // Register routes on docs server (for OpenAPI generation) only if it exists
  if (docsServer) {
    registerRoutes(docsServer);
  }

  // Register request body parsers
  server.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    server.getDefaultJsonParser('ignore', 'ignore'),
  );

  // Global error handler
  server.setErrorHandler((error, request, reply) => {
    // Handle validation errors
    if ('validation' in error && error.validation) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Validation Error',
        message: error.message,
        validation: error.validation,
      });
    }

    // Handle Fastify's native errors
    if (error.statusCode && error.statusCode >= 400) {
      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.name,
        message: error.message,
      });
    }

    // Log and handle unexpected errors
    logger.error('Unhandled error:', {
      error: error.message,
      stack: error.stack,
      url: request.url,
      params: request.params,
    });

    reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  });

  // Health check route (outside registerRoutes, only on main server)
  server.get('/', async () => {
    return { status: 'ok' };
  });

  // Restart endpoint (outside registerRoutes, only on main server)
  server.post('/restart', async (_req, reply) => {
    await reply.status(200).send();
    // Spawn a new instance before exiting
    spawn(process.argv[0], process.argv.slice(1), {
      detached: true,
      stdio: 'inherit',
    });
    process.exit(0);
  });

  return server;
};

// Export the server instance
export const gatewayApp = configureGatewayServer();

export const startGateway = async () => {
  const port = ConfigManagerV2.getInstance().get('server.port');
  const docsPort = ConfigManagerV2.getInstance().get('server.docsPort');
  const protocol = devMode ? 'http' : 'https';

  // Display ASCII logo
  console.log(`\n${asciiLogo.trim()}`);
  logger.info(
    `⚡️ Gateway version ${GATEWAY_VERSION} starting at ${protocol}://localhost:${port}`,
  );

  try {
    // Kill any process using the gateway port
    try {
      logger.info(`Checking for processes using port ${port}...`);

      // Use more reliable platform-specific commands
      if (process.platform === 'win32') {
        try {
          // Windows command to find and kill process on port
          const { stdout } = await execPromise(
            `netstat -ano | findstr :${port}`,
          );
          if (stdout) {
            const lines = stdout.trim().split('\n');
            for (const line of lines) {
              const parts = line.trim().split(/\s+/);
              if (parts.length > 4) {
                const pid = parts[parts.length - 1];
                logger.info(
                  `Found process ${pid} using port ${port}, killing...`,
                );
                await execPromise(`taskkill /F /PID ${pid}`);
              }
            }
          }
        } catch (err) {
          logger.info(`No process found using port ${port}`);
        }
      } else {
        // macOS/Linux more reliable command
        try {
          // Find PID of process using the port
          const { stdout } = await execPromise(`lsof -i :${port} -t`);
          if (stdout.trim()) {
            const pids = stdout.trim().split('\n');
            for (const pid of pids) {
              if (pid.trim()) {
                logger.info(
                  `Found process ${pid} using port ${port}, killing...`,
                );
                await execPromise(`kill -9 ${pid}`);
              }
            }
          }
        } catch (err) {
          logger.info(`No process found using port ${port}`);
        }
      }
    } catch (error) {
      logger.warn(
        `Error while checking for processes on port ${port}: ${error}`,
      );
    }

    if (devMode) {
      logger.info(
        '🔴 Running in development mode with (unsafe!) HTTP endpoints',
      );
      await gatewayApp.listen({ port, host: '0.0.0.0' });
    } else {
      logger.info('🟢 Running in secured mode with behind HTTPS endpoints');
      await gatewayApp.listen({ port, host: '0.0.0.0' });
    }

    // Single documentation log after server starts
    const docsUrl = docsPort
      ? `http://localhost:${docsPort}`
      : `${protocol}://localhost:${port}/docs`;

    logger.info(`📓 Documentation available at ${docsUrl}`);
  } catch (err) {
    logger.error(`Failed to start the server: ${err}`);
    process.exit(1);
  }
};
