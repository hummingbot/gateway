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
import { chainRoutes } from './chains/chain.routes';
import * as ethereumSchemas from './chains/ethereum/schemas';
import { configRoutes } from './config/config.routes';
import { getHttpsOptions } from './https';
import { rootPath } from './paths';
import { poolRoutes } from './pools/pools.routes';
import * as ammSchemas from './schemas/amm-schema';
import * as chainSchemas from './schemas/chain-schema';
import * as clmmSchemas from './schemas/clmm-schema';
import * as errorSchemas from './schemas/error-schema';
import * as routerSchemas from './schemas/router-schema';
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
import { OPERATION_IDS } from './services/operation-ids';
import { quoteCache } from './services/quote-cache';
import { ajvOptions } from './services/schema-keywords';
import { displayChainConfigurations } from './services/startup-banner';
import * as tokenSchemas from './tokens/schemas';
import { tokensRoutes } from './tokens/tokens.routes';
import * as clmmReadRouteSchemas from './trading/clmm';
import * as poolSwapRoutes from './trading/pool-swap-routes';
import * as ammRouteSchemas from './trading/trading-amm-routes';
import * as clmmRouteSchemas from './trading/trading-clmm-routes';
import * as routerRouteSchemas from './trading/trading-router-routes';
import { tradingRouterRoutes, tradingClmmRoutes, tradingAmmRoutes } from './trading/trading.routes';
import { GATEWAY_VERSION } from './version';
import * as walletSchemas from './wallet/schemas';
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

/**
 * Collect every `$id`-carrying schema reachable from `node`, itself included.
 *
 * The search continues *through* a schema it has already collected, because `$id`s
 * nest: each write response names its confirmed-transaction `data` object, and those
 * only ever appear inside their parent. Collecting the parent alone would leave the
 * ref `refIdentifiedSchemas` writes for that child pointing at a component nobody
 * defined — a spec that resolves nowhere.
 */
const collectIdentifiedSchemas = (node: any, found: Map<string, Record<string, any>>): void => {
  if (Array.isArray(node)) {
    node.forEach((item) => collectIdentifiedSchemas(item, found));
    return;
  }
  if (node === null || typeof node !== 'object') return;
  if (typeof node.$id === 'string' && !found.has(node.$id)) found.set(node.$id, node);
  Object.values(node).forEach((value) => collectIdentifiedSchemas(value, found));
};

/**
 * Every schema carrying an `$id`, collected from the shared schema modules and from the
 * route modules that declare their own request bodies.
 *
 * Registering these with `addSchema` is what puts them in the spec's
 * `components.schemas`; `refIdentifiedSchemas` below then points the routes at them.
 * `$id`s must be unique across all modules — Fastify rejects a duplicate — which is
 * why the AMM copies of the names CLMM also uses carry an `Amm` prefix.
 *
 * The route modules are here because the shapes in `./schemas` are the *base* types the
 * unified routes compose from, not what a caller sends: they predate the refactor, so
 * they carry a per-connector `network` and no `connector` or `chainNetwork`. Generating
 * a client from those alone produced request models that were wrong the same way for
 * every route, so each route's own body now carries the `$id` instead.
 */
const identifiedSchemas = (): Array<Record<string, any>> => {
  const found = new Map<string, Record<string, any>>();
  for (const module of [
    ammSchemas,
    chainSchemas,
    clmmSchemas,
    routerSchemas,
    ammRouteSchemas,
    clmmRouteSchemas,
    clmmReadRouteSchemas,
    routerRouteSchemas,
    poolSwapRoutes,
    ethereumSchemas,
    walletSchemas,
    tokenSchemas,
    errorSchemas,
  ]) {
    for (const value of Object.values(module)) {
      if (typeof value === 'object' && value !== null) collectIdentifiedSchemas(value, found);
    }
  }
  return [...found.values()].map((value) => {
    // Ref the schema's own $id'd children too, keeping only its root $id. Registering
    // a parent with its children inlined emits both the child component and an
    // anonymous copy inside the parent, which is what a generated client names Data1,
    // Data2, ... — numbered by traversal order, so they churn on any insertion.
    const { $id, ...rest } = Type.Strict(value as any) as Record<string, any>;
    return { $id, ...refIdentifiedSchemas(rest, 'openapi') };
  });
};

/**
 * Replace inline schema objects that carry an `$id` with a `$ref` to the component.
 *
 * Fastify inlines whatever a route declares, so without this every operation restates
 * its schemas in full: the spec had no `components.schemas` at all, identical shapes
 * (CLMM and AMM execute-swap, say) appeared as separate anonymous objects, and a
 * generated client got names derived from route paths rather than the domain — which
 * change whenever a route is renamed.
 *
 * This runs only while the spec document is built. Route validation and serialization
 * keep using the compiled inline schemas, so nothing about request handling changes.
 *
 * Two ref forms are needed, because the two places refs appear are processed
 * differently. Route schemas go through @fastify/swagger's transform, which rewrites
 * Fastify's own "Id#" form into "#/components/schemas/Id" — passing the components path
 * there instead makes it read the ref as local to the route schema and fail to resolve
 * it. Registered components are emitted verbatim, so they must already carry the
 * components path.
 */
type RefStyle = 'fastify' | 'openapi';

const refIdentifiedSchemas = (node: any, style: RefStyle = 'fastify'): any => {
  if (Array.isArray(node)) return node.map((item) => refIdentifiedSchemas(item, style));
  if (node === null || typeof node !== 'object') return node;
  if (typeof node.$id === 'string') {
    return { $ref: style === 'fastify' ? `${node.$id}#` : `#/components/schemas/${node.$id}` };
  }
  return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, refIdentifiedSchemas(value, style)]));
};

/**
 * Give an operation the two things a generated client needs and Gateway never stated: a
 * stable name, and the shape of a failure.
 *
 * Both are applied here rather than in 56 route files. The name comes from the table in
 * `operation-ids.ts` — chosen, not derived, so renaming a path does not rename a caller's
 * method. The failure shape is the same envelope on every route, so listing it per route
 * would only be a list to forget to update.
 *
 * 400 and 500 are declared everywhere because both are reachable everywhere: Fastify
 * answers 400 for any request its schema rejects, and `rethrowRouteError` turns anything
 * without a status of its own into a 500. A route that already declares a status keeps
 * what it declared.
 */
const describeOperation = (schema: any, url: string, route: any): any => {
  if (!schema || schema.hide) return schema;

  const method = Array.isArray(route?.method) ? route.method[0] : route?.method;
  // Fastify spells a path parameter `:name`; the table is keyed the way the spec renders
  // it. Without this the 14 parameterised routes silently keep no name at all.
  const specPath = url.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
  const operationId = OPERATION_IDS[`${method} ${specPath}`];
  const errorRef = { $ref: 'ErrorResponse#' };

  return {
    ...schema,
    ...(operationId && !schema.operationId ? { operationId } : {}),
    response: {
      400: errorRef,
      500: errorRef,
      ...(schema.response ?? {}),
    },
  };
};

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
      { name: '/config', description: 'System configuration endpoints' },
      { name: '/wallet', description: 'Wallet management endpoints' },
      { name: '/tokens', description: 'Token management endpoints' },
      { name: '/pools', description: 'Pool management endpoints' },
      { name: '/chains', description: 'Chain endpoints, parameterized by chain' },
      { name: '/trading/router', description: 'Swaps routed across pools by a router connector' },
      { name: '/trading/clmm', description: 'Concentrated-liquidity pools: swaps, positions, and pool management' },
      { name: '/trading/amm', description: 'Constant-product pools: swaps, liquidity, and pool management' },
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
  transform: ({ schema, url, route }: any) => {
    try {
      const transformed = schema ? refIdentifiedSchemas(Type.Strict(schema)) : schema;
      return { schema: describeOperation(transformed, url, route), url };
    } catch (error) {
      return { schema, url };
    }
  },
  // Name components by their $id. Without this @fastify/swagger numbers them def-0,
  // def-1, ... in registration order, so every component is renamed whenever a schema
  // is added or removed — which is precisely the churn components exist to avoid.
  refResolver: {
    buildLocalReference(json: any, _baseUri: unknown, _fragment: unknown, i: number) {
      return json.$id || `def-${i}`;
    },
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
    ajv: ajvOptions,
  });

  const docsPort = ConfigManagerV2.getInstance().get('server.docsPort');

  docsServer = docsPort ? Fastify({ ajv: ajvOptions }) : null;

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
    // Publish the $id'd schemas as spec components before Swagger builds the document.
    // Routes keep their inline schemas for validation; this only gives the spec somewhere
    // for refIdentifiedSchemas to point, so a generated client gets stable, domain names.
    for (const schema of identifiedSchemas()) {
      server.addSchema(schema);
      docsServer?.addSchema(schema);
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

    // Unified trading routes: the type lives in the path, the connector is a parameter.
    app.register(tradingRouterRoutes, { prefix: '/trading/router' });
    app.register(tradingClmmRoutes, { prefix: '/trading/clmm' });
    app.register(tradingAmmRoutes, { prefix: '/trading/amm' });

    // Chain routes, parameterized by chain (/chains/:chain/...).
    app.register(chainRoutes, { prefix: '/chains' });
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
