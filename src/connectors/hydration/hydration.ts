import {Polkadot} from '../../chains/polkadot/polkadot';
import {logger} from '../../services/logger';
import {HydrationConfig} from './hydration.config';
import {
  HydrationAddLiquidityResponse,
  HydrationExecuteSwapResponse,
  HydrationPoolDetails,
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

// Add the external pool info type
interface ExternalPoolInfo {
  address: string;
  baseTokenAddress: string;
  quoteTokenAddress: string;
  feePct: number;
  price: number;
  baseTokenAmount: number;
  quoteTokenAmount: number;
  poolType: string;
  liquidity?: number;
  id: string;
}

// Add these interfaces before the Hydration class
interface OmniPoolToken {
  id: string;
  balance: {
    s: number;
    e: number;
    c: [number, number];
  };
  name: string;
  icon: string;
  symbol: string;
  decimals: number;
  hubReserves: {
    s: number;
    e: number;
    c: [number, number];
  };
  shares: {
    s: number;
    e: number;
    c: [number, number];
  };
  tradeable: number;
  cap: {
    s: number;
    e: number;
    c: [number];
  };
  protocolShares: {
    s: number;
    e: number;
    c: [number, number];
  };
  isSufficient: boolean;
  existentialDeposit: string;
  location?: any;
  meta?: Record<string, string>;
}

interface OmniPool {
  id: string;
  address: string;
  type?: string;
  poolType?: string;
  hubAssetId: string;
  maxInRatio: number;
  maxOutRatio: number;
  minTradingLimit: number;
  tokens: OmniPoolToken[];
}

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
      const tradeRouter = await this.getTradeRouter();

      const pools = await this.poolServiceGetPools(await this.getPoolService(), []);
      const poolData = pools.find((pool) => pool.address === poolAddress || pool.id == poolAddress);

      if (!poolData) {
        throw new Error(`Pool not found: ${poolAddress}`);
      }

      // Validate pool data structure
      if (!poolData.tokens || !Array.isArray(poolData.tokens) || poolData.tokens.length === 0) {
        logger.error(`Invalid pool data structure for pool ${poolAddress}: missing or invalid tokens array`);
        return null;
      }

      const isOmnipool = poolData.type?.toLowerCase().includes('omni') || 
                        (poolData as any).poolType?.toLowerCase().includes('omni');

      if (isOmnipool) {
        const omniPool = poolData as unknown as OmniPool;
        
        // Validate omnipool structure
        if (!omniPool.hubAssetId || !omniPool.tokens || omniPool.tokens.length === 0) {
          logger.error(`Invalid omnipool structure for pool ${poolAddress}`);
          return null;
        }

        // For omnipools, we need to handle the hub asset and multiple tokens
        const hubAsset = omniPool.tokens.find(token => token.id === omniPool.hubAssetId);
        if (!hubAsset) {
          logger.error(`Hub asset not found in omnipool ${poolAddress}`);
          return null;
        }

        // Get the first non-hub token as base token for display purposes
        const baseToken = omniPool.tokens.find(token => token.id !== omniPool.hubAssetId);
        if (!baseToken) {
          logger.error(`No base token found in omnipool ${poolAddress}`);
          return null;
        }

        // Calculate total liquidity and reserves
        let totalLiquidity = 0;
        let totalHubReserves = 0;
        let totalTokenReserves = 0;

        omniPool.tokens.forEach(token => {
          if (token.id !== omniPool.hubAssetId) {
            try {
              const tokenBalance = BigNumber(token.balance.c[0].toString())
                .times(BigNumber(10).pow(token.balance.e))
                .plus(BigNumber(token.balance.c[1].toString()))
                .div(BigNumber(10).pow(token.decimals))
                .toNumber();
              
              const hubReserves = BigNumber(token.hubReserves.c[0].toString())
                .times(BigNumber(10).pow(token.hubReserves.e))
                .plus(BigNumber(token.hubReserves.c[1].toString()))
                .div(BigNumber(10).pow(hubAsset.decimals))
                .toNumber();

              totalTokenReserves += tokenBalance;
              totalHubReserves += hubReserves;
              totalLiquidity += Math.sqrt(tokenBalance * hubReserves);
            } catch (error) {
              logger.warn(`Error calculating reserves for token ${token.id} in omnipool ${poolAddress}: ${error.message}`);
            }
          }
        });

        // Calculate average price
        const avgPrice = totalHubReserves > 0 ? totalTokenReserves / totalHubReserves : 1;

        const internalPool: HydrationPoolDetails = {
          id: omniPool.id,
          poolAddress,
          baseToken: {
            address: baseToken.id,
            symbol: baseToken.symbol,
            decimals: baseToken.decimals,
            name: baseToken.name,
            chainId: 0 // Omnipool is on the same chain
          },
          quoteToken: {
            address: hubAsset.id,
            symbol: hubAsset.symbol,
            decimals: hubAsset.decimals,
            name: hubAsset.name,
            chainId: 0
          },
          fee: 500, // Default fee for omnipool
          liquidity: totalLiquidity,
          sqrtPrice: '1000', // Not applicable for omnipool
          tick: 0, // Not applicable for omnipool
          price: avgPrice,
          volume24h: 0, // Not tracked for omnipool
          volumeWeek: 0, // Not tracked for omnipool
          tvl: totalLiquidity,
          feesUSD24h: 0, // Not tracked for omnipool
          apr: 0, // Not tracked for omnipool
          type: POOL_TYPE.OMNIPOOL,
          baseTokenAmount: totalTokenReserves,
          quoteTokenAmount: totalHubReserves
        };

        const externalPool = this.toExternalPoolInfo(internalPool, poolAddress);
        logger.debug('Omnipool info retrieved successfully');
        return externalPool;
      } else {
        // Handle regular pools
        if (poolData.tokens.length < 2) {
          logger.error(`Invalid pool structure for regular pool ${poolAddress}: insufficient tokens`);
          return null;
        }

        const baseToken = this.polkadot.getToken(poolData.tokens[0].symbol);
        const quoteToken = this.polkadot.getToken(poolData.tokens[1].symbol);

        if (!baseToken || !quoteToken) {
          logger.error(`Failed to retrieve token information for pool ${poolAddress}`);
          return null;
        }

        const poolDataAny = poolData as any;
        let baseTokenAmount = 0;
        let quoteTokenAmount = 0;
        let poolPrice = 0;

        try {
          if (poolData.tokens[0].balance && poolData.tokens[1].balance) {
            const baseAmount = Number(
                BigNumber(poolData.tokens[0].balance.toString())
                    .div(BigNumber(10).pow(baseToken.decimals))
                    .toFixed(baseToken.decimals)
            );

            const quoteAmount = Number(
                BigNumber(poolData.tokens[1].balance.toString())
                    .div(BigNumber(10).pow(quoteToken.decimals))
                    .toFixed(quoteToken.decimals),
            );

            baseTokenAmount = !isNaN(baseAmount) && isFinite(baseAmount) ? baseAmount : 0;
            quoteTokenAmount = !isNaN(quoteAmount) && isFinite(quoteAmount) ? quoteAmount : 0;
          }

          try {
            const assets = this.getAllTokens();
            const baseTokenId = assets.find(a => a.symbol === poolData.tokens[0].symbol)?.address;
            const quoteTokenId = assets.find(a => a.symbol === poolData.tokens[1].symbol)?.address;

            if (!baseTokenId || !quoteTokenId) {
              throw new Error('Failed to find token IDs in trade router');
            }

            const amountBN = BigNumber('1');
            const buyQuote = await this.tradeRouterGetBestBuy(
                tradeRouter,
                quoteTokenId,
                baseTokenId,
                amountBN
            );
            
            const sellQuote = await this.tradeRouterGetBestSell(
                tradeRouter,
                baseTokenId,
                quoteTokenId,
                amountBN
            );

            if (buyQuote && sellQuote) {
              const buyHuman = buyQuote.toHuman();
              const sellHuman = sellQuote.toHuman();

              const buyPrice = Number(buyHuman.spotPrice);
              const sellPrice = Number(sellHuman.spotPrice);

              const midPrice = (buyPrice + sellPrice) / 2;
              poolPrice = !isNaN(midPrice) && isFinite(midPrice)
                  ? Number(midPrice.toFixed(6))
                  : 1;
            }
          } catch (priceError) {
            logger.error(`Failed to calculate pool price: ${priceError.message}`);
            if (quoteTokenAmount > 0 && baseTokenAmount > 0) {
              poolPrice = quoteTokenAmount / baseTokenAmount;
            } else {
              poolPrice = 1;
            }
          }
        } catch (error) {
          logger.error(`Error calculating token amounts: ${error.message}`);
          baseTokenAmount = 0;
          quoteTokenAmount = 0;
          poolPrice = 1;
        }

        let liquidity = 1000000;
        if (poolDataAny.liquidity) {
          const liquidityValue = typeof poolDataAny.liquidity === 'object' && 'toNumber' in poolDataAny.liquidity ?
              poolDataAny.liquidity.toNumber() : Number(poolDataAny.liquidity);
          liquidity = !isNaN(liquidityValue) && isFinite(liquidityValue) ? liquidityValue : 1000000;
        }

        const internalPool: HydrationPoolDetails = {
          id: poolData.id,
          poolAddress,
          baseToken: {
            address: baseToken.address,
            symbol: baseToken.symbol,
            decimals: baseToken.decimals,
            name: baseToken.name,
            chainId: Number(baseToken.chainId)
          },
          quoteToken: {
            address: quoteToken.address,
            symbol: quoteToken.symbol,
            decimals: quoteToken.decimals,
            name: quoteToken.name,
            chainId: Number(quoteToken.chainId)
          },
          fee: poolDataAny.fee ? Number(poolDataAny.fee) || 500 : 500,
          liquidity,
          sqrtPrice: poolDataAny.sqrtPrice ? poolDataAny.sqrtPrice.toString() : '1000',
          tick: poolDataAny.tick ? Number(poolDataAny.tick) || 0 : 0,
          price: poolPrice,
          volume24h: poolDataAny.volume24h ? Number(poolDataAny.volume24h) || 100000 : 100000,
          volumeWeek: poolDataAny.volumeWeek ? Number(poolDataAny.volumeWeek) || 500000 : 500000,
          tvl: poolDataAny.tvl ? Number(poolDataAny.tvl) || 1000000 : 1000000,
          feesUSD24h: poolDataAny.feesUSD24h ? Number(poolDataAny.feesUSD24h) || 1000 : 1000,
          apr: poolDataAny.apr ? Number(poolDataAny.apr) || 5 : 5,
          type: poolData.type || 'Unknown',
          baseTokenAmount,
          quoteTokenAmount
        };

        const externalPool = this.toExternalPoolInfo(internalPool, poolAddress);
        logger.debug('Pool info retrieved successfully');
        return externalPool;
      }
    } catch (error) {
      logger.error(`Failed to get pool info for ${poolAddress}: ${error.message}`);
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
    poolAddress: string,
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
    
    const {txHash, transaction} = await this.submitTransaction(apiPromise, tx, wallet, poolAddress);

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
   * Convert internal pool info to external format
   * @param internalPool Internal pool information
   * @param poolAddress Pool address
   * @returns External pool information
   */
  private toExternalPoolInfo(internalPool: HydrationPoolDetails, poolAddress: string): ExternalPoolInfo {
    return {
      address: poolAddress,
      baseTokenAddress: internalPool.baseToken.address,
      quoteTokenAddress: internalPool.quoteToken.address,
      feePct: internalPool.fee / 10000,
      price: internalPool.price,
      baseTokenAmount: internalPool.baseTokenAmount,
      quoteTokenAmount: internalPool.quoteTokenAmount,
      poolType: internalPool.type,
      liquidity: internalPool.liquidity,
      id: internalPool.id
    };
  }

  /**
   * Log pool information
   * @param poolInfo External pool information
   */
  private logPoolInfo(poolInfo: ExternalPoolInfo) {
    logger.debug('Pool info response:', {
      address: poolInfo.address,
      poolType: poolInfo.poolType,
      price: poolInfo.price,
      feePct: poolInfo.feePct,
      liquidity: poolInfo.liquidity
    });
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
  private async submitTransaction(api: any, tx: any, wallet: any, poolType: string): Promise<{txHash: string, transaction: any}> {
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
  private async hasSuccessEvent(api: any, events: any[], poolType: string): Promise<boolean> {
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
   * @param useOfficialTokens Whether to use official token list for resolving symbols
   * @param maxNumberOfPages Maximum number of pages to fetch
   * @returns A list of filtered pools
   */
  async listPools(
    types: string[] = [],
    tokenSymbols: string[] = [],
    tokenAddresses: string[] = [],
    useOfficialTokens: boolean = true,
    maxNumberOfPages: number = 1
  ): Promise<PoolItem[]> {
    const tradeRouter = await this.getTradeRouter();

    // Normalize input arrays
    const tokenSymbolsArray = Array.isArray(tokenSymbols) ? tokenSymbols : [tokenSymbols].filter(Boolean);
    const tokenAddressesArray = Array.isArray(tokenAddresses) ? tokenAddresses : [tokenAddresses].filter(Boolean);
    const typesArray = Array.isArray(types) ? types : [types].filter(Boolean);

    // Set filtering flags
    const hasTokenSymbols = tokenSymbolsArray.length > 0;
    const hasTokenAddresses = tokenAddressesArray.length > 0;
    const hasTokens = hasTokenSymbols || hasTokenAddresses;

    logger.info(`Listing Hydration pools with filters: ${JSON.stringify({
      types: typesArray, 
      tokenSymbols: tokenSymbolsArray, 
      tokenAddresses: tokenAddressesArray,
      useOfficialTokens,
      maxPages: maxNumberOfPages
    })}`);

    // Resolve token symbols to addresses
    const resolvedSymbolToAddress: Record<string, string> = {};
    const resolvedAddresses: string[] = [];

    if (useOfficialTokens && hasTokenSymbols) {
      const tokenList = this.getAllTokens();
      logger.debug(`Available tokens on the network: ${tokenList.map(t => t.symbol).join(', ')}`);
      
      for (const symbol of tokenSymbolsArray) {
        const upperSymbol = symbol.toUpperCase();
        
        // First check using polkadot's getToken method
        const token = this.polkadot.getToken(upperSymbol);
        if (token) {
          const resolvedAddress = token.address;
          resolvedSymbolToAddress[upperSymbol] = resolvedAddress;
          resolvedAddresses.push(resolvedAddress);
          logger.debug(`Resolved ${upperSymbol} to address ${resolvedAddress} from polkadot.getToken`);
          continue;
        }
        
        // Then check token list
        const foundToken = tokenList.find(t => t.symbol.toUpperCase() === upperSymbol);
        if (foundToken) {
          resolvedSymbolToAddress[upperSymbol] = foundToken.address;
          resolvedAddresses.push(foundToken.address);
          logger.debug(`Resolved ${upperSymbol} to address ${foundToken.address} from tokenList`);
        } else {
          // Try partial matching for stablecoins which might have network prefixes
          const possibleMatches = tokenList.filter(t => 
            t.symbol.toUpperCase().includes(upperSymbol) || 
            upperSymbol.includes(t.symbol.toUpperCase())
          );
          
          if (possibleMatches.length > 0) {
            // If multiple matches, prefer exact or closest match
            const bestMatch = possibleMatches.find(t => t.symbol.toUpperCase() === upperSymbol) || 
                            possibleMatches[0];
            
            resolvedSymbolToAddress[upperSymbol] = bestMatch.address;
            resolvedAddresses.push(bestMatch.address);
            logger.debug(`Resolved ${upperSymbol} to address ${bestMatch.address} via partial match to ${bestMatch.symbol}`);
          } else {
            logger.warn(`Could not resolve token symbol: ${symbol}`);
          }
        }
      }
    }

    // Get all pools
    let pools: PoolBase[] = [];
    const poolService = await this.getPoolService();
    pools = await this.poolServiceGetPools(poolService, []);
    logger.info(`Found ${pools.length} total pools`);

    // Log some sample pools to debug token matching
    const samplePools = pools.slice(0, 5);
    samplePools.forEach(pool => {
      logger.debug(`Sample pool: ${pool.address} with tokens: ${pool.tokens.map(t => t.symbol).join(', ')}`);
    });

    // Log if there are any known stablecoin pools
    const stablePools = pools.filter(pool => 
      pool.tokens.some(t => 
        t.symbol.toUpperCase().includes('USD') || 
        t.symbol.toUpperCase().includes('USDT') ||
        t.symbol.toUpperCase().includes('USDC')
      )
    );
    
    if (stablePools.length > 0) {
      logger.debug(`Found ${stablePools.length} pools containing stablecoins`);
      stablePools.forEach(pool => {
        logger.debug(`Stablecoin pool: ${pool.address} with tokens: ${pool.tokens.map(t => t.symbol).join(', ')}`);
      });
    }

    // Apply filters
    let filteredPools = [...pools];

    // FILTERING BY TOKEN ADDRESSES AND SYMBOLS
    // Collect all addresses to filter by (including resolved symbols)
    const allAddressesToFilterBy = [...tokenAddressesArray];
    if (hasTokenSymbols && useOfficialTokens) {
      allAddressesToFilterBy.push(...resolvedAddresses);
    }
    
    // Debug log
    if (allAddressesToFilterBy.length > 0) {
      logger.debug(`Filtering pools by addresses: ${allAddressesToFilterBy.join(', ')}`);
    }

    // Filter pools based on our criteria
    if (hasTokens) {
      const preFilterCount = filteredPools.length;
      
      // For symbol-based searching, we'll be more flexible
      if (hasTokenSymbols && tokenSymbolsArray.length === 2) {
        const symbol1 = tokenSymbolsArray[0].toUpperCase();
        const symbol2 = tokenSymbolsArray[1].toUpperCase();
        
        logger.debug(`Looking for pools with symbols ${symbol1} and ${symbol2}`);
        
        filteredPools = filteredPools.filter(pool => {
          // Get normalized pool token symbols (handle variants of the same stablecoin)
          const poolTokenSymbols = pool.tokens.map(t => t.symbol.toUpperCase());
          
          // For stablecoins, be more flexible with the matching but ensure we match the specific stablecoins
          const isStablecoinSearch = symbol1.includes('USD') || symbol2.includes('USD');
          
          if (isStablecoinSearch) {
            // For stablecoins, check for specific matches instead of general USD matching
            // Get the specific parts that identify each stablecoin
            const getSpecificStablecoinType = (symbol: string): string => {
              if (symbol.includes('USDT')) return 'USDT';
              if (symbol.includes('USDC')) return 'USDC';
              if (symbol.includes('DAI')) return 'DAI';
              if (symbol.includes('BUSD')) return 'BUSD';
              // Return the whole thing if we can't identify a specific type
              return symbol;
            };
            
            const type1 = getSpecificStablecoinType(symbol1);
            const type2 = getSpecificStablecoinType(symbol2);
            
            logger.debug(`Looking for stablecoins of types: ${type1} and ${type2}`);
            
            // Check if the pool has these specific stablecoin types
            const hasFirstType = poolTokenSymbols.some(s => s.includes(type1));
            const hasSecondType = poolTokenSymbols.some(s => s.includes(type2));
            
            if (hasFirstType && hasSecondType) {
              logger.debug(`Found stablecoin pool match: ${pool.address} with tokens ${poolTokenSymbols.join(', ')}`);
              return true;
            }
            
            return false;
          } else {
            // For regular tokens, use exact matching
            const matches = poolTokenSymbols.includes(symbol1) && poolTokenSymbols.includes(symbol2);
            
            if (matches) {
              logger.debug(`Found exact pool match: ${pool.address} with tokens ${poolTokenSymbols.join(', ')}`);
              return true;
            }
          }
          
          return false;
        });
      } 
      // For address-based searching, continue to use exact matching
      else if (allAddressesToFilterBy.length === 2) {
        filteredPools = filteredPools.filter(pool => {
          if (pool.tokens.length !== 2) return false;
          
          const poolTokenIds = pool.tokens.map(token => token.id);
          const matches = 
            (poolTokenIds.includes(allAddressesToFilterBy[0]) && 
             poolTokenIds.includes(allAddressesToFilterBy[1]));
          
          return matches;
        });
      } 
      // For other cases (more than 2 tokens or mixed filtering)
      else {
        filteredPools = filteredPools.filter(pool => {
          const poolTokenIds = pool.tokens.map(token => token.id);
          const poolTokenSymbols = pool.tokens.map(token => token.symbol.toUpperCase());
          
          // For addresses, require all specified addresses to be in the pool
          const allAddressesFound = tokenAddressesArray.every(addr =>
            poolTokenIds.includes(addr)
          );
          
          // For symbols, be more flexible with stablecoins
          let allSymbolsFound = true;
          
          if (hasTokenSymbols) {
            allSymbolsFound = tokenSymbolsArray.every(symbol => {
              const upperSymbol = symbol.toUpperCase();
              const isStablecoin = upperSymbol.includes('USD');
              
              if (isStablecoin) {
                // More precise matching for stablecoins
                const specificType = upperSymbol.includes('USDT') ? 'USDT' : 
                                     upperSymbol.includes('USDC') ? 'USDC' :
                                     upperSymbol.includes('DAI') ? 'DAI' :
                                     upperSymbol.includes('BUSD') ? 'BUSD' :
                                     upperSymbol;
                                     
                // Look for the specific stablecoin type
                return poolTokenSymbols.some(s => s.includes(specificType));
              } else {
                // Exact matching for regular tokens
                return poolTokenSymbols.includes(upperSymbol);
              }
            });
          }
          
          return (hasTokenSymbols ? allSymbolsFound : true) && 
                 (hasTokenAddresses ? allAddressesFound : true);
        });
      }
      
      logger.debug(`Filtered from ${preFilterCount} to ${filteredPools.length} pools based on token criteria`);
    }

    // Filter by pool type if specified
    if (typesArray.length > 0) {
      const preTypeFilterCount = filteredPools.length;
      
      filteredPools = filteredPools.filter(pool =>
        pool.type && typesArray.some(type =>
          pool.type.toLowerCase().includes(type.toLowerCase())
        )
      );
      
      logger.debug(`Further filtered from ${preTypeFilterCount} to ${filteredPools.length} pools based on pool type`);
    }

    // Process each pool to gather additional information
    const poolListPromises = filteredPools.map(async (pool) => {
      try {
        const [baseToken, quoteToken] = pool.tokens;
        const baseTokenSymbol = baseToken.symbol;
        const quoteTokenSymbol = quoteToken.symbol;
        const poolAddress = pool.address;

        let baseTokenAmount = 0;
        let quoteTokenAmount = 0;
        let poolPrice = 1;

        baseTokenAmount = Number(BigNumber(baseToken.balance.toString())
            .div(BigNumber(10).pow(baseToken.decimals))
            .toFixed(baseToken.decimals));

        quoteTokenAmount = Number(BigNumber(quoteToken.balance.toString())
            .div(BigNumber(10).pow(quoteToken.decimals))
            .toFixed(quoteToken.decimals));

        // Calculate price
        try {
          const assets = this.getAllTokens();
          const baseTokenId = assets.find(a => a.symbol === baseTokenSymbol)?.address;
          const quoteTokenId = assets.find(a => a.symbol === quoteTokenSymbol)?.address;

          if (baseTokenId && quoteTokenId) {
            const amountBN = BigNumber('1');

            const buyQuote = await this.tradeRouterGetBestBuy(
              tradeRouter, 
              quoteTokenId, 
              baseTokenId, 
              amountBN
            );
            
            const sellQuote = await this.tradeRouterGetBestSell(
              tradeRouter, 
              baseTokenId, 
              quoteTokenId, 
              amountBN
            );

            const buyPrice = Number(buyQuote.toHuman().spotPrice);
            const sellPrice = Number(sellQuote.toHuman().spotPrice);
            const midPrice = (buyPrice + sellPrice) / 2;

            if (!isNaN(midPrice) && isFinite(midPrice)) {
              poolPrice = Number(midPrice.toFixed(6));
            }
          }
        } catch (priceError) {
          // Fallback: derive from ratio
          if (baseTokenAmount > 0 && quoteTokenAmount > 0) {
            poolPrice = quoteTokenAmount / baseTokenAmount;
          }
        }

        // Calculate TVL
        const tvl = baseTokenAmount * poolPrice + quoteTokenAmount;

        return {
          ...pool,
          address: pool.address,
          type: pool.type,
          tokens: [baseTokenSymbol, quoteTokenSymbol],
          tokenAddresses: [baseToken.id, quoteToken.id],
          fee: 500/10000,
          price: poolPrice,
          volume: 0,
          tvl: tvl,
          apr: 0,
        };
      } catch (error) {
        logger.error(`Error processing pool ${pool?.address}: ${error.message}`);
        return null;
      }
    });

    // Wait for all pool info to be processed
    let poolList = await Promise.all(poolListPromises);
    poolList = poolList.filter(Boolean);
    
    // Final filter to ensure only pools with the exact specified tokens are returned
    if (hasTokenSymbols && tokenSymbolsArray.length > 0) {
      const requestedSymbols = tokenSymbolsArray.map(s => s.toUpperCase());
      logger.debug(`Final filter - requested tokens: ${requestedSymbols.join(', ')}`);
      
      poolList = poolList.filter(pool => {
        // Get the pool tokens in uppercase for consistent comparison
        const poolTokens = pool.tokens.map(t => String(t).toUpperCase());
        logger.debug(`Pool ${pool.address} has tokens: ${poolTokens.join(', ')}`);
        
        if (requestedSymbols.length === 2) {
          // For two specific tokens (common case), make sure the pool has exactly these tokens
          const token1 = requestedSymbols[0];
          const token2 = requestedSymbols[1];
          
          // Special handling for stablecoins
          const isStablecoinSearch = token1.includes('USD') || token2.includes('USD');
          
          if (isStablecoinSearch) {
            // For stablecoins, check for the specific types
            const getStablecoinType = (symbol: string) => {
              if (symbol.includes('USDT')) return 'USDT';
              if (symbol.includes('USDC')) return 'USDC';
              if (symbol.includes('DAI')) return 'DAI';
              if (symbol.includes('BUSD')) return 'BUSD';
              return symbol;
            };
            
            const type1 = getStablecoinType(token1);
            const type2 = getStablecoinType(token2);
            
            const poolHasToken1 = poolTokens.some(t => t.includes(type1));
            const poolHasToken2 = poolTokens.some(t => t.includes(type2));
            
            return poolHasToken1 && poolHasToken2 && poolTokens.length === 2;
          } else {
            // For regular tokens, require exact matches
            return (
              poolTokens.includes(token1) && 
              poolTokens.includes(token2) &&
              poolTokens.length === 2 // Ensure pool has exactly two tokens
            );
          }
        } else {
          // For a single token or more than two tokens, ensure all requested tokens are in the pool
          return requestedSymbols.every(token => {
            const isStablecoin = token.includes('USD');
            
            if (isStablecoin) {
              // Special handling for stablecoins
              const stablecoinType = token.includes('USDT') ? 'USDT' : 
                                    token.includes('USDC') ? 'USDC' :
                                    token.includes('DAI') ? 'DAI' : 
                                    token.includes('BUSD') ? 'BUSD' : token;
                                    
              return poolTokens.some(t => t.includes(stablecoinType));
            }
            
            return poolTokens.includes(token);
          });
        }
      });
      
      logger.debug(`After final filtering: ${poolList.length} pools remain`);
    }
    
    logger.info(`Returning ${poolList.length} pools after filtering`);
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
    
    // Map ExternalPoolInfo to HydrationPoolInfo, adding required lpMint field
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
      }
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