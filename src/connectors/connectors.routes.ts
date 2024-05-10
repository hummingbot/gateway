/* eslint-disable no-inner-declarations */
/* eslint-disable @typescript-eslint/ban-types */
import {Response, Router} from 'express';
import {asyncHandler} from '../services/error-handler';
import {DefiraConfig} from './defira/defira.config';
import {DefikingdomsConfig} from './defikingdoms/defikingdoms.config';
import {MadMeerkatConfig} from './mad_meerkat/mad_meerkat.config';
import {OpenoceanConfig} from './openocean/openocean.config';
import {PangolinConfig} from './pangolin/pangolin.config';
import {PerpConfig} from './perp/perp.config';
import {QuickswapConfig} from './quickswap/quickswap.config';
import {SushiswapConfig} from './sushiswap/sushiswap.config';
import {TraderjoeConfig} from './traderjoe/traderjoe.config';
import {UniswapConfig} from './uniswap/uniswap.config';
import {VVSConfig} from './vvs/vvs.config';
import {RefConfig} from './ref/ref.config';
import {PancakeSwapConfig} from './pancakeswap/pancakeswap.config';
import {InjectiveCLOBConfig} from './injective/injective.clob.config';
import {XsswapConfig} from './xsswap/xsswap.config';
import {ConnectorsResponse} from './connectors.request';
import {DexalotCLOBConfig} from './dexalot/dexalot.clob.config';
import {ZigZagConfig} from './zigzag/zigzag.config';
import {TinymanConfig} from './tinyman/tinyman.config';
import {UbeswapConfig} from './ubeswap/ubeswap.config';
import {CurveConfig} from './curve/curve.config';

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
              JSON.stringify(UniswapConfig.config.availableNetworks),
            ),
            additional_spenders: ['uniswap'],
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
            name: 'perp',
            trading_type: PerpConfig.config.tradingTypes('perp'),
            chain_type: PerpConfig.config.chainType,
            available_networks: PerpConfig.config.availableNetworks,
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
            name: 'defikingdoms',
            trading_type: DefikingdomsConfig.config.tradingTypes,
            chain_type: DefikingdomsConfig.config.chainType,
            available_networks: DefikingdomsConfig.config.availableNetworks,
          },
          {
            name: 'defira',
            trading_type: DefiraConfig.config.tradingTypes,
            chain_type: DefiraConfig.config.chainType,
            available_networks: DefiraConfig.config.availableNetworks,
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
            name: 'ref',
            trading_type: RefConfig.config.tradingTypes,
            chain_type: RefConfig.config.chainType,
            available_networks: RefConfig.config.availableNetworks,
          },
          {
            name: 'pancakeswap',
            trading_type: PancakeSwapConfig.config.tradingTypes,
            chain_type: PancakeSwapConfig.config.chainType,
            available_networks: PancakeSwapConfig.config.availableNetworks,
          },
          {
            name: 'injective',
            trading_type: InjectiveCLOBConfig.config.tradingTypes('spot'),
            chain_type: InjectiveCLOBConfig.config.chainType,
            available_networks: InjectiveCLOBConfig.config.availableNetworks,
            additional_add_wallet_prompts: {
              accountId:
                'Enter your injective sub account id wallet key (input 0 if unsure) >>> ',
            },
          },
          {
            name: 'injective_perpetual',
            trading_type: InjectiveCLOBConfig.config.tradingTypes('perp'),
            chain_type: InjectiveCLOBConfig.config.chainType,
            available_networks: InjectiveCLOBConfig.config.availableNetworks,
            additional_add_wallet_prompts: {
              accountId:
                'Enter your injective sub account id wallet key (input 0 if unsure) >>> ',
            },
          },
          {
            name: 'xswap',
            trading_type: XsswapConfig.config.tradingTypes,
            chain_type: XsswapConfig.config.chainType,
            available_networks: XsswapConfig.config.availableNetworks,
          },
          {
            name: 'dexalot',
            trading_type: DexalotCLOBConfig.config.tradingTypes('spot'),
            chain_type: DexalotCLOBConfig.config.chainType,
            available_networks: DexalotCLOBConfig.config.availableNetworks,
            additional_add_wallet_prompts: {
              api_key:
                'Enter a Dexalot API Key if you have one, otherwise hit return >>> ',
            },
          },
          {
            name: 'zigzag',
            trading_type: ZigZagConfig.config.tradingTypes,
            chain_type: ZigZagConfig.config.chainType,
            available_networks: ZigZagConfig.config.availableNetworks,
          },
          {
            name: 'tinyman',
            trading_type: TinymanConfig.config.tradingTypes,
            chain_type: TinymanConfig.config.chainType,
            available_networks: TinymanConfig.config.availableNetworks,
          },
          {
            name: 'ubeswap',
            trading_type: UbeswapConfig.config.tradingTypes,
            chain_type: UbeswapConfig.config.chainType,
            available_networks: UbeswapConfig.config.availableNetworks,
          },
          {
            name: 'curve',
            trading_type: CurveConfig.config.tradingTypes,
            chain_type: CurveConfig.config.chainType,
            available_networks: CurveConfig.config.availableNetworks,
          },
        ],
      });
    }),
  );
}
