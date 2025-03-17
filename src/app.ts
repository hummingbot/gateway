// External dependencies
import Fastify, { FastifyInstance } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { Type } from '@sinclair/typebox';
import { spawn } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';
// Internal services
import { logger } from './services/logger';
import { getHttpsOptions } from './https';
import { errorHandler } from './services/error-handler';
import { ConfigManagerV2 } from './services/config-manager-v2';
import { asciiLogo } from './index';

// Routes
import { configRoutes } from './config/config.routes';
import { walletRoutes } from './wallet/wallet.routes';
import { connectorsRoutes } from './connectors/connector.routes';
import { solanaRoutes } from './chains/solana/solana.routes';
import { ethereumRoutes } from './chains/ethereum/ethereum.routes';
import { jupiterRoutes } from './connectors/jupiter/jupiter.routes';
import { meteoraRoutes } from './connectors/meteora/meteora.routes';
import { uniswapRoutes } from './connectors/uniswap/uniswap.routes';
import { raydiumRoutes } from './connectors/raydium/raydium.routes';
import { polkadotRoutes } from './chains/polkadot/polkadot.routes';
import { hydrationRoutes } from './connectors/hydration/hydration.routes';


// Change version for each release
const GATEWAY_VERSION = '2.4.0';

// At the top level, define devMode once
// When true, runs server in HTTP mode (less secure but useful for development)
// When false, runs server in HTTPS mode (secure, default for production)
// Use --dev flag to enable HTTP mode, e.g.: pnpm start --dev
// Tests automatically run in dev mode via GATEWAY_TEST_MODE=dev
const devMode = process.argv.includes('--dev') || process.env.GATEWAY_TEST_MODE === 'dev';

// Promisify exec for async/await usage
const execPromise = promisify(exec);

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
      { name: 'meteora', description: 'Meteora connector endpoints' },
      { name: 'raydium', description: 'Raydium connector endpoints' },
      { name: 'jupiter', description: 'Jupiter connector endpoints' },
      { name: 'ethereum', description: 'Ethereum chain endpoints' },
      { name: 'uniswap', description: 'Uniswap connector endpoints' },
      { name: 'polkadot', description: 'Polkadot chain endpoints' },
      { name: 'hydration', description: 'Hydration connector endpoints' },
    ],
    components: {
      parameters: {
        queryExample: {
          in: 'query',
          name: 'example',
          schema: {
            type: 'object' as const
          }
        }
      }
    }
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
  exposeRoute: true
};

// Make docsServer accessible to startGateway
let docsServer: FastifyInstance | null = null;

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
    https: devMode ? undefined : getHttpsOptions()
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
        docExpansion: 'list',
        deepLinking: false,
        tryItOutEnabled: true,
        displayRequestDuration: true,
        persistAuthorization: true,
        filter: true,
        defaultModelExpandDepth: 3,
        defaultModelsExpandDepth: 3
      },
      staticCSP: true,
      transformStaticCSP: (header) => header
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
    app.register(meteoraRoutes.clmm, { prefix: '/meteora/clmm' });
    app.register(raydiumRoutes.clmm, { prefix: '/raydium/clmm' });
    app.register(raydiumRoutes.amm, { prefix: '/raydium/amm' });
    app.register(uniswapRoutes, { prefix: '/uniswap' });
    app.register(solanaRoutes, { prefix: '/solana' });
    app.register(ethereumRoutes, { prefix: '/ethereum' });
    app.register(polkadotRoutes, { prefix: '/polkadot' });
    app.register(hydrationRoutes.amm, { prefix: '/hydration/amm' });
  };

  // Register routes on main server
  registerRoutes(server);
  // Register routes on docs server (for OpenAPI generation) only if it exists
  if (docsServer) {
    registerRoutes(docsServer);
  }

  // Register request body parsers
  server.addContentTypeParser('application/json', { parseAs: 'string' }, server.getDefaultJsonParser('ignore', 'ignore'));

  // Global error handler
  server.setErrorHandler(errorHandler);

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
      stdio: 'inherit'
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
  logger.info(`⚡️ Gateway version ${GATEWAY_VERSION} starting at ${protocol}://localhost:${port}`);

  try {
    // Kill any process using the gateway port
    try {
      logger.info(`Checking for processes using port ${port}...`);

      // Use more reliable platform-specific commands
      if (process.platform === 'win32') {
        try {
          // Windows command to find and kill process on port
          const { stdout } = await execPromise(`netstat -ano | findstr :${port}`);
          if (stdout) {
            const lines = stdout.trim().split('\n');
            for (const line of lines) {
              const parts = line.trim().split(/\s+/);
              if (parts.length > 4) {
                const pid = parts[parts.length - 1];
                logger.info(`Found process ${pid} using port ${port}, killing...`);
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
                logger.info(`Found process ${pid} using port ${port}, killing...`);
                await execPromise(`kill -9 ${pid}`);
              }
            }
          }
        } catch (err) {
          logger.info(`No process found using port ${port}`);
        }
      }
    } catch (error) {
      logger.warn(`Error while checking for processes on port ${port}: ${error}`);
    }

    if (devMode) {
      logger.info('🔴 Running in development mode with (unsafe!) HTTP endpoints');
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
