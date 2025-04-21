import {Polkadot} from '../../chains/polkadot/polkadot';
import {logger} from '../../services/logger';
import {HydrationConfig} from './hydration.config';
import {HydrationPoolInfo, LiquidityQuote, PositionStrategyType, SwapQuote, SwapRoute} from './hydration.types';
import {KeyringPair} from '@polkadot/keyring/types';
import {ApiPromise, HttpProvider, WsProvider} from '@polkadot/api';
import {cryptoWaitReady} from '@polkadot/util-crypto';
import {runWithRetryAndTimeout} from "../../chains/polkadot/polkadot.utils";

// Import hydration.json for token resolution
import hydrationJson from '../../../conf/lists/hydration.json';
import {PoolBase, PoolToken, Trade} from '@galacticcouncil/sdk/build/types/types';
import {BigNumber, PoolService, PoolType, TradeRouter, TradeType} from "@galacticcouncil/sdk";

// Create a map of token symbols to addresses from hydration.json
const KNOWN_TOKENS = hydrationJson.reduce((acc, token) => {
  acc[token.symbol.toUpperCase()] = token.address;
  return acc;
}, {});

// Buffer for transaction costs (in HDX)
const HDX_TRANSACTION_BUFFER = 0.1;

// Pool types
const POOL_TYPE = {
  XYK: 'xyk',
  LBP: 'lbp',
  OMNIPOOL: 'omnipool',
  STABLESWAP: 'stableswap'
};

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
        throw new Error(`Pool not found: ${poolAddress}`);
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
      const transaction = trade.toTx(tradeLimit).get();

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

  /**
   * Add liquidity to a Hydration position
   * @param walletAddress The user's wallet address
   * @param poolId The pool ID to add liquidity to
   * @param baseTokenAmount Amount of base token to add
   * @param quoteTokenAmount Amount of quote token to add
   * @param slippagePct Optional slippage percentage (default from config)
   * @returns Details of the liquidity addition
   */
  async addLiquidity(
    walletAddress: string,
    poolId: string,
    baseTokenAmount: number,
    quoteTokenAmount: number,
    slippagePct?: number
  ): Promise<any> {
    try {
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
        .decimalPlaces(0);

      const quoteAmountBN = new BigNumber(quoteTokenAmount)
        .multipliedBy(new BigNumber(10).pow(quoteToken.decimals))
        .decimalPlaces(0);

      // Get slippage
      const effectiveSlippage = slippagePct ?? parseFloat(this.config.allowedSlippage);

      // Using the GalacticCouncil SDK to prepare the transaction
      const apiPromise = await this.getApiPromise();
      
      let addLiquidityTx;
      const poolType = pool.poolType?.toLowerCase() || POOL_TYPE.XYK; // Default to XYK if type is not provided

      logger.info(`Adding liquidity to ${poolType} pool (${poolId})`);

      switch (poolType) {
        case POOL_TYPE.XYK:
          // Calculate max limit for quote token based on slippage
          const quoteAmountMaxLimit = this.calculateMaxAmountIn(quoteAmountBN, effectiveSlippage);
          
          // Create XYK add liquidity transaction
          addLiquidityTx = apiPromise.tx.xyk.addLiquidity(
            baseToken.address,
            quoteToken.address,
            baseAmountBN.toString(),
            quoteAmountMaxLimit.toString()
          );
          break;

        case POOL_TYPE.LBP:
          // For LBP, we use [assetId, amount] tuples
          addLiquidityTx = apiPromise.tx.lbp.addLiquidity(
            [baseToken.address, baseAmountBN.toString()],
            [quoteToken.address, quoteAmountBN.toString()]
          );
          break;

        case POOL_TYPE.OMNIPOOL:
          // For Omnipool, we can only add liquidity for one asset at a time
          // We'll use the base asset if both are provided
          if (baseTokenAmount > 0) {
            // Calculate min shares limit based on slippage (if applicable)
            const minSharesLimit = this.calculateMinSharesLimit(baseAmountBN, effectiveSlippage);
            
            addLiquidityTx = apiPromise.tx.omnipool.addLiquidityWithLimit(
              baseToken.address,
              baseAmountBN.toString(),
              minSharesLimit.toString()
            );
          } else {
            // Use quote asset if base amount is 0
            const minSharesLimit = this.calculateMinSharesLimit(quoteAmountBN, effectiveSlippage);
            
            addLiquidityTx = apiPromise.tx.omnipool.addLiquidityWithLimit(
              quoteToken.address,
              quoteAmountBN.toString(),
              minSharesLimit.toString()
            );
          }
          break;

        case POOL_TYPE.STABLESWAP:
          // For Stableswap pools
          // We need to specify which assets we want to receive
          const assets = [
            { assetId: baseToken.address, amount: baseAmountBN.toString() },
            { assetId: quoteToken.address, amount: quoteAmountBN.toString() }
          ].filter(asset => new BigNumber(asset.amount).gt(0)); // Only include assets with amount > 0
          
          // Get the numeric pool ID from pool info
          const numericPoolId = parseInt(pool.id);
          if (isNaN(numericPoolId)) {
            throw new Error(`Invalid pool ID for stableswap: ${pool.id}`);
          }
          
          addLiquidityTx = apiPromise.tx.stableswap.addLiquidity(
            numericPoolId, // Use the numeric pool ID
            assets
          );
          break;

        default:
          throw new Error(`Unsupported pool type: ${poolType}`);
      }

      // Sign and send the transaction
      const txHash = await this.submitTransaction(apiPromise, addLiquidityTx, wallet, poolType);

      logger.info(`Liquidity added to pool ${poolId} with tx hash: ${txHash}`);

      // In a real implementation, we would parse events to get actual amounts added
      // Here we're returning the requested amounts
      return {
        signature: txHash,
        baseTokenAmountAdded: baseTokenAmount,
        quoteTokenAmountAdded: quoteTokenAmount,
        fee: 0.01 // This should be the actual fee from the transaction
      };
    } catch (error) {
      logger.error(`Error adding liquidity to pool: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate maximum amount in based on slippage
   */
  private calculateMaxAmountIn(amount: BigNumber, slippagePct: number): BigNumber {
    return amount.multipliedBy(new BigNumber(100 + slippagePct).dividedBy(100)).decimalPlaces(0);
  }

  /**
   * Calculate minimum shares limit based on slippage
   */
  private calculateMinSharesLimit(amount: BigNumber, slippagePct: number): BigNumber {
    return amount.multipliedBy(new BigNumber(100 - slippagePct).dividedBy(100)).decimalPlaces(0);
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
  private async submitTransaction(api: any, tx: any, wallet: any, poolType: string): Promise<string> {
    // We still need a promise for the event-based callbacks
    return new Promise<string>(async (resolve, reject) => {
      let unsub: () => void;
      
      // We'll get the hash from the status once available
      // Initial logging will use the tx ID for context only
      const txId = tx.hash.toHex(); // Short ID for initial logging
      logger.debug(`Transaction created with ID: ${txId}`);
      
      // Create a handler function for transaction status updates
      const statusHandler = async (result: any) => {
        try {
          // Get the hash from status when available
          const txHash = result.txHash.toString();
          
          if (result.status.isInBlock || result.status.isFinalized) {
            // Transaction is included in a block
            const blockHash = result.status.isInBlock ? result.status.asInBlock : result.status.asFinalized;
            
            logger.debug(`Transaction ${txHash} ${result.status.isInBlock ? 'in block' : 'finalized'}: ${blockHash.toString()}`);
            
            // Handle dispatch errors - these come directly with the status
            if (result.dispatchError) {
              const errorMessage = await this.extractErrorMessage(api, result.dispatchError);
              logger.error(`Transaction ${txHash} failed with dispatch error: ${errorMessage}`);
              unsub();
              reject(new Error(`Transaction ${txHash} failed: ${errorMessage}`));
              return;
            }
            
            // Check transaction events for success or failure
            if (await this.hasFailedEvent(api, result.events)) {
              const errorMessage = await this.extractEventErrorMessage(api, result.events);
              logger.error(`Transaction ${txHash} failed with event error: ${errorMessage}`);
              unsub();
              reject(new Error(`Transaction ${txHash} failed: ${errorMessage}`));
              return;
            }
            
            // Check for pool-specific success events
            if (await this.hasSuccessEvent(api, result.events, poolType)) {
              logger.info(`Transaction ${txHash} succeeded in block ${blockHash.toString()}`);
              unsub();
              resolve(txHash);
              return;
            }
            
            // If we reached finalization with no explicit failure, consider it a success
            if (result.status.isFinalized) {
              logger.warn(`Transaction ${txHash} finalized with no specific success/failure event. Assuming success.`);
              unsub();
              resolve(txHash);
              return;
            }
          } 
          else if (result.status.isDropped || result.status.isInvalid || result.status.isUsurped) {
            // Transaction didn't make it to a block
            const statusType = result.status.type;
            const statusValue = result.status.value.toString();
            const errorMessage = `Transaction ${statusType}: ${statusValue}`;
            logger.error(`Transaction ${txHash} - ${errorMessage}`);
            unsub();
            reject(new Error(`Transaction ${txHash} ${statusType}: ${statusValue}`));
            return;
          }
          else {
            // Log other status updates with the transaction hash
            logger.debug(`Transaction ${txHash} status: ${result.status.type}`);
          }
          // For other statuses (like Ready, Broadcast), we continue waiting
        } catch (error) {
          // If we can't get the hash from status for some reason, fall back to tx hash
          const fallbackHash = tx.hash.toString();
          logger.error(`Error processing transaction status: ${error.message}`);
          unsub();
          reject(new Error(`Transaction ${fallbackHash} processing failed: ${error.message}`));
        }
      };
      
      // Submit the transaction using async/await
      try {
        // Use await instead of then/catch
        logger.info(`Submitting transaction with id ${txId} ...`);
        unsub = await tx.signAndSend(wallet, statusHandler);
      } catch (error) {
        // Use the fallback hash if submission failed before we got a status
        const fallbackHash = tx.hash.toString();
        logger.error(`Exception during transaction submission: ${error.message}`);
        reject(new Error(`Transaction ${fallbackHash} submission failed: ${error.message}`));
      }
    });
  }

  /**
   * Extract a meaningful error message from a dispatch error
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
   */
  private async hasFailedEvent(api: any, events: any[]): Promise<boolean> {
    return events.some(({ event }) => 
      api.events.system.ExtrinsicFailed.is(event)
    );
  }

  /**
   * Check if events contain a success event specific to the pool type
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
  ): Promise<any[]> {
    try {
      const tradeRouter = await this.getTradeRouter();

      // Make sure arrays are properly handled
      const tokenSymbolsArray = Array.isArray(tokenSymbols) ? tokenSymbols : [tokenSymbols].filter(Boolean);
      const tokenAddressesArray = Array.isArray(tokenAddresses) ? tokenAddresses : [tokenAddresses].filter(Boolean);
      const typesArray = Array.isArray(types) ? types : [types].filter(Boolean);

      // Determine if we need to fetch by token
      const hasTokenSymbols = tokenSymbolsArray.length > 0;
      const hasTokenAddresses = tokenAddressesArray.length > 0;
      const hasTokens = hasTokenSymbols || hasTokenAddresses;

      // Store if we need to filter by both symbol and address
      const needsSymbolAndAddressMatch = hasTokenSymbols && hasTokenAddresses;

      // Log what we're filtering for
      const logMessage = [`Listing Hydration pools`];
      if (tokenSymbolsArray.length > 0) logMessage.push(`Token symbols: ${tokenSymbolsArray.join(', ')}`);
      if (tokenAddressesArray.length > 0) logMessage.push(`Token addresses: ${tokenAddressesArray.join(', ')}`);
      if (typesArray.length > 0) logMessage.push(`Pool types: ${typesArray.join(', ')}`);
      logMessage.push(`Max pages: ${maxNumberOfPages}`);
      logMessage.push(`Use official tokens: ${useOfficialTokens}`);
      if (needsSymbolAndAddressMatch) logMessage.push(`Requiring both symbol AND address match`);
      logger.info(logMessage.join(', '));

      // Resolve token symbols to addresses if using official tokens list
      const resolvedTokenAddresses: string[] = [];
      const allAddressesToFilterBy: string[] = [...tokenAddressesArray]; // Start with explicit addresses

      // Process token lists - we'll gather all addresses to filter by
      if (useOfficialTokens && hasTokenSymbols) {
        // Get the tokens from Polkadot token list
        const tokenList = this.getAllTokens();
        
        // Create a function to resolve symbols
        const resolveSymbolsToAddresses = (symbols: string[]) => {
          const resolved: string[] = [];

          for (const token of symbols) {
            const upperToken = token.toUpperCase();
            
            // First check in KNOWN_TOKENS from hydration.json
            if (KNOWN_TOKENS[upperToken]) {
              const resolvedAddress = KNOWN_TOKENS[upperToken];
              resolved.push(resolvedAddress);
              logger.info(`Resolved token ${token} to address ${resolvedAddress} using official list`);
              continue;
            }
            
            // Then check in tokenList from getAllTokens()
            const foundToken = tokenList.find(t => t.symbol.toUpperCase() === upperToken);
            if (foundToken) {
              const resolvedAddress = foundToken.address;
              resolved.push(resolvedAddress);
              logger.info(`Resolved token ${token} to address ${resolvedAddress} using token list`);
            }
          }

          return resolved;
        };

        // Process specific token symbols parameter
        if (hasTokenSymbols) {
          const resolvedFromSymbols = resolveSymbolsToAddresses(tokenSymbolsArray);
          resolvedTokenAddresses.push(...resolvedFromSymbols);

          // Only add to filter list if we don't need both symbol AND address match
          if (!needsSymbolAndAddressMatch) {
            allAddressesToFilterBy.push(...resolvedFromSymbols);
          }
        }
      }

      // Get all pool addresses
      let pools: PoolBase[] = [];
      try {
        // Get pool info using the SDK
        const poolService = await this.getPoolService();
        pools = await this.poolServiceGetPools(poolService, []);

        logger.info(`Found ${pools.length} total pool addresses`);
      } catch (error) {
        logger.error(`Error getting pool addresses: ${error.message}`);
        throw new Error('Failed to get pool addresses');
      }

      logger.info(`Successfully retrieved info for ${pools.length} pools`);

      // Filter processing
      let filteredPools = [...pools]; // Make a copy

      // Advanced filtering: Symbols and Addresses
      if (needsSymbolAndAddressMatch) {
        logger.info(`Applying specific symbol AND address matching filter`);
        const beforeCount = filteredPools.length;

        // Filter by addresses and then check if the symbols match
        filteredPools = filteredPools.filter(pool =>
          pool.tokens.every(token =>
            tokenAddressesArray.includes(token.id)
          )
        );

        logger.info(`Symbol AND address filter: ${beforeCount} → ${filteredPools.length} pools`);
      }
      // Standard filtering by individual parameters
      else if (hasTokens) {
        // Filter by token addresses
        const beforeCount = filteredPools.length;

        filteredPools = filteredPools.filter(pool =>
          pool.tokens.some(token =>
            allAddressesToFilterBy.includes(token.id)
          )
        );

        logger.info(`Token address filter: ${beforeCount} → ${filteredPools.length} pools`);
      }

      // Filter by pool type if specified
      if (typesArray.length > 0) {
        const beforeCount = filteredPools.length;
        filteredPools = filteredPools.filter(pool =>
          pool.type && typesArray.some(type =>
            pool.type.toLowerCase().includes(type.toLowerCase())
          )
        );
        logger.info(`Pool type filter: ${beforeCount} → ${filteredPools.length} pools`);
      }

      // Map pools to response format and process token filters
      const poolListPromises = filteredPools.map(async (pool) => {
        try {
          const [baseToken, quoteToken] = pool.tokens;
          const baseTokenSymbol = baseToken.symbol;
          const quoteTokenSymbol = quoteToken.symbol;
          const poolAddress = pool.address;

          let baseTokenAmount = 0;
          let quoteTokenAmount = 0;
          let poolPrice = 1;

          // Try to get reserves
          const reserves = await this.getPoolReserves(poolAddress);

          if (reserves) {
            baseTokenAmount = Number(reserves.baseReserve
              .div(BigNumber(10).pow(baseToken.decimals))
              .toFixed(baseToken.decimals));

            quoteTokenAmount = Number(reserves.quoteReserve
              .div(BigNumber(10).pow(quoteToken.decimals))
              .toFixed(quoteToken.decimals));
          } else {
            // Fallback to direct pool balance
            baseTokenAmount = Number(BigNumber(baseToken.balance.toString())
              .div(BigNumber(10).pow(baseToken.decimals))
              .toFixed(baseToken.decimals));

            quoteTokenAmount = Number(BigNumber(quoteToken.balance.toString())
              .div(BigNumber(10).pow(quoteToken.decimals))
              .toFixed(quoteToken.decimals));
          }

          // Calculate price via tradeRouter
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
            logger.error(`Failed to calculate pool price: ${priceError.message}`);
            // Fallback: derive from ratio
            if (baseTokenAmount > 0 && quoteTokenAmount > 0) {
              poolPrice = quoteTokenAmount / baseTokenAmount;
            }
          }

          // Calculate TVL based on current values
          const tvl = baseTokenAmount * poolPrice + quoteTokenAmount;

          return {
            ...pool,
            address: pool.address,
            type: pool.type,
            tokens: [baseTokenSymbol, quoteTokenSymbol],
            tokenAddresses: [baseToken.id, quoteToken.id],
            fee: 500/10000,
            price: poolPrice,
            volume: 0, // Not available yet
            tvl: tvl,
            apr: 0, // Not available yet
          };
        } catch (error) {
          logger.error(`Error processing pool ${pool?.address}: ${error.message}`);
          return null; // or return a default object
        }
      });

      // Wait for all pool info to be processed
      let poolList = await Promise.all(poolListPromises);
      poolList = poolList.filter(Boolean); // Remove null entries

      // Apply token symbol filter if token symbols are specified and we're not using official tokens
      // (if we're using official tokens, we've already filtered by address above)
      if (hasTokenSymbols && !useOfficialTokens) {
        const beforeCount = poolList.length;

        // First, handle the case when we have exactly 2 token symbols - find exact pairs
        if (tokenSymbolsArray.length === 2) {
          const [symbol1, symbol2] = tokenSymbolsArray;
          const upperSymbol1 = symbol1.toUpperCase();
          const upperSymbol2 = symbol2.toUpperCase();
          
          poolList = poolList.filter(pool => {
            // Get symbols for the pool tokens
            const baseTokenSymbol = String(pool.tokens[0]).toUpperCase();
            const quoteTokenSymbol = String(pool.tokens[1]).toUpperCase();
            
            // Check for exact pair match (in either order)
            return (baseTokenSymbol === upperSymbol1 && quoteTokenSymbol === upperSymbol2) ||
                  (baseTokenSymbol === upperSymbol2 && quoteTokenSymbol === upperSymbol1);
          });
          
          logger.info(`Exact token pair filter (${symbol1}/${symbol2}): ${beforeCount} → ${poolList.length} pools`);
        }
        // For single token or more than two tokens, use the original filter
        else {
          poolList = poolList.filter(pool =>
            tokenSymbolsArray.some(token =>
              // Check if any of the pool tokens match the requested token
              pool.tokens.some(poolToken =>
                String(poolToken).toLowerCase().includes(token.toLowerCase())
              )
            )
          );
          logger.info(`Token symbol filter: ${beforeCount} → ${poolList.length} pools`);
        }
      }
      
      // Log results
      logger.info(`Final result: ${poolList.length} pools after all filters`);
      
      return poolList;
    } catch (error) {
      logger.error(`Error listing pools:`, error);
      throw error;
    }
  }

  /**
   * Get a detailed liquidity quote with adjusted pricing and strategy
   * @param poolAddress The pool address
   * @param baseTokenAmount Amount of base token to add
   * @param quoteTokenAmount Amount of quote token to add
   * @param slippagePct Slippage percentage (optional)
   * @returns A detailed liquidity quote with recommended amounts
   */
  async quoteLiquidity(
    poolAddress: string,
    baseTokenAmount?: number,
    quoteTokenAmount?: number,
    slippagePct: number = 1
  ): Promise<{
    baseLimited: boolean;
    baseTokenAmount: number;
    quoteTokenAmount: number;
    baseTokenAmountMax: number;
    quoteTokenAmountMax: number;
  }> {
    try {
      // Validate inputs
      if (!baseTokenAmount && !quoteTokenAmount) {
        throw new Error('Either baseTokenAmount or quoteTokenAmount must be provided');
      }

      // Get pool info to determine price range and pool type
      const poolInfo = await this.getPoolInfo(poolAddress);
      if (!poolInfo) {
        throw new Error(`Pool not found: ${poolAddress}`);
      }

      // Get token symbols
      const baseTokenSymbol = await this.getTokenSymbol(poolInfo.baseTokenAddress);
      const quoteTokenSymbol = await this.getTokenSymbol(poolInfo.quoteTokenAddress);

      logger.info(`Pool info for quoteLiquidity:`, {
        poolAddress,
        poolType: poolInfo.poolType,
        baseToken: baseTokenSymbol,
        quoteToken: quoteTokenSymbol,
        fee: poolInfo.feePct
      });
      
      // Determine price range based on pool type
      const currentPrice = poolInfo.price || 10;
      
      // Calculate price range based on pool type
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
        // If both amounts are provided, choose based on pool type
        if (poolInfo.poolType?.toLowerCase().includes('stable')) {
          // For stable pools, prefer the token with lower volatility (usually quote)
          amount = quoteTokenAmount;
          amountType = 'quote';
        } else {
          // For other pools, use the one that would provide more balanced liquidity
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

      // Choose appropriate strategy based on pool type
      let positionStrategy = PositionStrategyType.Balanced;
      
      // For stable pools, always use balanced
      if (poolInfo.poolType?.toLowerCase().includes('stable')) {
        positionStrategy = PositionStrategyType.Balanced;
      } 
      // For XYK pools, use a strategy based on current price vs range
      else if (poolInfo.poolType?.toLowerCase().includes('xyk') || 
              poolInfo.poolType?.toLowerCase().includes('constantproduct')) {
        // If price is near bottom of range, favor base token (BaseHeavy)
        if (currentPrice < currentPrice * (1 - priceRange * 0.5)) {
          positionStrategy = PositionStrategyType.BaseHeavy;
        } 
        // If price is near top of range, favor quote token (QuoteHeavy)
        else if (currentPrice > currentPrice * (1 + priceRange * 0.5)) {
          positionStrategy = PositionStrategyType.QuoteHeavy;
        }
        // Otherwise use balanced strategy
        else {
          positionStrategy = PositionStrategyType.Balanced;
        }
      }
      // For Omnipool, use imbalanced
      else if (poolInfo.poolType?.toLowerCase().includes('omni')) {
        positionStrategy = PositionStrategyType.Imbalanced;
      }

      logger.info(`Quote parameters:`, {
        poolAddress,
        poolType: poolInfo.poolType,
        amountType,
        amount,
        lowerPrice,
        upperPrice,
        strategyType: positionStrategy
      });

      // Get liquidity quote
      const quote = await this.getLiquidityQuote(
        poolAddress,
        lowerPrice,
        upperPrice,
        amount,
        amountType,
        positionStrategy
      );
      
      logger.info(`Quote result:`, quote);

      // Calculate effective slippage (default to 1% if not provided)
      const effectiveSlippage = slippagePct / 100;

      // Ensure we don't have null values in the response
      const finalBaseAmount = quote.baseTokenAmount || 0;
      const finalQuoteAmount = quote.quoteTokenAmount || 0;

      // Map to standard AMM interface response
      return {
        baseLimited: amountType === 'base',
        baseTokenAmount: finalBaseAmount,
        quoteTokenAmount: finalQuoteAmount,
        baseTokenAmountMax: finalBaseAmount * (1 + effectiveSlippage),
        quoteTokenAmountMax: finalQuoteAmount * (1 + effectiveSlippage)
      };
    } catch (error) {
      logger.error(`Failed to get liquidity quote: ${error.message}`);
      throw error;
    }
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
   * @param slippagePct Slippage percentage (optional)
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
  ): Promise<any> {
    try {
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

      // Execute swap using the existing method
      const result = await this.executeSwap(
        wallet,
        baseTokenIdentifier,
        quoteTokenIdentifier,
        amount,
        side,
        poolAddress,
        slippagePct
      );

      logger.info(`Executed swap: ${amount} ${side === 'BUY' ? quoteTokenIdentifier : baseTokenIdentifier} for ${result.totalOutputSwapped} ${side === 'BUY' ? baseTokenIdentifier : quoteTokenIdentifier}`);

      return {
        signature: result.signature,
        totalInputSwapped: result.totalInputSwapped,
        totalOutputSwapped: result.totalOutputSwapped,
        fee: result.fee,
        baseTokenBalanceChange: result.baseTokenBalanceChange,
        quoteTokenBalanceChange: result.quoteTokenBalanceChange,
        priceImpact: result.priceImpact
      };
    } catch (error) {
      logger.error(`Failed to execute swap: ${error.message}`);
      throw error;
    }
  }
}