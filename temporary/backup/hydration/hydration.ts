import LRUCache from 'lru-cache';
// noinspection ES6PreferShortImport
import { Polkadot } from '../../chains/polkadot/polkadot';
import { HydrationConfig } from './hydration.config';
// noinspection ES6PreferShortImport
import { getPolkadotConfiguration } from '../../chains/polkadot/polkadot.config';
import {
  BigNumber,
  PoolService,
  Trade,
  TradeRouter,
  TradeType,
} from '@galacticcouncil/sdk';
// noinspection ES6PreferShortImport
import { PriceRequest } from '../../amm/amm.requests';
// noinspection ES6PreferShortImport
import {
  HttpException,
  TOKEN_NOT_SUPPORTED_ERROR_CODE,
  TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
} from '../../services/error-handler';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { cryptoWaitReady } from '@polkadot/util-crypto';

const DEFAULT_WS_PROVIDER_URL = 'wss://rpc.hydradx.cloud';

export class Hydration {
  private static _instances: LRUCache<string, Hydration>;
  private chain: Polkadot;
  private _config: HydrationConfig.NetworkConfig;
  private _ready: boolean = false;
  private api: ApiPromise;
  private tradeRouter: TradeRouter;

  constructor(network: string) {
    this._config = HydrationConfig.config;
    this.chain = Polkadot.getInstance(network);
  }

  public static getInstance(network: string): Hydration {
    const config = getPolkadotConfiguration(network);
    if (!Hydration._instances) {
      Hydration._instances = new LRUCache<string, Hydration>({
        max: config.network.maximumLRUCacheInstances,
      });
    }
    if (!Hydration._instances.has(network)) {
      const instance = new Hydration(network);
      Hydration._instances.set(network, instance);
    }
    return Hydration._instances.get(network)!;
  }

  public async init(): Promise<void> {
    if (!this.chain.ready()) {
      await this.chain.init();
    }
    await cryptoWaitReady();
    const wsProvider = new WsProvider(DEFAULT_WS_PROVIDER_URL);
    this.api = await ApiPromise.create({ provider: wsProvider });
    const poolService = new PoolService(this.api);
    await poolService.syncRegistry();
    this.tradeRouter = new TradeRouter(poolService);
    this._ready = true;
  }

  public ready(): boolean {
    return this._ready;
  }

  public calculateTradeLimit(
    trade: Trade,
    slippagePercentage: BigNumber,
    side: TradeType,
  ): BigNumber {
    const ONE_HUNDRED = BigNumber('100');
    let amount: BigNumber;
    let slippage: BigNumber;
    let tradeLimit: BigNumber;

    if (side === TradeType.Buy) {
      // Maximum amount in.
      amount = trade.amountIn;
      slippage = amount
        .div(ONE_HUNDRED)
        .multipliedBy(slippagePercentage)
        .decimalPlaces(0, 1);
      tradeLimit = amount.plus(slippage);
    } else if (side === TradeType.Sell) {
      // Minimum amount out.
      amount = trade.amountOut;
      slippage = amount
        .div(ONE_HUNDRED)
        .multipliedBy(slippagePercentage)
        .decimalPlaces(0, 1);
      tradeLimit = amount.minus(slippage);
    } else {
      throw new Error('Invalid trade side');
    }

    console.log(
      `Trade details: amountOut=${trade.amountOut}, amountIn=${trade.amountIn}, spotPrice=${trade.spotPrice}`,
    );
    console.log(
      `Side: ${side}, Amount: ${amount.toString()}, Slippage: ${slippage.toString()}, Trade limit: ${tradeLimit.toString()}`,
    );

    return tradeLimit;
  }

  public async getAllTokens() {
    return await this.tradeRouter.getAllAssets();
  }

  public async estimateTrade(req: PriceRequest): Promise<Trade> {
    const assets = await this.tradeRouter.getAllAssets();
    const tokenIdBase = assets.find((a) => a.symbol === req.base)?.id;
    const tokenIdQuote = assets.find((a) => a.symbol === req.quote)?.id;

    if (!tokenIdBase || !tokenIdQuote) {
      throw new HttpException(
        500,
        TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
        TOKEN_NOT_SUPPORTED_ERROR_CODE,
      );
    }

    let trade: Trade;
    if (req.side === 'BUY') {
      trade = await this.tradeRouter.getBestBuy(
        tokenIdQuote,
        tokenIdBase,
        BigNumber(req.amount),
      );
    } else if (req.side === 'SELL') {
      trade = await this.tradeRouter.getBestSell(
        tokenIdBase,
        tokenIdQuote,
        BigNumber(req.amount),
      );
    } else {
      throw new HttpException(
        500,
        'Hydration.estimateTrade received an unexpected side.',
        500,
      );
    }

    return trade;
  }

  public async executeTrade(address: string, trade: Trade) {
    if (!trade) {
      console.log('No route found for the swap.');
      return { txHash: '', error: 'No route found' };
    }

    console.log(
      `Route found: ${trade.swaps.map((pool) => pool.poolAddress).join(' -> ')}`,
    );
    console.log(
      `Estimated ${trade.type === TradeType.Buy ? 'output' : 'input'} amount: ${trade.type === TradeType.Buy ? trade.amountOut : trade.amountIn}`,
    );

    const tradeLimit = this.calculateTradeLimit(
      trade,
      BigNumber(this._config.allowedSlippage),
      trade.type,
    );
    const transaction = trade.toTx(tradeLimit).get<any>();
    const keyPair = await this.chain.getAccountFromAddress(address);

    try {
      const txHash = await new Promise<string>((resolve, reject) => {
        transaction.signAndSend(keyPair, (result: any) => {
          if (result.dispatchError) {
            if (result.dispatchError.isModule) {
              const decoded = this.api.registry.findMetaError(
                result.dispatchError.asModule,
              );
              const { name } = decoded;
              console.error(`Dispatch error: ${name}`);
              reject(name);
            } else {
              console.error(
                'Unknown dispatch error:',
                result.dispatchError.toString(),
              );
              reject(result.dispatchError.toString());
            }
          } else if (result.status.isInBlock) {
            const hash = result.status.asInBlock.toString();
            console.log('Swap executed. Transaction hash:', hash);
            resolve(hash);
          }
        });
      });

      return { txHash, error: '' };
    } catch (err) {
      return { txHash: '', error: err as string };
    }
  }
}
