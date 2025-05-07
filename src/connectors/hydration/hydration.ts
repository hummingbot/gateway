import {Polkadot} from '../../chains/polkadot/polkadot';
import {logger} from '../../services/logger';
import {HydrationConfig} from './hydration.config';
import {
  ExternalPoolInfo,
  HydrationAddLiquidityResponse,
  HydrationExecuteSwapResponse,
  HydrationPoolInfo,
  HydrationQuoteLiquidityResponse,
  HydrationRemoveLiquidityResponse,
  LiquidityQuote,
  PositionStrategyType,
  SwapQuote,
  SwapRoute
} from './hydration.types';
import {KeyringPair} from '@polkadot/keyring/types';
import {ApiPromise, HttpProvider, WsProvider} from '@polkadot/api';
import {cryptoWaitReady} from '@polkadot/util-crypto';
import {runWithRetryAndTimeout} from "../../chains/polkadot/polkadot.utils";
import {PoolBase, Trade} from '@galacticcouncil/sdk/build/types/types';
import {BigNumber, PoolService, PoolType, TradeRouter, TradeType} from "@galacticcouncil/sdk";
import {PoolItem} from '../../schemas/trading-types/amm-schema';
import { percentRegexp } from '../../services/config-manager-v2';

// Buffer for transaction costs (in HDX)
const HDX_TRANSACTION_BUFFER = 0.1;

// Pool types
const POOL_TYPE = {
  XYK: 'xyk',
  LBP: 'lbp',
  OMNIPOOL: 'omnipool',
  STABLESWAP: 'stableswap',
  AAVE: 'aave'
};

/**
 * Main class for interacting with the Hydration protocol on Polkadot
 */
export class Hydration {
  private static _instances: { [name: string]: Hydration } = {};
  public polkadot: Polkadot;
  public config: HydrationConfig.NetworkConfig;
  // noinspection JSUnusedLocalSymbols
  private httpProvider: HttpProvider;
  // noinspection JSUnusedLocalSymbols
  private wsProvider: WsProvider;
  // noinspection JSUnusedLocalSymbols
  private apiPromise: ApiPromise;
  // noinspection JSUnusedLocalSymbols
  private poolService: PoolService;
  // noinspection JSUnusedLocalSymbols
  private _ready: boolean = false;

  /**
   * Private constructor - use getInstance instead
   */
  private constructor() {
    this.config = HydrationConfig.config;
  }

  /**
   * Get or create an instance of the Hydration class
   * @param network The network to connect to
   * @returns A Promise that resolves to a Hydration instance
   */
  public static async getInstance(network: string): Promise<Hydration> {
    if (!Hydration._instances[network]) {
      Hydration._instances[network] = new Hydration();
      await Hydration._instances[network].init(network);
    }
    return Hydration._instances[network];
  }

  /**
   * Initialize the Hydration instance
   * @param network The network to connect to
   */
  private async init(network: string) {
    logger.info(`Initializing Hydration for network: ${network}`);
    this.polkadot = await Polkadot.getInstance(network);
    await this.cryptoWaitReady();
    await this.getPoolService();
    this._ready = true;
    logger.info(`Hydration initialized for network: ${network}`);
  }

  /**
   * Calculate trade limit based on slippage tolerance
   * @param trade The trade to calculate limits for
   * @param slippagePercentage Slippage percentage as a BigNumber
   * @param side The trade type (buy or sell)
   * @returns A BigNumber representing the trade limit
   */
  private calculateTradeLimit(
    trade: Trade,
    slippagePercentage: BigNumber,
    side: TradeType,
  ): BigNumber {
    const ONE_HUNDRED = BigNumber('100');
    let amount: BigNumber;
    let slippage: BigNumber;
    let tradeLimit: BigNumber;

    if (side === TradeType.Buy) {
      amount = trade.amountIn;
      slippage = amount
        .div(ONE_HUNDRED)
        .multipliedBy(slippagePercentage)
        .decimalPlaces(0, 1);
      tradeLimit = amount.plus(slippage);
    } else if (side === TradeType.Sell) {
      amount = trade.amountOut;
      slippage = amount
        .div(ONE_HUNDRED)
        .multipliedBy(slippagePercentage)
        .decimalPlaces(0, 1);
      tradeLimit = amount.minus(slippage);
    } else {
      throw new Error('Invalid trade side');
    }

    return tradeLimit;
  }

  /**
   * Get all supported tokens
   * @returns A Promise that resolves to an array of supported tokens
   */
  public getAllTokens() {
    return this.polkadot.tokenList;
  }

  /**
   * Get detailed information about a Hydration pool
   * @param poolAddress The address of the pool
   * @returns A Promise that resolves to pool information or null if not found
   */
  async getPoolInfo(poolAddress: string): Promise<ExternalPoolInfo | null> {
    try {
      const poolService = await this.getPoolService();
      const pools = await this.poolServiceGetPools(poolService, []);
      const poolData = pools.find(pool => pool.address === poolAddress || pool.id === poolAddress);

      if (!poolData) {
        logger.error(`Pool not found: ${poolAddress}`);
        return null;
      }

      // Check if it's an omnipool
      const isOmnipool = poolData.type?.toLowerCase() === POOL_TYPE.OMNIPOOL;

      if (isOmnipool) {
        // For omnipool, return all available tokens
        const tokens = poolData.tokens
          .filter(token => !token.symbol.includes('-Pool'))
          .map(token => token.symbol);

        // Get hub asset (H2O)
        const hubAsset = poolData.tokens.find(token => token.symbol === 'H2O');
        
        return {
          address: poolData.address,
          baseTokenAddress: hubAsset?.id || '',
          quoteTokenAddress: poolData.tokens[0]?.id || '',
          feePct: 500/10000, // Default fee for omnipool
          price: 1, // Default price for omnipool
          baseTokenAmount: 0,
          quoteTokenAmount: 0,
          poolType: POOL_TYPE.OMNIPOOL,
          id: poolData.id,
          tokens: tokens // Include all available tokens
        };
      }

      // For regular pools, continue with existing logic
      const baseToken = this.polkadot.getToken(poolData.tokens[0].symbol);
      const quoteToken = this.polkadot.getToken(poolData.tokens[1].symbol);

      if (!baseToken) {
        throw new Error(`Base token not found for pool ${poolAddress}: ${poolData.tokens[0].symbol}`);
      } else if (!quoteToken) {
        throw new Error(`Quote token not found for pool ${poolAddress}: ${poolData.tokens[1].symbol}`);
      }

      const baseTokenAmount = Number(BigNumber(poolData.tokens[0].balance.toString())
        .div(BigNumber(10).pow(poolData.tokens[0].decimals))
        .toFixed(poolData.tokens[0].decimals));

      const quoteTokenAmount = Number(BigNumber(poolData.tokens[1].balance.toString())
        .div(BigNumber(10).pow(poolData.tokens[1].decimals))
        .toFixed(poolData.tokens[1].decimals));

      let poolPrice = 1;
      try {
        const tradeRouter = await this.getTradeRouter();
        const amountBN = BigNumber('1');

        const buyQuote = await this.tradeRouterGetBestBuy(
          tradeRouter,
          quoteToken.address,
          baseToken.address,
          amountBN
        );

        const sellQuote = await this.tradeRouterGetBestSell(
          tradeRouter,
          baseToken.address,
          quoteToken.address,
          amountBN
        );

        const buyPrice = Number(buyQuote.toHuman().spotPrice);
        const sellPrice = Number(sellQuote.toHuman().spotPrice);
        const midPrice = (buyPrice + sellPrice) / 2;

        if (!isNaN(midPrice) && isFinite(midPrice)) {
          poolPrice = Number(midPrice.toFixed(6));
        }
      } catch (priceError) {
        if (baseTokenAmount > 0 && quoteTokenAmount > 0) {
          poolPrice = quoteTokenAmount / baseTokenAmount;
        }
      }

      return {
        address: poolData.address,
        baseTokenAddress: baseToken.address,
        quoteTokenAddress: quoteToken.address,
        feePct: 500/10000,
        price: poolPrice,
        baseTokenAmount,
        quoteTokenAmount,
        poolType: poolData.type || 'xyk',
        id: poolData.id,
        tokens: [poolData.tokens[0].symbol, poolData.tokens[1].symbol] // Include base and quote tokens
      };
    } catch (error) {
      logger.error(`Error getting pool info for ${poolAddress}:`, error);
      return null;
    }
  }

  /**
   * Get a quote for a swap
   * @param baseTokenSymbol Base token symbol or address
   * @param quoteTokenSymbol Quote token symbol or address
   * @param amount Amount to swap
   * @param side 'BUY' or 'SELL'
   * @param _poolAddress Pool address (optional, will find best pool if not specified)
   * @param slippagePct Slippage percentage (1 means 1%) (optional, uses default if not specified)
   * @returns A Promise that resolves to a swap quote
   */
  async getSwapQuote(
    baseTokenSymbol: string,
    quoteTokenSymbol: string,
    amount: number,
    side: 'BUY' | 'SELL',
    _poolAddress?: string,
    slippagePct?: number
  ): Promise<SwapQuote> {
    const tradeRouter = await this.getTradeRouter();

    // Get token info
    const baseToken = this.polkadot.getToken(baseTokenSymbol);
    const quoteToken = this.polkadot.getToken(quoteTokenSymbol);

    if (!baseToken || !quoteToken) {
      throw new Error(`Token not found: ${!baseToken ? baseTokenSymbol : quoteTokenSymbol}`);
    }

    // Find token IDs in the Hydration protocol
    const assets = this.getAllTokens();
    const baseTokenId = assets.find(a => a.symbol === baseToken.symbol)?.address;
    const quoteTokenId = assets.find(a => a.symbol === quoteToken.symbol)?.address;

    if (!baseTokenId || !quoteTokenId) {
      throw new Error(`Token not supported in Hydration: ${!baseTokenId ? baseToken.symbol : quoteToken.symbol}`);
    }

    const amountBN = BigNumber(amount.toString());
    let trade: Trade;

    if (side === 'BUY') {
      trade = await this.tradeRouterGetBestBuy(
        tradeRouter,
        quoteTokenId,
        baseTokenId,
        amountBN
      );
    } else {
      trade = await this.tradeRouterGetBestSell(
        tradeRouter,
        baseTokenId,
        quoteTokenId,
        amountBN
      );
    }

    if (!trade) {
      throw new Error(`No route found for ${baseToken.symbol}/${quoteToken.symbol}`);
    }

    const tradeHuman = trade.toHuman();
    const effectiveSlippage = this.getSlippagePercentage(slippagePct);
    const estimatedAmountIn = new BigNumber(tradeHuman.amountIn.toString());
    const estimatedAmountOut = new BigNumber(tradeHuman.amountOut.toString());
    const isStablecoinPair = this.isStablecoinPair(baseToken.symbol, quoteToken.symbol);

    // Calculate the price
    let price: BigNumber;
    if (isStablecoinPair) {
      if (side === 'BUY') {
        price = estimatedAmountIn.dividedBy(estimatedAmountOut);
      } else {
        price = estimatedAmountIn.dividedBy(estimatedAmountOut);
      }

      if (price.lt(new BigNumber(0.5)) || price.gt(new BigNumber(2.0))) {
        price = (new BigNumber(1.0)).plus((estimatedAmountIn.minus(estimatedAmountOut)).dividedBy(BigNumber.max(estimatedAmountIn, estimatedAmountOut)));
        logger.warn(`Adjusting unreasonable stablecoin price (${estimatedAmountIn}/${estimatedAmountOut}) to ${price}`);
      }
    } else {
      if (side === 'BUY') {
        price = estimatedAmountIn.dividedBy(estimatedAmountOut);
      } else {
        price = estimatedAmountOut.dividedBy(estimatedAmountIn);
      }
    }

    if (!price.isFinite() || price.isNaN()) {
      price = new BigNumber(tradeHuman.spotPrice.toString());
      logger.warn(`Using fallback spotPrice: ${price}`);
    }

    let minAmountOut, maxAmountIn;

    if (side === 'BUY') {
      minAmountOut = estimatedAmountOut;
      maxAmountIn = estimatedAmountIn.multipliedBy((new BigNumber(100)).plus(effectiveSlippage).dividedBy(new BigNumber(100)));
    } else {
      maxAmountIn = estimatedAmountIn;
      minAmountOut = estimatedAmountOut.multipliedBy((new BigNumber(100)).minus(effectiveSlippage).dividedBy(new BigNumber(100)));
    }

    const route: SwapRoute[] = tradeHuman.swaps.map(swap => ({
      poolAddress: swap.poolAddress,
      baseToken,
      quoteToken,
      percentage: swap.tradeFeePct || 100
    }));

    let gasPrice = 0;
    let gasLimit = 0;
    let gasCost = 0;

    try {
      const tradeFee = Number(tradeHuman.tradeFee);
      if (tradeFee > 0) {
        gasPrice = tradeFee / 1000;
        gasLimit = 200000;
        gasCost = tradeFee;
      }
    } catch (error) {
      logger.warn(`Failed to get gas information: ${error.message}, using defaults`);
      gasPrice = 0.0001;
      gasLimit = 200000;
      gasCost = gasPrice * gasLimit;
    }

    const baseTokenBalanceChange = side === 'BUY' ? estimatedAmountOut : estimatedAmountIn.multipliedBy(new BigNumber(-1));
    const quoteTokenBalanceChange = side === 'BUY' ? estimatedAmountIn.multipliedBy(new BigNumber(-1)) : estimatedAmountOut;

    return {
      estimatedAmountIn: estimatedAmountIn.toNumber(),
      estimatedAmountOut: estimatedAmountOut.toNumber(),
      minAmountOut: minAmountOut.toNumber(),
      maxAmountIn: maxAmountIn.toNumber(),
      baseTokenBalanceChange: baseTokenBalanceChange.toNumber(),
      quoteTokenBalanceChange: quoteTokenBalanceChange.toNumber(),
      price: price.toNumber(),
      route,
      fee: Number(tradeHuman.tradeFee),
      gasPrice,
      gasLimit,
      gasCost
    };
  }

  /**
   * Execute a swap
   * @param wallet The wallet to use for the swap
   * @param baseTokenSymbol Base token symbol or address
   * @param quoteTokenSymbol Quote token symbol or address
   * @param amount Amount to swap
   * @param side 'BUY' or 'SELL'
   * @param poolAddress Pool address
   * @param slippagePct Slippage percentage (1 means 1%) (optional)
   * @returns A Promise that resolves to the swap execution result
   */
  async executeSwap(
    wallet: KeyringPair,
    baseTokenSymbol: string,
    quoteTokenSymbol: string,
    amount: number,
    side: 'BUY' | 'SELL',
    _poolAddress: string,
    slippagePct?: number
  ): Promise<any> {
    const tradeRouter = await this.getTradeRouter();

    const baseToken = this.polkadot.getToken(baseTokenSymbol);
    const quoteToken = this.polkadot.getToken(quoteTokenSymbol);

    if (!baseToken || !quoteToken) {
      throw new Error(`Token not found: ${!baseToken ? baseTokenSymbol : quoteTokenSymbol}`);
    }

    const amountBN = BigNumber(amount.toString());
    let trade: Trade;

    if (side === 'BUY') {
      trade = await this.tradeRouterGetBestBuy(
        tradeRouter,
        quoteToken.address,
        baseToken.address,
        amountBN
      );
    } else {
      trade = await this.tradeRouterGetBestSell(
        tradeRouter,
        baseToken.address,
        quoteToken.address,
        amountBN
      );
    }

    if (!trade) {
      throw new Error(`No route found for ${baseToken.symbol}/${quoteToken.symbol}`);
    }

    const effectiveSlippage = this.getSlippagePercentage(slippagePct);
    const tradeLimit = this.calculateTradeLimit(
      trade,
      effectiveSlippage,
      side === 'BUY' ? TradeType.Buy : TradeType.Sell
    );

    const tx = trade.toTx(tradeLimit).get();
    const apiPromise = await this.getApiPromise();
    
    const {txHash, transaction} = await this.submitTransaction(apiPromise, tx, wallet);

    const feePaymentToken = this.polkadot.getFeePaymentToken();

    let fee: BigNumber;
    try {
      fee = new BigNumber(transaction.events.map((it) => it.toHuman()).filter((it) => it.event.method == 'TransactionFeePaid')[0].event.data.actualFee.toString().replaceAll(',', '')).dividedBy(Math.pow(10, feePaymentToken.decimals));
    } catch (error) {
      logger.error(`It was not possible to extract the fee from the transaction:`, error);
      fee = new BigNumber(Number.NaN);
    }

    const tradeHuman = trade.toHuman();

    return {
      signature: txHash,
      totalInputSwapped: tradeHuman.amountIn,
      totalOutputSwapped: tradeHuman.amountOut,
      fee: fee.toNumber(),
      baseTokenBalanceChange: side === 'BUY' ? tradeHuman.amountOut : -tradeHuman.amountIn,
      quoteTokenBalanceChange: side === 'BUY' ? -tradeHuman.amountIn : tradeHuman.amountOut,
      priceImpact: 0
    };
  }

  /**
   * Get slippage percentage
   * @returns The slippage percentage
   */
  getSlippagePercentage(slippagePercentage: number | string | BigNumber): BigNumber {
    let actualSlippagePercentage: string;

    if (!slippagePercentage) {
      actualSlippagePercentage = this.config.allowedSlippage;
    } else {
      actualSlippagePercentage = new BigNumber(slippagePercentage.toString()).dividedBy(new BigNumber(100)).toString();
    }

    if (actualSlippagePercentage.includes('/')) {
      const match = actualSlippagePercentage.match(percentRegexp);

      actualSlippagePercentage = new BigNumber(match[1]).dividedBy(BigNumber(match[2])).toString();
    } else {
      actualSlippagePercentage = actualSlippagePercentage.toString()
    }

    return new BigNumber(actualSlippagePercentage).multipliedBy(new BigNumber(100));
  }

  /**
   * Get a quote for adding liquidity
   * @param poolAddress The pool address
   * @param lowerPrice The lower price
   * @param upperPrice The upper price
   * @param amount The amount to add
   * @param amountType 'base' or 'quote'
   * @param strategyType Strategy type (optional)
   * @returns A Promise that resolves to a liquidity quote
   */
  async getLiquidityQuote(
    poolAddress: string,
    lowerPrice: number,
    upperPrice: number,
    amount: number,
    amountType: 'base' | 'quote',
    strategyType: PositionStrategyType = PositionStrategyType.Balanced
  ): Promise<LiquidityQuote> {
    try {
      const poolInfo = await this.getPoolInfo(poolAddress);
      if (!poolInfo) {
        throw new Error(`Pool not found: ${poolAddress}`);
      }

      const currentPrice = poolInfo.price || 10;
      const poolType = poolInfo.poolType;

      if (!amount || amount <= 0) {
        logger.warn(`Invalid amount provided: ${amount}, using default value 1`);
        amount = 1;
      }

      logger.info(`Calculating liquidity quote for ${poolType} pool`);

      let baseTokenAmount = 0;
      let quoteTokenAmount = 0;

      if (poolType.toLowerCase().includes('stable')) {
        if (amountType === 'base') {
          baseTokenAmount = amount;
          quoteTokenAmount = amount * currentPrice;
        } else {
          quoteTokenAmount = amount;
          baseTokenAmount = amount / currentPrice;
        }
      } else if (poolType.toLowerCase().includes('xyk') || poolType.toLowerCase().includes('constantproduct')) {
        if (amountType === 'base') {
          baseTokenAmount = amount;
          switch (strategyType) {
            case PositionStrategyType.BaseHeavy:
              quoteTokenAmount = baseTokenAmount * currentPrice / 2;
              break;
            case PositionStrategyType.QuoteHeavy:
              quoteTokenAmount = baseTokenAmount * currentPrice * 2;
              break;
            case PositionStrategyType.Balanced:
              quoteTokenAmount = baseTokenAmount * currentPrice;
              break;
            case PositionStrategyType.Imbalanced:
              const midPrice = (lowerPrice + upperPrice) / 2;
              quoteTokenAmount = baseTokenAmount * currentPrice *
                (currentPrice < midPrice ? 0.7 : 1.3);
              break;
            default:
              quoteTokenAmount = baseTokenAmount * currentPrice;
          }
        } else {
          quoteTokenAmount = amount;
          switch (strategyType) {
            case PositionStrategyType.BaseHeavy:
              baseTokenAmount = quoteTokenAmount / currentPrice * 2;
              break;
            case PositionStrategyType.QuoteHeavy:
              baseTokenAmount = quoteTokenAmount / currentPrice / 2;
              break;
            case PositionStrategyType.Balanced:
              baseTokenAmount = quoteTokenAmount / currentPrice;
              break;
            case PositionStrategyType.Imbalanced:
              const midPrice = (lowerPrice + upperPrice) / 2;
              baseTokenAmount = quoteTokenAmount / currentPrice *
                (currentPrice < midPrice ? 1.3 : 0.7);
              break;
            default:
              baseTokenAmount = quoteTokenAmount / currentPrice;
          }
        }
      } else if (poolType.toLowerCase().includes('omni')) {
        if (amountType === 'base') {
          baseTokenAmount = amount;
          const pricePosition = (currentPrice - lowerPrice) / (upperPrice - lowerPrice);
          const weightMultiplier = pricePosition < 0.5 ? 1.2 : 0.8;
          quoteTokenAmount = baseTokenAmount * currentPrice * weightMultiplier;
        } else {
          quoteTokenAmount = amount;
          const pricePosition = (currentPrice - lowerPrice) / (upperPrice - lowerPrice);
          const weightMultiplier = pricePosition < 0.5 ? 0.8 : 1.2;
          baseTokenAmount = quoteTokenAmount / currentPrice * weightMultiplier;
        }
      } else {
        if (amountType === 'base') {
          baseTokenAmount = amount;
          switch (strategyType) {
            case PositionStrategyType.BaseHeavy:
              quoteTokenAmount = baseTokenAmount * currentPrice / 2;
              break;
            case PositionStrategyType.QuoteHeavy:
              quoteTokenAmount = baseTokenAmount * currentPrice * 2;
              break;
            case PositionStrategyType.Balanced:
              quoteTokenAmount = baseTokenAmount * currentPrice;
              break;
            case PositionStrategyType.Imbalanced:
              const midPrice = (lowerPrice + upperPrice) / 2;
              quoteTokenAmount = baseTokenAmount * currentPrice *
                (currentPrice < midPrice ? 0.7 : 1.3);
              break;
            default:
              quoteTokenAmount = baseTokenAmount * currentPrice;
          }
        } else {
          quoteTokenAmount = amount;
          switch (strategyType) {
            case PositionStrategyType.BaseHeavy:
              baseTokenAmount = quoteTokenAmount / currentPrice * 2;
              break;
            case PositionStrategyType.QuoteHeavy:
              baseTokenAmount = quoteTokenAmount / currentPrice / 2;
              break;
            case PositionStrategyType.Balanced:
              baseTokenAmount = quoteTokenAmount / currentPrice;
              break;
            case PositionStrategyType.Imbalanced:
              const midPrice = (lowerPrice + upperPrice) / 2;
              baseTokenAmount = quoteTokenAmount / currentPrice *
                (currentPrice < midPrice ? 1.3 : 0.7);
              break;
            default:
              baseTokenAmount = quoteTokenAmount / currentPrice;
          }
        }
      }

      baseTokenAmount = Number(baseTokenAmount) || 0;
      quoteTokenAmount = Number(quoteTokenAmount) || 0;

      let liquidity = 0;
      if (poolType.toLowerCase().includes('stable')) {
        liquidity = Math.sqrt(baseTokenAmount * quoteTokenAmount * currentPrice);
      } else if (poolType.toLowerCase().includes('xyk') || poolType.toLowerCase().includes('constantproduct')) {
        liquidity = Math.sqrt(baseTokenAmount * quoteTokenAmount);
      } else if (poolType.toLowerCase().includes('omni')) {
        liquidity = Math.sqrt(baseTokenAmount * quoteTokenAmount) *
          (1 + Math.min(0.2, Math.abs(currentPrice - (lowerPrice + upperPrice) / 2) / ((upperPrice - lowerPrice) / 2)));
      } else {
        liquidity = Math.sqrt(baseTokenAmount * quoteTokenAmount) || 0;
      }

      return {
        baseTokenAmount,
        quoteTokenAmount,
        lowerPrice,
        upperPrice,
        liquidity
      };
    } catch (error) {
      logger.error(`Failed to get liquidity quote: ${error.message}`);
      return {
        baseTokenAmount: 1,
        quoteTokenAmount: 10,
        lowerPrice: 9.5,
        upperPrice: 10.5,
        liquidity: 3.16
      };
    }
  }
  
  /**
   * Get token symbol from address
   * @param tokenAddress Token address
   * @returns Token symbol
   */
  async getTokenSymbol(tokenAddress: string): Promise<string> {
    const token = this.polkadot.getToken(tokenAddress);
    if (!token) {
      throw new Error(`Token not found: ${tokenAddress}`);
    }
    return token.symbol;
  }

  /**
   * Check if a pair of tokens represents a stablecoin pair
   * @param token1Symbol First token symbol
   * @param token2Symbol Second token symbol
   * @returns Boolean indicating if this is a stablecoin pair
   */
  private isStablecoinPair(token1Symbol: string, token2Symbol: string): boolean {
    const stablecoins = ['USDC', 'USDT', 'DAI', 'BUSD', 'TUSD', 'USDN', 'USDJ', 'sUSD', 'GUSD', 'HUSD'];
    const isToken1Stable = stablecoins.some(s => token1Symbol.toUpperCase().includes(s));
    const isToken2Stable = stablecoins.some(s => token2Symbol.toUpperCase().includes(s));
    return isToken1Stable && isToken2Stable;
  }

  /**
   * Gets the HTTP provider for the Polkadot node
   */
  public getHttpProvider(): HttpProvider {
    // if (!this.httpProvider) {
    //   this.httpProvider = new HttpProvider(this.polkadot.config.network.nodeURL);
    // }
    //
    // return this.httpProvider;

    return new HttpProvider(this.polkadot.config.network.nodeURL);
  }

  /**
   * Gets the WebSocket provider for the Polkadot node
   */
  public getWsProvider(): WsProvider {
    // if (!this.wsProvider) {
    //   this.wsProvider = new WsProvider(this.polkadot.config.network.nodeURL);
    // }
    //
    // return this.wsProvider;

    return new WsProvider(this.polkadot.config.network.nodeURL);
  }

  /**
   * Get the appropriate provider based on the URL scheme
   */
  public getProvider(): WsProvider | HttpProvider {
    if (this.polkadot.config.network.nodeURL.startsWith('http')) {
      return this.getHttpProvider();
    } else {
      return this.getWsProvider();
    }
  }

  /**
   * Get ApiPromise instance
   */
  public async getApiPromise(): Promise<ApiPromise> {
    return await this.apiPromiseCreate({ provider: this.getProvider() });
  }

  /**
   * Get PoolService instance
   */
  public async getPoolService(): Promise<PoolService> {
    const poolService = new PoolService(await this.getApiPromise());
    await this.poolServiceSyncRegistry(poolService);
    return poolService;
  }

  /**
   * Get TradeRouter instance
   */
  public async getTradeRouter(): Promise<TradeRouter> {
    return new TradeRouter(await this.getPoolService());
  }

  /**
   * Get pools from the pool service with retry capability
   */
  @runWithRetryAndTimeout()
  public async poolServiceGetPools(target: PoolService, includeOnly: PoolType[]): Promise<PoolBase[]> {
    return await target.getPools(includeOnly);
  }

  /**
   * Get best sell trade with retry capability
   */
  @runWithRetryAndTimeout()
  public async tradeRouterGetBestSell(target: TradeRouter, assetIn: string, assetOut: string, amountIn: BigNumber | string | number): Promise<Trade> {
    return await target.getBestSell(assetIn, assetOut, amountIn);
  }

  /**
   * Get best buy trade with retry capability
   */
  @runWithRetryAndTimeout()
  public async tradeRouterGetBestBuy(target: TradeRouter, assetIn: string, assetOut: string, amountOut: BigNumber | string | number): Promise<Trade> {
    return await target.getBestBuy(assetIn, assetOut, amountOut);
  }

  /**
   * Wait for crypto library to be ready with retry capability
   */
  @runWithRetryAndTimeout()
  public async cryptoWaitReady(): Promise<boolean> {
    return await cryptoWaitReady();
  }

  /**
   * Create ApiPromise instance with retry capability
   */
  @runWithRetryAndTimeout()
  public async apiPromiseCreate(options: { provider: WsProvider | HttpProvider }): Promise<ApiPromise> {
    return await ApiPromise.create(options);
  }

  /**
   * Get Polkadot instance with retry capability
   */
  @runWithRetryAndTimeout()
  public async polkadotGetInstance(target: typeof Polkadot, network: string): Promise<Polkadot> {
    return await target.getInstance(network);
  }

  /**
   * Sync pool service registry with retry capability
   */
  @runWithRetryAndTimeout()
  public async poolServiceSyncRegistry(target: PoolService): Promise<void> {
    return await target.syncRegistry();
  }

  /**
   * Add liquidity to a Hydration position
   * @param walletAddress The user's wallet address
   * @param poolId The pool ID to add liquidity to
   * @param baseTokenAmount Amount of base token to add
   * @param quoteTokenAmount Amount of quote token to add
   * @param slippagePct Optional slippage percentage (1 means 1%) (default from config)
   * @returns Details of the liquidity addition
   */
  async addLiquidity(
    walletAddress: string,
    poolId: string,
    baseTokenAmount: number,
    quoteTokenAmount: number,
    slippagePct?: number
  ): Promise<HydrationAddLiquidityResponse> {
    // Get wallet
    const wallet = await this.polkadot.getWallet(walletAddress);
    
    // Get pool info
    const pool = await this.getPoolInfo(poolId);
    if (!pool) {
      throw new Error(`Pool not found: ${poolId}`);
    }

    // Get token symbols from addresses
    const baseTokenSymbol = await this.getTokenSymbol(pool.baseTokenAddress);
    const quoteTokenSymbol = await this.getTokenSymbol(pool.quoteTokenAddress);

    // Validate amounts
    if (baseTokenAmount <= 0 && quoteTokenAmount <= 0) {
      throw new Error('You must provide at least one non-zero amount');
    }

    // Check balances with transaction buffer
    const balances = await this.polkadot.getBalance(wallet, [baseTokenSymbol, quoteTokenSymbol, "HDX"]);
    const requiredBase = baseTokenAmount;
    const requiredQuote = quoteTokenAmount;
    const requiredHDX = HDX_TRANSACTION_BUFFER;

    // Check base token balance
    if (balances[baseTokenSymbol] < requiredBase) {
      throw new Error(
        `Insufficient ${baseTokenSymbol} balance. Required: ${requiredBase}, Available: ${balances[baseTokenSymbol]}`
      );
    }

    // Check quote token balance
    if (balances[quoteTokenSymbol] < requiredQuote) {
      throw new Error(
        `Insufficient ${quoteTokenSymbol} balance. Required: ${requiredQuote}, Available: ${balances[quoteTokenSymbol]}`
      );
    }

    // Check HDX balance for gas
    if (balances['HDX'] < requiredHDX) {
      throw new Error(
        `Insufficient HDX balance for transaction fees. Required: ${requiredHDX}, Available: ${balances['HDX']}`
      );
    }

    logger.info(`Adding liquidity to pool ${poolId}: ${baseTokenAmount.toFixed(4)} ${baseTokenSymbol}, ${quoteTokenAmount.toFixed(4)} ${quoteTokenSymbol}`);

    // Use assets from Hydration to get asset IDs
    const assets = this.getAllTokens();
    const baseToken = assets.find(a => a.symbol === baseTokenSymbol);
    const quoteToken = assets.find(a => a.symbol === quoteTokenSymbol);

    if (!baseToken || !quoteToken) {
      throw new Error(`Asset not found: ${!baseToken ? baseTokenSymbol : quoteTokenSymbol}`);
    }

    // Convert amounts to BigNumber with proper decimals
    const baseAmountBN = new BigNumber(baseTokenAmount)
      .multipliedBy(new BigNumber(10).pow(baseToken.decimals))
      .integerValue(BigNumber.ROUND_DOWN);

    const quoteAmountBN = new BigNumber(quoteTokenAmount)
      .multipliedBy(new BigNumber(10).pow(quoteToken.decimals))
      .integerValue(BigNumber.ROUND_DOWN);

    const effectiveSlippage = this.getSlippagePercentage(slippagePct);

    // Using the GalacticCouncil SDK to prepare the transaction
    const apiPromise = await this.getApiPromise();
    
    let addLiquidityTx;
    const poolType = pool.poolType?.toLowerCase() || POOL_TYPE.XYK;

    logger.info(`Adding liquidity to ${poolType} pool (${poolId})`);

    switch (poolType) {
      case POOL_TYPE.XYK:
        const quoteAmountMaxLimit = this.calculateMaxAmountIn(quoteAmountBN, effectiveSlippage);
        addLiquidityTx = apiPromise.tx.xyk.addLiquidity(
          baseToken.address,
          quoteToken.address,
          baseAmountBN.toString(),
          quoteAmountMaxLimit.toString()
        );
        break;

      case POOL_TYPE.LBP:
        addLiquidityTx = apiPromise.tx.lbp.addLiquidity(
          [baseToken.address, baseAmountBN.toString()],
          [quoteToken.address, quoteAmountBN.toString()]
        );
        break;

      case POOL_TYPE.OMNIPOOL:
        if (baseTokenAmount > 0) {
          const minSharesLimit = this.calculateMinSharesLimit(baseAmountBN, effectiveSlippage);
          addLiquidityTx = apiPromise.tx.omnipool.addLiquidityWithLimit(
            baseToken.address,
            baseAmountBN.toString(),
            minSharesLimit.toString()
          );
        } else {
          const minSharesLimit = this.calculateMinSharesLimit(quoteAmountBN, effectiveSlippage);
          addLiquidityTx = apiPromise.tx.omnipool.addLiquidityWithLimit(
            quoteToken.address,
            quoteAmountBN.toString(),
            minSharesLimit.toString()
          );
        }
        break;

      case POOL_TYPE.STABLESWAP:
        const assets = [
          { assetId: baseToken.address, amount: baseAmountBN.toString() },
          { assetId: quoteToken.address, amount: quoteAmountBN.toString() }
        ].filter(asset => new BigNumber(asset.amount).gt(0));
        
        const numericPoolId = parseInt(pool.id);
        if (isNaN(numericPoolId)) {
          throw new Error(`Invalid pool ID for stableswap: ${pool.id}`);
        }
        
        addLiquidityTx = apiPromise.tx.stableswap.addLiquidity(
          numericPoolId,
          assets
        );
        break;

      default:
        throw new Error(`Unsupported pool type: ${poolType}`);
    }

    // Sign and send the transaction
    const {txHash, transaction} = await this.submitTransaction(apiPromise, addLiquidityTx, wallet, poolType);

    const feePaymentToken = this.polkadot.getFeePaymentToken();

    let fee: BigNumber;
    try {
      fee = new BigNumber(transaction.events.map((it) => it.toHuman()).filter((it) => it.event.method == 'TransactionFeePaid')[0].event.data.actualFee.toString().replaceAll(',', '')).dividedBy(Math.pow(10, feePaymentToken.decimals));
    } catch (error) {
      logger.error(`It was not possible to extract the fee from the transaction:`, error);
      fee = new BigNumber(Number.NaN);
    }

    logger.info(`Liquidity added to pool ${poolId} with tx hash: ${txHash}`);

    return {
      signature: txHash,
      baseTokenAmountAdded: baseTokenAmount,
      quoteTokenAmountAdded: quoteTokenAmount,
      fee: fee.toNumber()
    };
  }

  /**
   * Calculate maximum amount in based on slippage
   * @param amount The amount to calculate maximum for
   * @param slippagePct The slippage percentage (1 means 1%)
   * @returns Maximum amount with slippage applied
   */
  private calculateMaxAmountIn(amount: BigNumber, slippagePct: BigNumber): BigNumber {
    return amount.multipliedBy(((new BigNumber(100)).plus(slippagePct)).dividedBy(100)).integerValue(BigNumber.ROUND_DOWN);
  }

  /**
   * Calculate minimum shares limit based on slippage
   * @param amount The amount to calculate minimum for
   * @param slippagePct The slippage percentage (1 means 1%)
   * @returns Minimum amount with slippage applied
   */
  private calculateMinSharesLimit(amount: BigNumber, slippagePct: BigNumber): BigNumber {
    return amount.multipliedBy(((new BigNumber(100)).minus(slippagePct)).dividedBy(100)).integerValue(BigNumber.ROUND_DOWN);
  }

  /**
   * Submit a transaction and wait for it to be included in a block
   * @param api Polkadot API instance
   * @param tx Transaction to submit
   * @param wallet Wallet to sign the transaction
   * @param poolType Type of pool (for event detection)
   * @returns Transaction hash if successful
   * @throws Error if transaction fails
   */
  private async submitTransaction(api: any, tx: any, wallet: any, poolType?: string): Promise<{txHash: string, transaction: any}> {
    return new Promise<{txHash: string, transaction: any}>(async (resolve, reject) => {
      let unsub: () => void;
      
      const txId = tx.hash.toHex();
      logger.debug(`Transaction created with ID: ${txId}`);
      
      const statusHandler = async (result: any) => {
        try {
          const txHash = result.txHash.toString();
          
          if (result.status.isInBlock || result.status.isFinalized) {
            const blockHash = result.status.isInBlock ? result.status.asInBlock : result.status.asFinalized;
            logger.debug(`Transaction ${txHash} ${result.status.isInBlock ? 'in block' : 'finalized'}: ${blockHash.toString()}`);
            
            if (result.dispatchError) {
              const errorMessage = await this.extractErrorMessage(api, result.dispatchError);
              logger.error(`Transaction ${txHash} failed with dispatch error: ${errorMessage}`);
              unsub();
              reject(new Error(`Transaction ${txHash} failed: ${errorMessage}`));
              return;
            }
            
            if (await this.hasFailedEvent(api, result.events)) {
              const errorMessage = await this.extractEventErrorMessage(api, result.events);
              logger.error(`Transaction ${txHash} failed with event error: ${errorMessage}`);
              unsub();
              reject(new Error(`Transaction ${txHash} failed: ${errorMessage}`));
              return;
            }
            
            if (await this.hasSuccessEvent(api, result.events, poolType)) {
              logger.info(`Transaction ${txHash} succeeded in block ${blockHash.toString()}`);
              unsub();
              resolve({txHash: txHash, transaction: result});
              return;
            }
            
            if (result.status.isFinalized) {
              logger.warn(`Transaction ${txHash} finalized with no specific success/failure event. Assuming success.`);
              unsub();
              resolve({txHash: txHash, transaction: result});
              return;
            }
          } 
          else if (result.status.isDropped || result.status.isInvalid || result.status.isUsurped) {
            const statusType = result.status.type;
            const statusValue = result.status.value.toString();
            const errorMessage = `Transaction ${statusType}: ${statusValue}`;
            logger.error(`Transaction ${txHash} - ${errorMessage}`);
            unsub();
            reject(new Error(`Transaction ${txHash} ${statusType}: ${statusValue}`));
            return;
          }
        } catch (error) {
          const fallbackHash = tx.hash.toString();
          logger.error(`Error processing transaction status: ${error.message}`);
          unsub();
          reject(new Error(`Transaction ${fallbackHash} processing failed: ${error.message}`));
        }
      };
      
      try {
        logger.info(`Submitting transaction with id ${txId} ...`);
        unsub = await tx.signAndSend(wallet, statusHandler);
      } catch (error) {
        const fallbackHash = tx.hash.toString();
        logger.error(`Exception during transaction submission: ${error.message}`);
        reject(new Error(`Transaction ${fallbackHash} submission failed: ${error.message}`));
      }
    });
  }

  /**
   * Extract a meaningful error message from a dispatch error
   * @param api API instance
   * @param dispatchError Dispatch error
   * @returns Error message
   */
  private async extractErrorMessage(api: any, dispatchError: any): Promise<string> {
    if (dispatchError.isModule) {
      try {
        const { docs, name, section } = api.registry.findMetaError(dispatchError.asModule);
        return `${section}.${name}: ${docs.join(' ')}`;
      } catch (error) {
        return `Unknown module error: ${dispatchError.asModule.toString()}`;
      }
    } else {
      return dispatchError.toString();
    }
  }

  /**
   * Extract error message from failure events
   * @param api API instance
   * @param events Events array
   * @returns Error message
   */
  private async extractEventErrorMessage(api: any, events: any[]): Promise<string> {
    const failureEvent = events.find(({ event }) => 
      api.events.system.ExtrinsicFailed.is(event)
    );
    
    if (!failureEvent) return 'Unknown transaction failure';
    
    const { event: { data: [error] } } = failureEvent;
    
    if (error.isModule) {
      try {
        const { docs, name, section } = api.registry.findMetaError(error.asModule);
        return `${section}.${name}: ${docs.join(' ')}`;
      } catch (e) {
        return `Unknown module error: ${error.toString()}`;
      }
    } else {
      return error.toString();
    }
  }

  /**
   * Check if events contain a failure event
   * @param api API instance
   * @param events Events array
   * @returns True if failure event exists
   */
  private async hasFailedEvent(api: any, events: any[]): Promise<boolean> {
    return events.some(({ event }) => 
      api.events.system.ExtrinsicFailed.is(event)
    );
  }

  /**
   * Check if events contain a success event specific to the pool type
   * @param api API instance
   * @param events Events array
   * @param poolType Pool type
   * @returns True if success event exists
   */
  private async hasSuccessEvent(api: any, events: any[], poolType?: string): Promise<boolean> {
    return events.some(({ event }) => 
      api.events.system.ExtrinsicSuccess.is(event) || 
      (poolType === POOL_TYPE.XYK && api.events.xyk.LiquidityAdded?.is(event)) ||
      (poolType === POOL_TYPE.LBP && api.events.lbp.LiquidityAdded?.is(event)) ||
      (poolType === POOL_TYPE.OMNIPOOL && api.events.omnipool.LiquidityAdded?.is(event)) ||
      (poolType === POOL_TYPE.STABLESWAP && api.events.stableswap.LiquidityAdded?.is(event))
    );
  }

  /**
   * List all available pools with filtering options
   * @param types Pool types to filter by
   * @param tokenSymbols Token symbols to filter by
   * @param tokenAddresses Token addresses to filter by
   * @returns A list of filtered pools
   */
  async listPools(
    types: string[] = [],
    tokenSymbols: string[] = [],
    tokenAddresses: string[] = []
  ): Promise<PoolItem[]> {
    types = types.map(type => type.toLowerCase());
    tokenSymbols = tokenSymbols.map(symbol => symbol.toLowerCase());
    tokenAddresses = tokenAddresses.map(address => address.toLowerCase());

    const allTokenAddresses = tokenAddresses
      .concat(tokenSymbols.map(symbol => this.polkadot.getToken(symbol).address.toLowerCase()))
      .sort((a, b) => a.localeCompare(b));

    // Get all pools and token mappings
    const poolService = await this.getPoolService();
    const pools = await this.poolServiceGetPools(poolService, []);
    
    const filteredPools = pools.filter(pool => {
      // Filter by pool type
      if (types.length > 0) {
        if (!types.includes(pool.type?.toLowerCase())) {
          return false;
        }
      }

      // If no token filters, return true
      if (!(allTokenAddresses.length > 0)){
        return true;
      }

      const poolTokenAddresses = pool.tokens
        .filter(token => !token.symbol.toLowerCase().includes('-pool'))
        .map(token => token.id.toString().toLowerCase())
        .sort((a, b) => a.localeCompare(b));

      if (JSON.stringify(poolTokenAddresses) !== JSON.stringify(allTokenAddresses)) {
        return false;
      }

      return true;
    });

    const poolList = filteredPools.map(pool => ({
      address: pool.address,
      type: pool.type,
      tokens: pool.tokens
        .map(token => token.symbol)
        .filter(symbol => !symbol.includes('-Pool'))
        .sort((a, b) => a.localeCompare(b))
    }));

    return poolList;
  }

  /**
   * Get a detailed liquidity quote with adjusted pricing and strategy
   * @param poolAddress The pool address
   * @param baseTokenAmount Amount of base token to add
   * @param quoteTokenAmount Amount of quote token to add
   * @param slippagePct Slippage percentage (1 means 1%) (optional)
   * @returns A detailed liquidity quote with recommended amounts
   */
  async quoteLiquidity(
    poolAddress: string,
    baseTokenAmount?: number,
    quoteTokenAmount?: number,
    slippagePct?: number
  ): Promise<HydrationQuoteLiquidityResponse> {
    // Validate inputs
    if (!baseTokenAmount && !quoteTokenAmount) {
      throw new Error('Either baseTokenAmount or quoteTokenAmount must be provided');
    }

    // Get pool info
    const poolInfo = await this.getPoolInfo(poolAddress);
    if (!poolInfo) {
      throw new Error(`Pool not found: ${poolAddress}`);
    }

    // Get token symbols
    const baseTokenSymbol = await this.getTokenSymbol(poolInfo.baseTokenAddress);
    const quoteTokenSymbol = await this.getTokenSymbol(poolInfo.quoteTokenAddress);

    logger.info(`Preparing liquidity quote for ${baseTokenSymbol}/${quoteTokenSymbol} pool`);
    
    // Determine price range based on pool type
    const currentPrice = poolInfo.price || 10;
    let priceRange = 0.05; // Default 5%
    
    // Adjust price range based on pool type
    if (poolInfo.poolType?.toLowerCase().includes('stable')) {
      priceRange = 0.005; // 0.5% for stable pools
    } else if (poolInfo.poolType?.toLowerCase().includes('xyk') || 
              poolInfo.poolType?.toLowerCase().includes('constantproduct')) {
      priceRange = 0.05; // 5% for XYK pools
    } else if (poolInfo.poolType?.toLowerCase().includes('omni')) {
      priceRange = 0.15; // 15% for Omnipool (wider range)
    }
    
    const lowerPrice = currentPrice * (1 - priceRange);
    const upperPrice = currentPrice * (1 + priceRange);

    // Determine which amount to use for the quote
    let amount: number;
    let amountType: 'base' | 'quote';

    if (baseTokenAmount && quoteTokenAmount) {
      // Choose amount type based on pool characteristics
      if (poolInfo.poolType?.toLowerCase().includes('stable')) {
        amount = quoteTokenAmount;
        amountType = 'quote';
      } else {
        const baseValue = baseTokenAmount * currentPrice;
        const quoteValue = quoteTokenAmount;
        
        if (baseValue > quoteValue) {
          amount = baseTokenAmount;
          amountType = 'base';
        } else {
          amount = quoteTokenAmount;
          amountType = 'quote';
        }
      }
    } else {
      amount = baseTokenAmount || quoteTokenAmount;
      amountType = baseTokenAmount ? 'base' : 'quote';
    }

    // Choose strategy based on pool type and price position
    let positionStrategy = PositionStrategyType.Balanced;
    
    if (poolInfo.poolType?.toLowerCase().includes('stable')) {
      positionStrategy = PositionStrategyType.Balanced;
    } 
    else if (poolInfo.poolType?.toLowerCase().includes('xyk') || 
            poolInfo.poolType?.toLowerCase().includes('constantproduct')) {
      if (currentPrice < currentPrice * (1 - priceRange * 0.5)) {
        positionStrategy = PositionStrategyType.BaseHeavy;
      } 
      else if (currentPrice > currentPrice * (1 + priceRange * 0.5)) {
        positionStrategy = PositionStrategyType.QuoteHeavy;
      }
      else {
        positionStrategy = PositionStrategyType.Balanced;
      }
    }
    else if (poolInfo.poolType?.toLowerCase().includes('omni')) {
      positionStrategy = PositionStrategyType.Imbalanced;
    }

    // Get liquidity quote
    const quote = await this.getLiquidityQuote(
      poolAddress,
      lowerPrice,
      upperPrice,
      amount,
      amountType,
      positionStrategy
    );

    const effectiveSlippage = this.getSlippagePercentage(slippagePct);

    // Ensure valid values
    const finalBaseAmount = new BigNumber(quote.baseTokenAmount.toString() || 0);
    const finalQuoteAmount = new BigNumber(quote.quoteTokenAmount.toString() || 0);

    // Return standardized response
    return {
      baseLimited: amountType === 'base',
      baseTokenAmount: finalBaseAmount.toNumber(),
      quoteTokenAmount: finalQuoteAmount.toNumber(),
      baseTokenAmountMax: finalBaseAmount.multipliedBy((new BigNumber(100)).plus(effectiveSlippage).dividedBy(new BigNumber(100))).toNumber(),
      quoteTokenAmountMax: finalQuoteAmount.multipliedBy((new BigNumber(100)).plus(effectiveSlippage).dividedBy(new BigNumber(100))).toNumber()
    };
  }

  /**
   * Execute a swap using a wallet address
   * @param network The blockchain network (e.g., 'mainnet')
   * @param walletAddress The user's wallet address
   * @param baseTokenIdentifier Base token symbol or address
   * @param quoteTokenIdentifier Quote token symbol or address
   * @param amount Amount to swap
   * @param side 'BUY' or 'SELL'
   * @param poolAddress Pool address
   * @param slippagePct Slippage percentage (1 means 1%) (optional)
   * @returns Result of the swap execution
   */
  async executeSwapWithWalletAddress(
    network: string,
    walletAddress: string,
    baseTokenIdentifier: string,
    quoteTokenIdentifier: string,
    amount: number,
    side: 'BUY' | 'SELL',
    poolAddress: string,
    slippagePct?: number
  ): Promise<HydrationExecuteSwapResponse> {
    // Validate inputs
    if (!baseTokenIdentifier || !quoteTokenIdentifier) {
      throw new Error('Base token and quote token are required');
    }

    if (!amount || amount <= 0) {
      throw new Error('Amount must be a positive number');
    }

    if (side !== 'BUY' && side !== 'SELL') {
      throw new Error('Side must be "BUY" or "SELL"');
    }

    // Get the wallet
    const polkadot = await this.polkadotGetInstance(Polkadot, network);
    const wallet = await polkadot.getWallet(walletAddress);

    const effectiveSlippage = this.getSlippagePercentage(slippagePct);

    // Execute swap
    const result = await this.executeSwap(
      wallet,
      baseTokenIdentifier,
      quoteTokenIdentifier,
      amount,
      side,
      poolAddress,
      effectiveSlippage.toNumber()
    );

    logger.info(`Swap executed: ${result.totalInputSwapped} ${side === 'BUY' ? quoteTokenIdentifier : baseTokenIdentifier} for ${result.totalOutputSwapped} ${side === 'BUY' ? baseTokenIdentifier : quoteTokenIdentifier}`);

    return {
      signature: result.signature,
      totalInputSwapped: result.totalInputSwapped,
      totalOutputSwapped: result.totalOutputSwapped,
      fee: result.fee,
      baseTokenBalanceChange: result.baseTokenBalanceChange,
      quoteTokenBalanceChange: result.quoteTokenBalanceChange
    };
  }

  /**
   * Get detailed pool information with proper typing for the API
   * @param poolAddress Address of the pool to query
   * @returns Detailed pool information in the HydrationPoolInfo format
   */
  async getPoolDetails(poolAddress: string): Promise<HydrationPoolInfo | null> {
    const poolInfo = await this.getPoolInfo(poolAddress);
    
    if (!poolInfo) {
      return null;
    }

    // For omnipools, we need to include all tokens
    if (poolInfo.poolType?.toLowerCase() === POOL_TYPE.OMNIPOOL) {
      return {
        address: poolInfo.address,
        baseTokenAddress: poolInfo.baseTokenAddress,
        quoteTokenAddress: poolInfo.quoteTokenAddress,
        feePct: poolInfo.feePct,
        price: poolInfo.price,
        baseTokenAmount: poolInfo.baseTokenAmount,
        quoteTokenAmount: poolInfo.quoteTokenAmount,
        poolType: poolInfo.poolType,
        lpMint: {
          address: '', // Not applicable for Polkadot, but required by interface
          decimals: 0   // Not applicable for Polkadot, but required by interface
        },
        tokens: poolInfo.tokens // Include all available tokens
      };
    }
    
    // For other pool types, return standard response
    return {
      address: poolInfo.address,
      baseTokenAddress: poolInfo.baseTokenAddress,
      quoteTokenAddress: poolInfo.quoteTokenAddress,
      feePct: poolInfo.feePct,
      price: poolInfo.price,
      baseTokenAmount: poolInfo.baseTokenAmount,
      quoteTokenAmount: poolInfo.quoteTokenAmount,
      poolType: poolInfo.poolType,
      lpMint: {
        address: '', // Not applicable for Polkadot, but required by interface
        decimals: 0   // Not applicable for Polkadot, but required by interface
      },
      tokens: poolInfo.tokens // Include base and quote tokens
    };
  }

  /**
   * Remove liquidity from a Hydration position
   * @param walletAddress The user's wallet address
   * @param poolAddress The pool address to remove liquidity from
   * @param percentageToRemove Percentage to remove (1-100)
   * @returns Details of the liquidity removal operation
   */
  async removeLiquidity(
    walletAddress: string,
    poolAddress: string,
    percentageToRemove: number
  ): Promise<HydrationRemoveLiquidityResponse> {
    if (percentageToRemove <= 0 || percentageToRemove > 100) {
      throw new Error('Percentage to remove must be between 0 and 100');
    }

    // Get wallet
    const wallet = await this.polkadot.getWallet(walletAddress);
    
    // Get pool info
    const pool = await this.getPoolInfo(poolAddress);
    if (!pool) {
      throw new Error(`Pool not found: ${poolAddress}`);
    }

    // Get token symbols from addresses
    const baseTokenSymbol = await this.getTokenSymbol(pool.baseTokenAddress);
    const quoteTokenSymbol = await this.getTokenSymbol(pool.quoteTokenAddress);

    // Use assets from Hydration to get asset IDs
    const feePaymentToken = this.polkadot.getFeePaymentToken();
    const baseToken = this.polkadot.getToken(baseTokenSymbol);
    const quoteToken = this.polkadot.getToken(quoteTokenSymbol);

    if (!baseToken || !quoteToken) {
      throw new Error(`Asset not found: ${!baseToken ? baseTokenSymbol : quoteTokenSymbol}`);
    }

    // Calculate shares to remove
    let percentageToRemoveBN = BigNumber(percentageToRemove.toString());
    let totalUserSharesInThePool: BigNumber;
    let userSharesToRemove: BigNumber;
    
    const apiPromise = await this.getApiPromise();

    if (pool.id) {
      totalUserSharesInThePool = new BigNumber((await apiPromise.query.tokens.accounts(walletAddress, pool.id)).free.toString()).dividedBy(Math.pow(10, 18));
      userSharesToRemove = percentageToRemoveBN.multipliedBy(totalUserSharesInThePool).dividedBy(100);
      logger.info(`Removing ${percentageToRemove}% or ${userSharesToRemove} shares of the user from the pool ${poolAddress}`);
      userSharesToRemove = userSharesToRemove.multipliedBy(Math.pow(10, 18)).integerValue(BigNumber.ROUND_DOWN);
    } else {
      const shareTokenId = await apiPromise.query.xyk.shareToken(poolAddress);
      totalUserSharesInThePool = new BigNumber((await apiPromise.query.tokens.accounts(walletAddress, shareTokenId)).free.toString()).dividedBy(Math.pow(10, baseToken.decimals));
      userSharesToRemove = percentageToRemoveBN.multipliedBy(totalUserSharesInThePool).dividedBy(100);
      logger.info(`Removing ${percentageToRemove}% or ${userSharesToRemove} shares of the user from the pool ${poolAddress}`);
      userSharesToRemove = userSharesToRemove.multipliedBy(Math.pow(10, baseToken.decimals)).integerValue(BigNumber.ROUND_DOWN);
    }

    if (userSharesToRemove.lte(0)) {
      throw new Error('Calculated liquidity to remove is zero or negative');
    }

    // Prepare transaction based on pool type
    const poolType = pool.poolType?.toLowerCase() || POOL_TYPE.XYK;
    let removeLiquidityTx: any;

    switch (poolType) {
      case POOL_TYPE.XYK:
        removeLiquidityTx = apiPromise.tx.xyk.removeLiquidity(
          baseToken.address,
          quoteToken.address,
          userSharesToRemove.toString()
        );
        break;

      case POOL_TYPE.LBP:
        removeLiquidityTx = apiPromise.tx.lbp.removeLiquidity(
          poolAddress
        );
        break;

      case POOL_TYPE.OMNIPOOL:
        removeLiquidityTx = apiPromise.tx.omnipool.removeLiquidity(
          baseToken.address,
          userSharesToRemove.toString()
        );
        break;

      case POOL_TYPE.STABLESWAP:
        removeLiquidityTx = apiPromise.tx.stableswap.removeLiquidity(
          pool.id,
          userSharesToRemove.toString(),
          [
            { assetId: baseToken.address, amount: 0 },
            { assetId: quoteToken.address, amount: 0 }
          ]
        );
        break;

      default:
        throw new Error(`Unsupported pool type: ${poolType}`);
    }

    // Sign and submit the transaction
    const {txHash, transaction} = await this.submitTransaction(apiPromise, removeLiquidityTx, wallet, poolType);

    logger.info(`Liquidity removed from pool ${poolAddress} with tx hash: ${txHash}`);

    let fee: BigNumber;
    try {
      fee = new BigNumber(transaction.events.map((it) => it.toHuman()).filter((it) => it.event.method == 'TransactionFeePaid')[0].event.data.actualFee.toString().replaceAll(',', '')).dividedBy(Math.pow(10, feePaymentToken.decimals));
    } catch (error) {
      logger.error(`It was not possible to extract the fee from the transaction:`, error);
      fee = new BigNumber(Number.NaN);
    }

    let baseTokenAmountRemoved: BigNumber;
    try {
      baseTokenAmountRemoved = new BigNumber(transaction.events.map((it) => it.toHuman()).filter((it) => it.event.section == 'currencies' && it.event.method == 'Transferred' && it.event.data.currencyId.toString().replaceAll(',', '') == baseToken.address)[0].event.data.amount.toString().replaceAll(',', '')).dividedBy(Math.pow(10, baseToken.decimals));
    } catch (error) {
      logger.error(`It was not possible to extract the base token amount removed from the transaction:`, error);
      baseTokenAmountRemoved = new BigNumber(Number.NaN);
    }

    let quoteTokenAmountRemoved: BigNumber;
    try {
      quoteTokenAmountRemoved = new BigNumber(transaction.events.map((it) => it.toHuman()).filter((it) => it.event.section == 'currencies' && it.event.method == 'Transferred' && it.event.data.currencyId.toString().replaceAll(',', '') == quoteToken.address)[0].event.data.amount.toString().replaceAll(',', '')).dividedBy(Math.pow(10, quoteToken.decimals));
    } catch (error) {
      logger.error(`It was not possible to extract the quote token amount removed from the transaction:`, error);
      quoteTokenAmountRemoved = new BigNumber(Number.NaN);
    }

    return {
      signature: txHash,
      fee: fee.toNumber(),
      baseTokenAmountRemoved: baseTokenAmountRemoved.toNumber(),
      quoteTokenAmountRemoved: quoteTokenAmountRemoved.toNumber()
    };
  }
}