// External dependencies
import { spawn } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';

import fastifyRateLimit from '@fastify/rate-limit';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import Fastify, { FastifyInstance } from 'fastify';

// Internal dependencies

// Routes
import { ethereumRoutes } from './chains/ethereum/ethereum.routes';
import { solanaRoutes } from './chains/solana/solana.routes';
import { configRoutes } from './config/config.routes';
import { register0xRoutes } from './connectors/0x/0x.routes';
import { dflowRoutes } from './connectors/dflow/dflow.routes';
import { jupiterRoutes } from './connectors/jupiter/jupiter.routes';
import { meteoraRoutes } from './connectors/meteora/meteora.routes';
import { okxRoutes } from './connectors/okx/okx.routes';
import { orcaRoutes } from './connectors/orca/orca.routes';
import { pancakeswapRoutes } from './connectors/pancakeswap/pancakeswap.routes';
import { pancakeswapSolRoutes } from './connectors/pancakeswap-sol/pancakeswap-sol.routes';
import { raydiumRoutes } from './connectors/raydium/raydium.routes';
import { titanRoutes } from './connectors/titan/titan.routes';
import { uniswapRoutes } from './connectors/uniswap/uniswap.routes';
import { getHttpsOptions } from './https';
import { rootPath } from './paths';
import { poolRoutes } from './pools/pools.routes';
import { ConfigManagerV2 } from './services/config-manager-v2';
import {
  constantTimeEqual,
  extractBearerToken,
  getBindAddress,
  isExposedHost,
  isLoopbackAddress,
  isSensitivePath,
  isTrustedLocalAddress,
  loadOrCreateApiKey,
} from './services/gateway-security';
import { logger } from './services/logger';
import { quoteCache } from './services/quote-cache';
import { displayChainConfigurations } from './services/startup-banner';
import { tokensRoutes } from './tokens/tokens.routes';
import { tradingRoutes, tradingClmmRoutes } from './trading/trading.routes';
import { GATEWAY_VERSION } from './version';
import { walletRoutes } from './wallet/wallet.routes';

import { asciiLogo } from './index';

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
      description: 'API endpoints for interacting with DEXs and blockchains',
      version: GATEWAY_VERSION,
    },
    servers: [
      {
        url: `http://localhost:${ConfigManagerV2.getInstance().get('server.port')}`,
      },
    ],
    tags: [
      // Main categories
      { name: '/config', description: 'System configuration endpoints' },
      { name: '/wallet', description: 'Wallet management endpoints' },
      { name: '/tokens', description: 'Token management endpoints' },
      { name: '/pools', description: 'Pool management endpoints' },
      { name: '/trading/swap', description: 'Unified cross-chain swap endpoints' },
      { name: '/trading/clmm', description: 'Unified cross-chain CLMM (Concentrated Liquidity) endpoints' },

      // Chains
      {
        name: '/chain/solana',
        description: 'Solana and SVM-based chain endpoints',
      },
      {
        name: '/chain/ethereum',
        description: 'Ethereum and EVM-based chain endpoints',
      },

      // Connectors
      {
        name: '/connector/jupiter',
        description: 'Jupiter connector endpoints',
      },
      {
        name: '/connector/meteora',
        description: 'Meteora connector endpoints',
      },
      {
        name: '/connector/orca',
        description: 'Orca connector endpoints',
      },
      {
        name: '/connector/raydium',
        description: 'Raydium connector endpoints',
      },
      {
        name: '/connector/uniswap',
        description: 'Uniswap connector endpoints',
      },
      { name: '/connector/0x', description: '0x connector endpoints' },
      {
        name: '/connector/pancakeswap-sol',
        description: 'PancakeSwap Solana connector endpoints',
      },
      {
        name: '/connector/pancakeswap',
        description: 'PancakeSwap EVM connector endpoints',
      },
      {
        name: '/connector/dflow',
        description: 'DFlow connector endpoints',
      },
      {
        name: '/connector/okx',
        description: 'OKX DEX aggregator connector endpoints',
      },
      {
        name: '/connector/titan',
        description: 'Titan connector endpoints',
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

  // Register rate limiting globally. Trusted-local clients (the local bot on loopback, or a
  // sibling container/LAN host on a private-network address) are never rate-limited, so there
  // is zero impact on a co-located Hummingbot bot — including the standard Docker deployment
  // where the bot reaches Gateway over the compose bridge (a 172.x/10.x source, not loopback).
  // Public/untrusted clients are limited and repeat abusers are temporarily banned (429 ->
  // 403). (hummingbot/gateway#652 §2)
  server.register(fastifyRateLimit, {
    max: 100, // maximum 100 requests
    timeWindow: '1 minute', // per 1 minute window
    global: true, // apply to all routes
    ban: 4, // after exceeding the limit repeatedly, temporarily lock the source out (403)
    allowList: (request) => isTrustedLocalAddress(request.ip),
    errorResponseBuilder: function (_request, context) {
      return {
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded, retry in ${context.after}`,
        date: Date.now(),
        expiresIn: context.ttl,
      };
    },
  });

  // API-token auth for fund-moving / secret routes (hummingbot/gateway#652 §1).
  // OPT-IN: enabled when GATEWAY_API_KEY or GATEWAY_REQUIRE_AUTH=true is set — which you do
  // when exposing Gateway to a network. It is OFF by default so it never breaks a local or
  // Docker deployment (where the source IP is the bridge gateway, not loopback); the default
  // protection is binding to loopback (§4). When enabled, loopback requests are trusted and
  // only NON-loopback requests to sensitive routes must present the token (constant-time).
  const requireAuth = process.env.GATEWAY_REQUIRE_AUTH === 'true' || !!process.env.GATEWAY_API_KEY;
  if (requireAuth) {
    const gatewayApiKey = loadOrCreateApiKey(`${rootPath()}/conf`);
    logger.info('API-token authentication is enabled for network requests to fund-moving routes.');
    server.addHook('onRequest', async (request, reply) => {
      if (isLoopbackAddress(request.ip)) return; // trusted
      if (!isSensitivePath(request.url)) return; // only gate sensitive routes
      const token = extractBearerToken(request.headers['authorization'] as string | undefined);
      if (!constantTimeEqual(token, gatewayApiKey)) {
        logger.warn(`Rejected unauthenticated request from ${request.ip}: ${request.method} ${request.url}`);
        reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or missing API key' });
      }
    });
  }

  // Serve Swagger/OpenAPI docs only on loopback (or when explicitly enabled). An exposed
  // /docs hands an attacker the full route map of fund-handling endpoints. (#652)
  const exposeDocs = !isExposedHost(getBindAddress()) || process.env.GATEWAY_ENABLE_DOCS === 'true';
  if (exposeDocs) {
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
  }

  // Register routes on both servers
  const registerRoutes = async (app: FastifyInstance) => {
    // Register system routes
    app.register(configRoutes, { prefix: '/config' });

    // Register wallet routes
    app.register(walletRoutes, { prefix: '/wallet' });
    // Register token routes
    app.register(tokensRoutes, { prefix: '/tokens' });
    // Register pool routes
    app.register(poolRoutes, { prefix: '/pools' });

    // Register trading routes (unified cross-chain swap)
    app.register(tradingRoutes, { prefix: '/trading/swap' });

    // Register trading CLMM routes (unified cross-chain concentrated liquidity)
    app.register(tradingClmmRoutes, { prefix: '/trading/clmm' });

    // Register chain routes
    app.register(solanaRoutes, { prefix: '/chains/solana' });
    app.register(ethereumRoutes, { prefix: '/chains/ethereum' });

    // Register DEX connector routes - organized by connector

    // Jupiter routes
    app.register(jupiterRoutes.router, {
      prefix: '/connectors/jupiter/router',
    });

    // DFlow routes
    app.register(dflowRoutes.router, {
      prefix: '/connectors/dflow/router',
    });

    // OKX DEX aggregator routes
    app.register(okxRoutes.router, {
      prefix: '/connectors/okx/router',
    });

    // Titan routes
    app.register(titanRoutes.router, {
      prefix: '/connectors/titan/router',
    });

    // Meteora routes
    app.register(meteoraRoutes.clmm, { prefix: '/connectors/meteora/clmm' });

    // // Orca routes
    app.register(orcaRoutes.clmm, { prefix: '/connectors/orca/clmm' });

    // Raydium routes
    app.register(raydiumRoutes.amm, { prefix: '/connectors/raydium/amm' });
    app.register(raydiumRoutes.clmm, { prefix: '/connectors/raydium/clmm' });

    // Uniswap routes
    app.register(uniswapRoutes.router, {
      prefix: '/connectors/uniswap/router',
    });
    app.register(uniswapRoutes.amm, { prefix: '/connectors/uniswap/amm' });
    app.register(uniswapRoutes.clmm, { prefix: '/connectors/uniswap/clmm' });

    // 0x routes
    app.register(register0xRoutes);

    // Pancakeswap routes
    app.register(pancakeswapRoutes.router, {
      prefix: '/connectors/pancakeswap/router',
    });
    app.register(pancakeswapRoutes.amm, { prefix: '/connectors/pancakeswap/amm' });
    app.register(pancakeswapRoutes.clmm, { prefix: '/connectors/pancakeswap/clmm' });

    // PancakeSwap Solana routes
    app.register(pancakeswapSolRoutes, { prefix: '/connectors/pancakeswap-sol' });
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
      logger.warn(`Validation error on ${request.method} ${request.url}: ${error.message}`);
      return reply.status(400).send({
        statusCode: 400,
        error: 'Validation Error',
        message: error.message,
        validation: error.validation,
      });
    }

    // Handle Fastify's native errors (includes rate limit errors with statusCode 429)
    if (error.statusCode && error.statusCode >= 400) {
      const response: Record<string, unknown> = {
        statusCode: error.statusCode,
        error: error.name,
        message: error.message,
      };
      // Include error code if present (for specific error types like TRANSACTION_TIMEOUT)
      if ('code' in error && error.code) {
        response.code = error.code;
      }
      return reply.status(error.statusCode).send(response);
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
  logger.info(`⚡️ Gateway version ${GATEWAY_VERSION} starting at ${protocol}://localhost:${port}`);
  logger.info(`🔧 Log level configured as: ${ConfigManagerV2.getInstance().get('server.logLevel') || 'info'}`);

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

    // Bind to loopback by default; expose to the network only via GATEWAY_BIND_ADDRESS.
    // This is the single highest-value control: most remote attacks require reaching the
    // service. (hummingbot/gateway#652 §4)
    const bindAddress = getBindAddress();
    if (isExposedHost(bindAddress)) {
      logger.warn(
        `⚠️  Gateway is binding to ${bindAddress} (NOT loopback) — it is reachable from your network. ` +
          `Network requests to fund-moving routes require the API token (conf/api-key or GATEWAY_API_KEY). ` +
          `Prefer keeping Gateway on 127.0.0.1 and reaching it over a VPN/Tailscale.`,
      );
    }

    if (devMode) {
      logger.info('🔴 Running in development mode with (unsafe!) HTTP endpoints');
      await gatewayApp.listen({ port, host: bindAddress });
    } else {
      logger.info('🟢 Running in secured mode with behind HTTPS endpoints');
      await gatewayApp.listen({ port, host: bindAddress });
    }

    // Single documentation log after server starts
    const docsUrl = docsPort ? `http://localhost:${docsPort}` : `${protocol}://localhost:${port}/docs`;

    logger.info(`📓 Documentation available at ${docsUrl}`);

    // Display chain configurations now that server has started
    displayChainConfigurations();

    // Set up graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');

      // Close server
      await gatewayApp.close();

      logger.info('Gateway stopped');
      process.exit(0);
    };

    // Handle shutdown signals
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (err) {
    logger.error(`Failed to start the server: ${err}`);
    process.exit(1);
  }
};
