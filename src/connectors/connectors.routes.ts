/* eslint-disable no-inner-declarations */
/* eslint-disable @typescript-eslint/ban-types */
import { Router, Response } from 'express';
import { asyncHandler } from '../services/error-handler';
import { UniswapConfig } from './uniswap/uniswap.config';
import { ConnectorsResponse } from './connectors.request';
import { JupiterConfig } from './jupiter/jupiter.config';

export namespace ConnectorsRoutes {
  export const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res: Response<ConnectorsResponse, {}>) => {
      res.status(200).json({
        connectors: [
          {
            name: 'uniswap',
            trading_type: UniswapConfig.config.tradingTypes('swap'),
            chain_type: UniswapConfig.config.chainType,
            available_networks: UniswapConfig.config.availableNetworks,
          },
          {
            name: 'jupiter',
            trading_type: JupiterConfig.config.tradingTypes,
            chain_type: JupiterConfig.config.chainType,
            available_networks: JupiterConfig.config.availableNetworks,
          },
        ],
      });
    })
  );
}
