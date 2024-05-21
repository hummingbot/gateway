/* eslint-disable @typescript-eslint/ban-types */
import express from 'express';
import { Request, Response, NextFunction } from 'express';
import { ConfigRoutes } from './services/config/config.routes';
import { WalletRoutes } from './services/wallet/wallet.routes';
import { logger } from './services/logger';
import { addHttps } from './https';
import {
  asyncHandler,
  HttpException,
  NodeError,
  gatewayErrorMiddleware,
} from './services/error-handler';
import { ConfigManagerV2 } from './services/config-manager-v2';
import { SwaggerManager } from './services/swagger-manager';
import { ConnectorsRoutes } from './connectors/connectors.routes';
import { AmmRoutes, AmmLiquidityRoutes, PerpAmmRoutes } from './amm/amm.routes';
import { CLOBRoutes, PerpClobRoutes } from './clob/clob.routes';

import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { ChainRoutes } from './chains/chain.routes';

export const gatewayApp = express();

// parse body for application/json
gatewayApp.use(express.json());

// parse url for application/x-www-form-urlencoded
gatewayApp.use(express.urlencoded({ extended: true }));

// logging middleware
// skip logging path '/' or `/network/status`
gatewayApp.use(
  morgan('combined', {
    skip: function (req, _res) {
      return (
        req.originalUrl === '/' || req.originalUrl.includes('/network/status')
      );
    },
  })
);

// mount sub routers
gatewayApp.use('/config', ConfigRoutes.router);
gatewayApp.use('/chain', ChainRoutes.router);
gatewayApp.use('/connectors', ConnectorsRoutes.router);

gatewayApp.use('/amm', AmmRoutes.router);
gatewayApp.use('/amm/perp', PerpAmmRoutes.router);
gatewayApp.use('/amm/liquidity', AmmLiquidityRoutes.router);
gatewayApp.use('/wallet', WalletRoutes.router);
gatewayApp.use('/clob', CLOBRoutes.router);
gatewayApp.use('/clob/perp', PerpClobRoutes.router);

// a simple route to test that the server is running
gatewayApp.get('/', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

gatewayApp.post(
  '/restart',
  asyncHandler(async (_req, res) => {
    // kill the current process and trigger the exit event
    process.exit(1);
    // this is only to satisfy the compiler, it will never be called.
    res.status(200).json();
  })
);

// handle any error thrown in the gateway api route
gatewayApp.use(
  (
    err: Error | NodeError | HttpException,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    const response = gatewayErrorMiddleware(err);
    logger.error(err);
    return res.status(response.httpErrorCode).json(response);
  }
);

export const swaggerDocument = SwaggerManager.generateSwaggerJson(
  './docs/swagger/swagger.yml',
  './docs/swagger/definitions.yml',
  [
    './docs/swagger/main-routes.yml',
    './docs/swagger/connectors-routes.yml',
    './docs/swagger/clob-routes.yml',
    './docs/swagger/clob-perp-routes.yml',
    './docs/swagger/wallet-routes.yml',
    './docs/swagger/amm-routes.yml',
    './docs/swagger/amm-liquidity-routes.yml',
    './docs/swagger/chain-routes.yml',
  ]
);

export const startSwagger = async () => {
  const swaggerApp = express();
  const swaggerPort = 8080;

  logger.info(
    `⚡️ Swagger listening on port ${swaggerPort}. Read the Gateway API documentation at 127.0.0.1:${swaggerPort}`
  );

  swaggerApp.use('/', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

  await swaggerApp.listen(swaggerPort);
};

export const startGateway = async () => {
  const port = ConfigManagerV2.getInstance().get('server.port');
  const gateway_version="dev-1.28.0"
  if (!ConfigManagerV2.getInstance().get('server.id')) {
    ConfigManagerV2.getInstance().set(
      'server.id',
      Math.random().toString(16).substr(2, 14)
    );
  }
  logger.info(`Gateway Version: ${gateway_version}`); // display gateway version
  logger.info(`⚡️ Starting Gateway API on port ${port}...`);
  if (ConfigManagerV2.getInstance().get('server.unsafeDevModeWithHTTP')) {
    logger.info('Running in UNSAFE HTTP! This could expose private keys.');
    await gatewayApp.listen(port);
  } else {
    try {
      await addHttps(gatewayApp).listen(port);
      logger.info('The gateway server is secured behind HTTPS.');
    } catch (e) {
      logger.error(
        `Failed to start the server with https. Confirm that the SSL certificate files exist and are correct. Error: ${e}`
      );
      process.exit();
    }
  }

  await startSwagger();
};
