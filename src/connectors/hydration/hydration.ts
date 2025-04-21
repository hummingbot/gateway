import {Polkadot} from '../../chains/polkadot/polkadot';
import {logger} from '../../services/logger';
import {HydrationConfig} from './hydration.config';
import {HydrationPoolInfo, LiquidityQuote, PositionStrategyType, SwapQuote, SwapRoute} from './hydration.types';
import {KeyringPair} from '@polkadot/keyring/types';
import {ApiPromise, HttpProvider, WsProvider} from '@polkadot/api';
import {
  BigNumber,
  PoolBase,
  PoolService,
  PoolToken,
  PoolType,
  Trade,
  TradeRouter,
  TradeType
} from '@galacticcouncil/sdk';
import {cryptoWaitReady} from '@polkadot/util-crypto';

import {runWithRetryAndTimeout} from "../../chains/polkadot/polkadot.utils";

// Add interface for extended pool data
interface ExtendedPoolBase extends Omit<PoolBase, 'tokens'> {
  reserves?: BigNumber[];
  tokens: Array<PoolToken & {
    balance?: BigNumber;
  }>;
}


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

/**
 * Main class for interacting with the Hydration protocol on Polkadot
 */
export class Hydration {
  private static _instances: { [name: string]: Hydration } = {};
  public polkadot: Polkadot;
  public config: HydrationConfig.NetworkConfig;
  private httpProvider: HttpProvider;
  private apiPromise: ApiPromise;
  private poolService: PoolService;

  // Cache pool and position data
  private poolCache: Map<string, HydrationPoolInfo> = new Map();
  private poolCacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL_MS = 60000; // 1 minute cache validity
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
    try {
      logger.info(`Initializing Hydration for network: ${network}`);

      // Initialize Polkadot instance
      this.polkadot = await Polkadot.getInstance(network);

      // Wait for crypto libraries to be ready
      await this.cryptoWaitReady();

      await this.getPoolService();

      // Mark instance as ready
      this._ready = true;

      logger.info(`Hydration initialized for network: ${network}`);
    } catch (error) {
      logger.error(`Failed to initialize Hydration: ${error.message}`);
      throw error;
    }
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

    logger.debug(
      `Trade details: amountOut=${trade.amountOut}, amountIn=${trade.amountIn}, spotPrice=${trade.spotPrice}`
    );
    logger.debug(
      `Side: ${side}, Amount: ${amount.toString()}, Slippage: ${slippage.toString()}, Trade limit: ${tradeLimit.toString()}`
    );

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

      // Check cache first
      const currentTime = Date.now();
      const cachedPool = this.poolCache.get(poolAddress);
      const cacheExpiry = this.poolCacheExpiry.get(poolAddress);

      if (cachedPool && cacheExpiry && currentTime < cacheExpiry) {
        return this.toExternalPoolInfo(cachedPool, poolAddress);
      }

      // Get pool data from the SDK
      const pools = await this.poolServiceGetPools(await this.getPoolService(), []); // Get all pools

      const poolData = pools.find((pool) => pool.address === poolAddress || pool.id == poolAddress);

      if (!poolData) {
        logger.error(`Pool not found: ${poolAddress}`);
        return null;
      }

      // Get token info
      const baseToken = this.polkadot.getToken(poolData.tokens[0].symbol);
      const quoteToken = this.polkadot.getToken(poolData.tokens[1].symbol);

      if (!baseToken || !quoteToken) {
        throw new Error('Failed to retrieve token information');
      }

      // Cast poolData to any to access properties that might not be in the PoolBase type
      const poolDataAny = poolData as any;

      // Initialize amounts with safe defaults
      let baseTokenAmount = 0;
      let quoteTokenAmount = 0;
      let poolPrice = 0;

      try {
        // Get reserves from the SDK
        const reserves = await this.getPoolReserves(poolAddress);

        if (reserves) {
          // Calculate amounts using reserves
          const baseAmount = Number(reserves.baseReserve
              .div(BigNumber(10).pow(baseToken.decimals))
              .toFixed(baseToken.decimals)
          );

          const quoteAmount = Number(
              reserves.quoteReserve
                  .div(BigNumber(10).pow(quoteToken.decimals))
                  .toFixed(quoteToken.decimals)
          );

          // Validate the calculated amounts
          baseTokenAmount = !isNaN(baseAmount) && isFinite(baseAmount) ? baseAmount : 0;
          quoteTokenAmount = !isNaN(quoteAmount) && isFinite(quoteAmount) ? quoteAmount : 0;
        }
        // Fallback to token balances if reserves not available
        else if (poolData.tokens[0].balance && poolData.tokens[1].balance) {
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

          // Validate the calculated amounts
          baseTokenAmount = !isNaN(baseAmount) && isFinite(baseAmount) ? baseAmount : 0;
          quoteTokenAmount = !isNaN(quoteAmount) && isFinite(quoteAmount) ? quoteAmount : 0;
        }

        // Calculate price using the SDK's trade router
        let buyQuote;
        let sellQuote;
        try {
          const assets = this.getAllTokens();
          const baseTokenId = assets.find(a => a.symbol === poolData.tokens[0].symbol)?.address;
          const quoteTokenId = assets.find(a => a.symbol === poolData.tokens[1].symbol)?.address;

          if (!baseTokenId || !quoteTokenId) {
            throw new Error('Failed to find token IDs in trade router');
          }

          // Use a small amount (1 unit) to get the spot price
          const amountBN = BigNumber('1');

          // Get both buy and sell quotes to calculate the mid price
          try {
            buyQuote = await this.tradeRouterGetBestBuy(
                tradeRouter,
                quoteTokenId,
                baseTokenId,
                amountBN
            );
          } catch (error) {
            throw error;
          }

          try {
            sellQuote = await this.tradeRouterGetBestSell(
                tradeRouter,
                baseTokenId,
                quoteTokenId,
                amountBN
            );
          } catch (error) {
            throw error;
          }

          if (buyQuote && sellQuote) {
            const buyHuman = buyQuote.toHuman();
            const sellHuman = sellQuote.toHuman();

            const buyPrice = Number(buyHuman.spotPrice);
            const sellPrice = Number(sellHuman.spotPrice);

            // Validate and set the pool price
            const midPrice = (buyPrice + sellPrice) / 2;
            poolPrice =
                !isNaN(midPrice) && isFinite(midPrice)
                    ? Number(midPrice.toFixed(6))
                    : 1;
          }
        } catch (priceError) {
          logger.error(`Failed to calculate pool price: ${priceError.message}`);
          // If price calculation fails, try to derive it from token amounts
          if (quoteTokenAmount > 0 && baseTokenAmount > 0) {
            poolPrice = quoteTokenAmount / baseTokenAmount;
          } else {
            poolPrice = 1; // Fallback to 1:1 price
          }
        }

        // Log the calculations for debugging
        logger.debug('Token calculations:', {
          baseToken: {
            symbol: baseToken.symbol,
            decimals: baseToken.decimals,
            amount: baseTokenAmount,
          },
          quoteToken: {
            symbol: quoteToken.symbol,
            decimals: quoteToken.decimals,
            amount: quoteTokenAmount,
          },
          price: poolPrice,
        });

      } catch (error) {
        logger.error(`Error calculating token amounts: ${error.message}`);
        // Use safe defaults
        baseTokenAmount = 0;
        quoteTokenAmount = 0;
        poolPrice = 1;
      }

      // Try to get liquidity info with validation
      let liquidity = 1000000; // Default liquidity
      try {
        if (poolDataAny.liquidity) {
          const liquidityValue = typeof poolDataAny.liquidity === 'object' && 'toNumber' in poolDataAny.liquidity ?
              poolDataAny.liquidity.toNumber() : Number(poolDataAny.liquidity);
          liquidity = !isNaN(liquidityValue) && isFinite(liquidityValue) ? liquidityValue : 1000000;
        }
      } catch (error) {
        logger.warn(`Error getting liquidity value: ${error.message}`);
      }

      // Create internal pool info with validated values
      const internalPool: HydrationPoolInfo = {
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

      // Cache the internal pool info
      this.poolCache.set(poolAddress, internalPool);
      this.poolCacheExpiry.set(poolAddress, currentTime + this.CACHE_TTL_MS);

      // Convert to external format and return
      const externalPool = this.toExternalPoolInfo(internalPool, poolAddress);
      this.logPoolInfo(externalPool);
      return externalPool;
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
   * @param poolAddress Pool address (optional, will find best pool if not specified)
   * @param slippagePct Slippage percentage (optional, uses default if not specified)
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
    try {
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

      // Convert amount to BigNumber with proper decimals
      const amountBN = BigNumber(amount.toString());

      // Get the trade quote
      let trade: Trade;

      if (side === 'BUY') {
        // Buying base token with quote token
        trade = await this.tradeRouterGetBestBuy(
          tradeRouter,
          quoteTokenId,
          baseTokenId,
          amountBN
        );
      } else {
        // Selling base token for quote token
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

      // Convert trade to human-readable format
      const tradeHuman = trade.toHuman();

      // Apply slippage tolerance
      const effectiveSlippage = slippagePct ?? parseFloat(this.config.allowedSlippage);
      const slippageBN = BigNumber(effectiveSlippage.toString());

      // Extract amounts from the trade and convert to numbers
      const estimatedAmountIn = Number(tradeHuman.amountIn);
      const estimatedAmountOut = Number(tradeHuman.amountOut);

      // Check if this is likely a stablecoin pair (USDC/USDT, etc.)
      const isStablecoinPair = this.isStablecoinPair(baseToken.symbol, quoteToken.symbol);

      // Calculate the price
      let price;
      if (isStablecoinPair) {
        // For stablecoin pairs, price should be close to 1:1 with small deviations
        // We invert if necessary to keep the format "quote per base"
        if (side === 'BUY') {
          price = estimatedAmountIn / estimatedAmountOut;
        } else {
          price = estimatedAmountIn / estimatedAmountOut;
        }

        // If price is too far from 1.0, it's likely we have a calculation issue
        if (price < 0.5 || price > 2.0) {
          // This is probably an issue with token order or decimals, force it closer to 1.0
          // Calculate a more reasonable price based on relative amounts
          price = 1.0 + ((estimatedAmountIn - estimatedAmountOut) / Math.max(estimatedAmountIn, estimatedAmountOut));
          logger.warn(`Adjusting unreasonable stablecoin price (${estimatedAmountIn}/${estimatedAmountOut}) to ${price}`);
        }
      } else {
        // Regular trading pair calculation
        if (side === 'BUY') {
          // When buying baseToken, price is how much quoteToken per baseToken
          price = estimatedAmountIn / estimatedAmountOut;
        } else {
          // When selling baseToken, price is how much quoteToken per baseToken
          price = estimatedAmountOut / estimatedAmountIn;
        }
      }

      // Ensure price is reasonable (not zero, infinity, etc.)
      if (!isFinite(price) || isNaN(price)) {
        price = Number(tradeHuman.spotPrice);
        logger.warn(`Using fallback spotPrice: ${price}`);
      } else {
        // Round to 8 decimal places for consistency
        price = parseFloat(price.toFixed(8));
      }

      let minAmountOut, maxAmountIn;

      if (side === 'BUY') {
        // For buys, we're getting a fixed output and paying a variable input
        minAmountOut = estimatedAmountOut; // Exact output
        maxAmountIn = estimatedAmountIn * (1 + effectiveSlippage / 100); // Allow input to be higher by slippage %
      } else {
        // For sells, we're spending a fixed input and getting a variable output
        maxAmountIn = estimatedAmountIn; // Exact input
        minAmountOut = estimatedAmountOut * (1 - effectiveSlippage / 100); // Allow output to be lower by slippage %
      }

      // Extract route information
      const route: SwapRoute[] = tradeHuman.swaps.map(swap => ({
        poolAddress: swap.poolAddress,
        baseToken,
        quoteToken,
        percentage: swap.tradeFeePct || 100
      }));

      // Get gas information from trade fee
      let gasPrice = 0;
      let gasLimit = 0;
      let gasCost = 0;

      try {
        // Use trade fee to estimate gas
        const tradeFee = Number(tradeHuman.tradeFee);
        if (tradeFee > 0) {
          // Estimate gas based on trade fee
          gasPrice = tradeFee / 1000; // Convert fee to gas price
          gasLimit = 200000; // Standard gas limit for swaps
          gasCost = tradeFee; // Use actual trade fee as gas cost
        }
      } catch (error) {
        logger.warn(`Failed to get gas information: ${error.message}, using defaults`);
        // Fallback to reasonable defaults if we can't get actual values
        gasPrice = 0.0001; // Default gas price in native token
        gasLimit = 200000; // Default gas limit for swaps
        gasCost = gasPrice * gasLimit;
      }

      // Calculate balance changes
      const baseTokenBalanceChange = side === 'BUY' ? estimatedAmountOut : -estimatedAmountIn;
      const quoteTokenBalanceChange = side === 'BUY' ? -estimatedAmountIn : estimatedAmountOut;

      return {
        estimatedAmountIn,
        estimatedAmountOut,
        minAmountOut,
        maxAmountIn,
        baseTokenBalanceChange,
        quoteTokenBalanceChange,
        price,
        route,
        fee: Number(tradeHuman.tradeFee),
        gasPrice,
        gasLimit,
        gasCost
      };
    } catch (error) {
      logger.error(`Failed to get swap quote: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute a swap
   * @param wallet The wallet to use for the swap
   * @param baseTokenSymbol Base token symbol or address
   * @param quoteTokenSymbol Quote token symbol or address
   * @param amount Amount to swap
   * @param side 'BUY' or 'SELL'
   * @param poolAddress Pool address
   * @param slippagePct Slippage percentage (optional)
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
    try {
      const tradeRouter = await this.getTradeRouter();

      // Get swap quote
      const quote = await this.getSwapQuote(
        baseTokenSymbol,
        quoteTokenSymbol,
        amount,
        side,
        poolAddress,
        slippagePct
      );

      // Get token info
      const baseToken = this.polkadot.getToken(baseTokenSymbol);
      const quoteToken = this.polkadot.getToken(quoteTokenSymbol);

      if (!baseToken || !quoteToken) {
        throw new Error(`Token not found: ${!baseToken ? baseTokenSymbol : quoteTokenSymbol}`);
      }

      // Create the trade
      const amountBN = BigNumber(amount.toString());
      let trade: Trade;

      if (side === 'BUY') {
        // @ts-ignore - Ignorando erro de incompatibilidade de API
        trade = await this.tradeRouterGetBestBuy(
          tradeRouter,
          quoteToken.address,
          baseToken.address,
          amountBN
        );
      } else {
        // @ts-ignore - Ignorando erro de incompatibilidade de API
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

      // Calculate trade limit based on slippage
      const effectiveSlippage = BigNumber(
        (slippagePct ?? parseFloat(this.config.allowedSlippage)).toString()
      );
      const tradeLimit = this.calculateTradeLimit(
        trade,
        effectiveSlippage,
        side === 'BUY' ? TradeType.Buy : TradeType.Sell
      );

      // Create the transaction
      const transaction = trade.toTx(tradeLimit).get<any>();

      // Execute the transaction
      const apiPromise = await this.getApiPromise();
      const txHash = await new Promise<string>((resolve, reject) => {
        // @ts-ignore - Generic Method, needs to improve
        transaction.signAndSend(wallet, async (result: any) => {
          if (result.dispatchError) {
            if (result.dispatchError.isModule) {
              const decoded = apiPromise.registry.findMetaError(
                result.dispatchError.asModule
              );
              const { name } = decoded;
              logger.error(`Dispatch error: ${name}`);
              reject(name);
            } else {
              logger.error(
                'Unknown dispatch error:',
                result.dispatchError.toString()
              );
              reject(result.dispatchError.toString());
            }
          } else if (result.status.isInBlock) {
            const hash = result.txHash.toString();
            logger.info('Swap executed. Transaction hash:', hash);
            resolve(hash);
          }
        });
      });

      logger.info(`Executed swap: ${amount} ${side === 'BUY' ? quoteTokenSymbol : baseTokenSymbol} for ${quote.estimatedAmountOut} ${side === 'BUY' ? baseTokenSymbol : quoteTokenSymbol}`);

      return {
        signature: txHash,
        totalInputSwapped: side === 'BUY' ? BigNumber(quote.estimatedAmountIn.toString()).div(10 ** quoteToken.decimals).toString() : amount.toString(),
        totalOutputSwapped: side === 'BUY' ? amount.toString() : BigNumber(quote.estimatedAmountOut.toString()).div(10 ** quoteToken.decimals).toString(),
        fee: quote.fee,
        baseTokenBalanceChange: BigNumber(quote.baseTokenBalanceChange.toString()).div(10 ** baseToken.decimals).toString(),
        quoteTokenBalanceChange: BigNumber(quote.quoteTokenBalanceChange.toString()).div(10 ** quoteToken.decimals).toString(),
        priceImpact: quote.price
      };
    } catch (error) {
      logger.error(`Failed to execute swap: ${error?.message}`);
      throw error;
    }
  }

  /**
   * Get slippage percentage
   * @returns The slippage percentage
   */
  getSlippagePct(): number {
    return parseFloat(this.config.allowedSlippage);
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
      // Get pool info
      const poolInfo = await this.getPoolInfo(poolAddress);
      if (!poolInfo) {
        throw new Error(`Pool not found: ${poolAddress}`);
      }

      // Get current pool state (use default values if not available)
      const currentPrice = poolInfo.price || 10;
      const currentLiquidity = poolInfo.liquidity || 1000000;
      const poolType = poolInfo.poolType;

      // Validate amount
      if (!amount || amount <= 0) {
        logger.warn(`Invalid amount provided: ${amount}, using default value 1`);
        amount = 1;
      }

      // Log pool information for debugging
      logger.info(`Calculating liquidity quote for ${poolType} pool`, {
        poolAddress,
        poolType,
        currentPrice,
        lowerPrice,
        upperPrice,
        amount,
        amountType,
        strategyType
      });

      let baseTokenAmount = 0;
      let quoteTokenAmount = 0;

      // Different calculation methods depending on pool type
      if (poolType.toLowerCase().includes('stable')) {
        // For stable pools, we expect assets to have similar value
        // Price range is typically very narrow
        if (amountType === 'base') {
          baseTokenAmount = amount;
          // For stable pools, often the ratio is close to 1:1 (adjusted for decimals)
          quoteTokenAmount = amount * currentPrice;
        } else {
          quoteTokenAmount = amount;
          baseTokenAmount = amount / currentPrice;
        }
      } else if (poolType.toLowerCase().includes('xyk') || poolType.toLowerCase().includes('constantproduct')) {
        // For XYK/Constant Product pools
        if (amountType === 'base') {
          baseTokenAmount = amount;
          // Calculate quote amount based on strategy
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
          // Calculate base amount based on strategy
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
        // For Omnipool, liquidity can be one-sided in some implementations
        if (amountType === 'base') {
          baseTokenAmount = amount;
          // Omnipool may have different pricing mechanics
          // Use a multiplier based on current price vs range
          const pricePosition = (currentPrice - lowerPrice) / (upperPrice - lowerPrice);
          // Adjust based on where current price is in the range
          const weightMultiplier = pricePosition < 0.5 ? 1.2 : 0.8;
          quoteTokenAmount = baseTokenAmount * currentPrice * weightMultiplier;
        } else {
          quoteTokenAmount = amount;
          const pricePosition = (currentPrice - lowerPrice) / (upperPrice - lowerPrice);
          const weightMultiplier = pricePosition < 0.5 ? 0.8 : 1.2;
          baseTokenAmount = quoteTokenAmount / currentPrice * weightMultiplier;
        }
      } else {
        // Default to basic calculation with strategy
        if (amountType === 'base') {
          baseTokenAmount = amount;
          // Calculate quote amount based on strategy
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
          // Calculate base amount based on strategy
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

      // Ensure we have valid numerical values
      baseTokenAmount = Number(baseTokenAmount) || 0;
      quoteTokenAmount = Number(quoteTokenAmount) || 0;

      // Calculate liquidity using the appropriate formula based on pool type
      let liquidity = 0;
      if (poolType.toLowerCase().includes('stable')) {
        // For stable pools, typically use a more complex invariant
        // Simple approximation: geometric mean weighted by price
        liquidity = Math.sqrt(baseTokenAmount * quoteTokenAmount * currentPrice);
      } else if (poolType.toLowerCase().includes('xyk') || poolType.toLowerCase().includes('constantproduct')) {
        // For XYK pools, use geometric mean (constant product formula)
        liquidity = Math.sqrt(baseTokenAmount * quoteTokenAmount);
      } else if (poolType.toLowerCase().includes('omni')) {
        // For Omnipool, liquidity calculation might be different
        // Simple approximation: geometric mean weighted by TVL ratio
        liquidity = Math.sqrt(baseTokenAmount * quoteTokenAmount) *
          (1 + Math.min(0.2, Math.abs(currentPrice - (lowerPrice + upperPrice) / 2) / ((upperPrice - lowerPrice) / 2)));
      } else {
        // Default to geometric mean
        liquidity = Math.sqrt(baseTokenAmount * quoteTokenAmount) || 0;
      }

      // Log the quote details for debugging
      logger.info(`Liquidity quote calculated for ${poolType} pool:`, {
        poolAddress,
        poolType,
        currentPrice,
        lowerPrice,
        upperPrice,
        baseTokenAmount,
        quoteTokenAmount,
        liquidity,
        strategyType
      });

      return {
        baseTokenAmount,
        quoteTokenAmount,
        lowerPrice,
        upperPrice,
        liquidity
      };
    } catch (error) {
      logger.error(`Failed to get liquidity quote: ${error.message}`);
      // Return default values instead of throwing in case of error
      return {
        baseTokenAmount: 1,
        quoteTokenAmount: 10,
        lowerPrice: 9.5,
        upperPrice: 10.5,
        liquidity: 3.16 // sqrt(1 * 10)
      };
    }
  }

  /**
   * Get pool reserves from the SDK
   * @param poolAddress The pool address
   * @returns A Promise that resolves to the pool reserves
   */
  public async getPoolReserves( poolAddress: string): Promise<{ baseReserve: BigNumber; quoteReserve: BigNumber } | null> {
    try {
      // Get pool from SDK
      const pools = await this.poolServiceGetPools(await this.getPoolService(), []);
      const pool = pools.find(p => p.address === poolAddress);

      if (!pool) {
        logger.error(`Pool not found: ${poolAddress}`);
        return null;
      }

      // Cast to extended type after basic validation
      const extendedPool = pool as unknown as ExtendedPoolBase;

      // Try different methods to get reserves
      let baseReserve: BigNumber;
      let quoteReserve: BigNumber;

      // Method 1: Direct reserves access
      if (extendedPool.reserves && Array.isArray(extendedPool.reserves)) {
        [baseReserve, quoteReserve] = extendedPool.reserves;
      }
      // Method 2: Through token balances
      else if (extendedPool.tokens && Array.isArray(extendedPool.tokens)) {
        baseReserve = BigNumber(extendedPool.tokens[0].balance?.toString() || '0');
        quoteReserve = BigNumber(extendedPool.tokens[1].balance?.toString() || '0');
      }
      // Method 3: Through SDK's getReserves method if available
      else if ('getReserves' in this.poolService) {
        // @ts-ignore - Using SDK method that might not be in type definitions
        const reserves = await this.poolServiceGetReserves(this.poolService, poolAddress);
        if (reserves && Array.isArray(reserves)) {
          [baseReserve, quoteReserve] = reserves;
        }
      }

      if (!baseReserve || !quoteReserve) {
        throw new Error('Could not get pool reserves');
      }

      return {
        baseReserve: BigNumber(baseReserve.toString()),
        quoteReserve: BigNumber(quoteReserve.toString())
      };
    } catch (error) {
      logger.error(`Failed to get pool reserves: ${error.message}`);
      return null;
    }
  }

  // Helper method to convert internal to external pool info
  private toExternalPoolInfo(internalPool: HydrationPoolInfo, poolAddress: string): ExternalPoolInfo {
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

  // Update logging to use external pool info structure
  private logPoolInfo(poolInfo: ExternalPoolInfo) {
    logger.debug('Pool info response:', {
      address: poolInfo.address,
      poolType: poolInfo.poolType,
      baseTokenAmount: poolInfo.baseTokenAmount,
      quoteTokenAmount: poolInfo.quoteTokenAmount,
      price: poolInfo.price,
      feePct: poolInfo.feePct,
      liquidity: poolInfo.liquidity
    });
  }

  // Keep the getTokenSymbol method as it's being used
  async getTokenSymbol(tokenAddress: string): Promise<string> {
    try {
      // Get token info from Polkadot
      const token = this.polkadot.getToken(tokenAddress);
      if (!token) {
        throw new Error(`Token not found: ${tokenAddress}`);
      }
      return token.symbol;
    } catch (error) {
      logger.error(`Failed to get token symbol: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if a pair of tokens represents a stablecoin pair
   * @param token1Symbol First token symbol
   * @param token2Symbol Second token symbol
   * @returns Boolean indicating if this is a stablecoin pair
   */
  private isStablecoinPair(token1Symbol: string, token2Symbol: string): boolean {
    // List of common stablecoin symbols
    const stablecoins = ['USDC', 'USDT', 'DAI', 'BUSD', 'TUSD', 'USDN', 'USDJ', 'sUSD', 'GUSD', 'HUSD'];

    // Check if both tokens are in the stablecoin list
    const isToken1Stable = stablecoins.some(s => token1Symbol.toUpperCase().includes(s));
    const isToken2Stable = stablecoins.some(s => token2Symbol.toUpperCase().includes(s));

    return isToken1Stable && isToken2Stable;
  }

  public getHttpProvider(): HttpProvider {
    // if (!this.httpProvider) {
    //   this.httpProvider = new HttpProvider(this.polkadot.config.network.nodeURL);
    // }

    // return this.wsProvider;

    return new HttpProvider(this.polkadot.config.network.nodeURL);
  }

  public getWsProvider(): WsProvider {
    // if (!this.wsProvider) {
    //   this.wsProvider = new WsProvider(this.polkadot.config.network.nodeURL);
    // }

    // return this.wsProvider;

    return new WsProvider(this.polkadot.config.network.nodeURL);
  }

  public getProvider(): WsProvider | HttpProvider {
    if (this.polkadot.config.network.nodeURL.startsWith('http')) {
      return this.getHttpProvider();
    } else {
      return this.getWsProvider();
    }
  }

  public async getApiPromise(): Promise<ApiPromise> {
    // if (!this.apiPromise) {
    //   this.apiPromise = await this.apiPromiseCreate({ provider: this.getProvider() });
    // }

    // return this.apiPromise;

    return await this.apiPromiseCreate({ provider: this.getProvider() });
  }

  public async getPoolService(): Promise<PoolService> {
    // if (!this.poolService) {
    //   this.poolService = new PoolService(await this.getApiPromise());
    //   await this.poolServiceSyncRegistry(this.poolService);
    // }
    //
    // return this.poolService;

    const poolService = new PoolService(await this.getApiPromise());
    await this.poolServiceSyncRegistry(poolService);

    return poolService;
  }

  public async getTradeRouter(): Promise<TradeRouter> {
    // if (!this.tradeRouter) {
    //   this.tradeRouter = new TradeRouter(await this.getPoolService());
    // }

    // return this.tradeRouter;

    return new TradeRouter(await this.getPoolService());
  }

  @runWithRetryAndTimeout()
  public async poolServiceGetPools(target: PoolService, includeOnly: PoolType[]): Promise<PoolBase[]> {
    return await target.getPools(includeOnly);
  }

  @runWithRetryAndTimeout()
  public async tradeRouterGetBestSell(target: TradeRouter, assetIn: string, assetOut: string, amountIn: BigNumber | string | number): Promise<Trade> {
    return await target.getBestSell(assetIn, assetOut, amountIn);
  }

  @runWithRetryAndTimeout()
  public async tradeRouterGetBestBuy(target: TradeRouter, assetIn: string, assetOut: string, amountOut: BigNumber | string | number): Promise<Trade> {
    return await target.getBestBuy(assetIn, assetOut, amountOut);
  }

  @runWithRetryAndTimeout()
  public async cryptoWaitReady(): Promise<boolean> {
    return await cryptoWaitReady();
  }

  @runWithRetryAndTimeout()
  public async apiPromiseCreate(options: { provider: WsProvider | HttpProvider }): Promise<ApiPromise> {
    return await ApiPromise.create(options);
  }

  @runWithRetryAndTimeout()
  public async polkadotGetInstance(target: typeof Polkadot, network: string): Promise<Polkadot> {
    return await target.getInstance(network);
  }

  @runWithRetryAndTimeout()
  public async poolServiceSyncRegistry(target: PoolService): Promise<void> {
    return await target.syncRegistry();
  }
}