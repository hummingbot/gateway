/* eslint-disable no-inner-declarations */
/* eslint-disable @typescript-eslint/ban-types */
import { Router, Response } from 'express';
import { asyncHandler } from '../services/error-handler';
import { MadMeerkatConfig } from './mad_meerkat/mad_meerkat.config';
import { OpenoceanConfig } from './openocean/openocean.config';
import { PangolinConfig } from './pangolin/pangolin.config';
import { QuickswapConfig } from './quickswap/quickswap.config';
import { SushiswapConfig } from './sushiswap/sushiswap.config';
import { TraderjoeConfig } from './traderjoe/traderjoe.config';
import { UniswapConfig } from './uniswap/uniswap.config';
import { VVSConfig } from './vvs/vvs.config';
import { PancakeSwapConfig } from './pancakeswap/pancakeswap.config';
import { XsswapConfig } from './xsswap/xsswap.config';
import { ConnectorsResponse } from './connectors.request';
import { TinymanConfig } from './tinyman/tinyman.config';
import { CurveConfig } from './curve/curveswap.config';
import { PlentyConfig } from './plenty/plenty.config';
import { OsmosisConfig } from '../chains/osmosis/osmosis.config';
import { CarbonConfig } from './carbon/carbon.config';
import { BalancerConfig } from './balancer/balancer.config';
import { ETCSwapConfig } from './etcswap/etcswap.config';
import { JupiterConfig } from './jupiter/jupiter.config';
import { StonfiConfig } from './ston_fi/ston_fi.config';

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
            name: 'uniswapLP',
            trading_type: UniswapConfig.config.tradingTypes('LP'),
            chain_type: UniswapConfig.config.chainType,
            available_networks: JSON.parse(
              JSON.stringify(UniswapConfig.config.availableNetworks)
            ),
            additional_spenders: ['uniswap'],
          },
          {
            name: 'jupiter',
            trading_type: JupiterConfig.config.tradingTypes,
            chain_type: JupiterConfig.config.chainType,
            available_networks: JupiterConfig.config.availableNetworks,
          },
          {
            name: 'pangolin',
            trading_type: PangolinConfig.config.tradingTypes,
            chain_type: PangolinConfig.config.chainType,
            available_networks: PangolinConfig.config.availableNetworks,
          },
          {
            name: 'openocean',
            trading_type: OpenoceanConfig.config.tradingTypes,
            chain_type: OpenoceanConfig.config.chainType,
            available_networks: OpenoceanConfig.config.availableNetworks,
          },
          {
            name: 'quickswap',
            trading_type: QuickswapConfig.config.tradingTypes,
            chain_type: QuickswapConfig.config.chainType,
            available_networks: QuickswapConfig.config.availableNetworks,
          },
          {
            name: 'sushiswap',
            trading_type: SushiswapConfig.config.tradingTypes,
            chain_type: SushiswapConfig.config.chainType,
            available_networks: SushiswapConfig.config.availableNetworks,
          },
          {
            name: 'traderjoe',
            trading_type: TraderjoeConfig.config.tradingTypes,
            chain_type: TraderjoeConfig.config.chainType,
            available_networks: TraderjoeConfig.config.availableNetworks,
          },
          {
            name: 'mad_meerkat',
            trading_type: MadMeerkatConfig.config.tradingTypes,
            chain_type: MadMeerkatConfig.config.chainType,
            available_networks: MadMeerkatConfig.config.availableNetworks,
          },
          {
            name: 'vvs',
            trading_type: VVSConfig.config.tradingTypes,
            chain_type: VVSConfig.config.chainType,
            available_networks: VVSConfig.config.availableNetworks,
          },
          {
            name: 'pancakeswap',
            trading_type: PancakeSwapConfig.config.tradingTypes('swap'),
            chain_type: PancakeSwapConfig.config.chainType,
            available_networks: PancakeSwapConfig.config.availableNetworks,
          },
          {
            name: 'pancakeswapLP',
            trading_type: PancakeSwapConfig.config.tradingTypes('LP'),
            chain_type: PancakeSwapConfig.config.chainType,
            available_networks: PancakeSwapConfig.config.availableNetworks,
            additional_spenders: ['pancakeswap'],
          },
          {
            name: 'xswap',
            trading_type: XsswapConfig.config.tradingTypes,
            chain_type: XsswapConfig.config.chainType,
            available_networks: XsswapConfig.config.availableNetworks,
          },
          {
            name: 'tinyman',
            trading_type: TinymanConfig.config.tradingTypes,
            chain_type: TinymanConfig.config.chainType,
            available_networks: TinymanConfig.config.availableNetworks,
          },
          {
            name: 'curve',
            trading_type: CurveConfig.config.tradingTypes,
            chain_type: CurveConfig.config.chainType,
            available_networks: CurveConfig.config.availableNetworks,
          },
          {
            name: 'plenty',
            trading_type: PlentyConfig.config.tradingTypes,
            chain_type: PlentyConfig.config.chainType,
            available_networks: PlentyConfig.config.availableNetworks,
          },
          {
            name: 'osmosis',
            trading_type: OsmosisConfig.config.tradingTypes('swap'),
            chain_type: OsmosisConfig.config.chainType,
            available_networks: OsmosisConfig.config.availableNetworks,
          },
          {
            name: 'carbonamm',
            trading_type: CarbonConfig.config.tradingTypes,
            chain_type: CarbonConfig.config.chainType,
            available_networks: CarbonConfig.config.availableNetworks,
          },
          {
            name: 'balancer',
            trading_type: BalancerConfig.config.tradingTypes,
            chain_type: BalancerConfig.config.chainType,
            available_networks: BalancerConfig.config.availableNetworks,
          },
          {
            name: 'etcswap',
            trading_type: ETCSwapConfig.config.tradingTypes('swap'),
            chain_type: ETCSwapConfig.config.chainType,
            available_networks: ETCSwapConfig.config.availableNetworks,
          },
          {
            name: 'etcswapLP',
            trading_type: ETCSwapConfig.config.tradingTypes('LP'),
            chain_type: ETCSwapConfig.config.chainType,
            available_networks: ETCSwapConfig.config.availableNetworks,
            additional_spenders: ['etcswap'],
          },
          {
            name: 'stonfi',
            trading_type: StonfiConfig.config.tradingTypes,
            chain_type: StonfiConfig.config.chainType,
            available_networks: StonfiConfig.config.availableNetworks,
          },
         
        ],
      });
    })
  );
}
