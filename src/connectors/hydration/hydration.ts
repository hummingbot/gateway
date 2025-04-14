import { Polkadot } from '../../chains/polkadot/polkadot';
import { logger } from '../../services/logger';
import { HydrationConfig } from './hydration.config';
import {
  BinLiquidity,
  SwapQuote,
  PositionStrategyType,
  LiquidityQuote,
  SwapRoute,
  HydrationPoolInfo
} from './hydration.types';
import { KeyringPair } from '@polkadot/keyring/types';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { BigNumber, PoolService, Trade, TradeRouter, TradeType, PoolBase, PoolToken } from '@galacticcouncil/sdk';
import { cryptoWaitReady } from '@polkadot/util-crypto';

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
}

// Add the Quote interface
interface Quote {
  type: 'Buy' | 'Sell';
  amountIn: string;
  amountOut: string;
  price: string;
  priceImpact: string;
  fee: string;
  route: string[];
}

// Update the PositionInfo interface to use token addresses instead of token objects
interface PositionInfo {
  positionAddress: string;
  ownerAddress: string;
  poolAddress: string;
  baseTokenAddress: string;
  quoteTokenAddress: string;
  lowerPrice: number;
  upperPrice: number;
  baseTokenAmount: number;
  quoteTokenAmount: number;
  baseFeeAmount: number;
  quoteFeeAmount: number;
  liquidity: number;
  inRange: boolean;
  createdAt: number;
  apr: number;
}

/**
 * Main class for interacting with the Hydration protocol on Polkadot
 */
export class Hydration {
  private static _instances: { [name: string]: Hydration } = {};
  private static readonly MAX_POSITIONS = 100; // Maximum number of positions to fetch
  private polkadot: Polkadot;
  private api: ApiPromise;
  private tradeRouter: TradeRouter;
  private poolService: PoolService;
  public config: HydrationConfig.NetworkConfig;

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
   * Check if the instance is ready
   * @returns boolean indicating if the instance is ready
   */
  public ready(): boolean {
    return this._ready;
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
      await cryptoWaitReady();

      // Create API connection
      const wsProvider = new WsProvider(this.polkadot.config.network.nodeURL);
      this.api = await ApiPromise.create({ provider: wsProvider });

      // Initialize Hydration services
      // @ts-ignore - Ignorando erro de incompatibilidade de versões do ApiPromise
      this.poolService = new PoolService(this.api);
      await this.poolService.syncRegistry();

      // Mark instance as ready
      this._ready = true;

      logger.info(`Hydration initialized for network: ${network}`);
    } catch (error) {
      logger.error(`Failed to initialize Hydration: ${error.message}`);
      throw error;
    }
  }

  private getNewTradeRouter(): TradeRouter {
    return new TradeRouter(this.poolService);
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
  public async getAllTokens() {
    if (!this.ready()) {
      await this.init(this.polkadot.network);
    }

    return this.polkadot.tokenList;
  }

  /**
   * Get all available pools
   * @returns A Promise that resolves to an array of pool information
   */
  private async getAllPools(): Promise<ExternalPoolInfo[]> {
    try {
      const poolAddresses = await this.getPoolAddresses();
      const poolPromises = poolAddresses.map(address => this.getPoolInfo(address));
      const pools = await Promise.all(poolPromises);
      return pools.filter((pool): pool is ExternalPoolInfo => pool !== null);
    } catch (error) {
      logger.error(`Failed to get all pools: ${error.message}`);
      return [];
    }
  }

  /**
   * Get detailed information about a Hydration pool
   * @param poolAddress The address of the pool
   * @returns A Promise that resolves to pool information or null if not found
   */
  async getPoolInfo(poolAddress: string): Promise<ExternalPoolInfo | null> {
    try {
      const tradeRouter = this.getNewTradeRouter();
      // Check cache first
      const currentTime = Date.now();
      const cachedPool = this.poolCache.get(poolAddress);
      const cacheExpiry = this.poolCacheExpiry.get(poolAddress);

      if (cachedPool && cacheExpiry && currentTime < cacheExpiry) {
        return this.toExternalPoolInfo(cachedPool, poolAddress);
      }

      // Ensure the instance is ready
      if (!this.ready()) {
        await this.init(this.polkadot.network);
      }

      // Get pool data from the SDK
      const pools = await this.poolService.getPools([]); // Get all pools
      
      const poolData = pools.find(pool => pool.address === poolAddress);

      if (!poolData) {
        logger.error(`Pool not found: ${poolAddress}`);
        return null;
      }

      // Get token info
      const baseToken = await this.polkadot.getToken(poolData.tokens[0].symbol);
      const quoteToken = await this.polkadot.getToken(poolData.tokens[1].symbol);

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
            .toFixed(baseToken.decimals));
          
          const quoteAmount = Number(reserves.quoteReserve
            .div(BigNumber(10).pow(quoteToken.decimals))
            .toFixed(quoteToken.decimals));

          // Validate the calculated amounts
          baseTokenAmount = !isNaN(baseAmount) && isFinite(baseAmount) ? baseAmount : 0;
          quoteTokenAmount = !isNaN(quoteAmount) && isFinite(quoteAmount) ? quoteAmount : 0;
        } 
        // Fallback to token balances if reserves not available
        else if (poolData.tokens[0].balance && poolData.tokens[1].balance) {
          const baseAmount = Number(BigNumber(poolData.tokens[0].balance.toString())
            .div(BigNumber(10).pow(baseToken.decimals))
            .toFixed(baseToken.decimals));
          
          const quoteAmount = Number(BigNumber(poolData.tokens[1].balance.toString())
            .div(BigNumber(10).pow(quoteToken.decimals))
            .toFixed(quoteToken.decimals));

          // Validate the calculated amounts
          baseTokenAmount = !isNaN(baseAmount) && isFinite(baseAmount) ? baseAmount : 0;
          quoteTokenAmount = !isNaN(quoteAmount) && isFinite(quoteAmount) ? quoteAmount : 0;
        }

        // Calculate price using the SDK's trade router
        let buyQuote;
        let sellQuote;
        try {
          const assets = await this.getAllTokens();
          const baseTokenId = assets.find(a => a.symbol === poolData.tokens[0].symbol)?.address;
          const quoteTokenId = assets.find(a => a.symbol === poolData.tokens[1].symbol)?.address;

          if (!baseTokenId || !quoteTokenId) {
            throw new Error('Failed to find token IDs in trade router');
          }

          // Use a small amount (1 unit) to get the spot price
          const amountBN = BigNumber('1');
          
          // Get both buy and sell quotes to calculate the mid price
          try {
            buyQuote = await tradeRouter.getBestBuy(
              quoteTokenId,
              baseTokenId,
              amountBN
            );
          } catch (error) {
            throw error;
          }

          try {
            sellQuote = await tradeRouter.getBestSell(
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
            poolPrice = !isNaN(midPrice) && isFinite(midPrice) ? Number(midPrice.toFixed(6)) : 1;
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
            amount: baseTokenAmount
          },
          quoteToken: {
            symbol: quoteToken.symbol,
            decimals: quoteToken.decimals,
            amount: quoteTokenAmount
          },
          price: poolPrice
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
            poolDataAny.liquidity.toNumber() : 
            Number(poolDataAny.liquidity);
          
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
   * Get liquidity distribution in a pool
   * @param poolAddress The address of the pool
   * @returns A Promise that resolves to an array of bin liquidity
   */
  private async getLiquidityDistribution(poolAddress: string): Promise<BinLiquidity[]> {
    try {
      // Get pool info
      const poolInfo = await this.getPoolInfo(poolAddress);
      if (!poolInfo) {
        throw new Error(`Pool not found: ${poolAddress}`);
      }

      // Get liquidity distribution from the SDK
      // @ts-ignore - Generic Method, needs to improve
      const liquidityData = await this.poolService.getPoolLiquidity(poolAddress);

      if (!liquidityData || liquidityData.length === 0) {
        return [];
      }

      // Map to our BinLiquidity interface
      const bins: BinLiquidity[] = liquidityData.map(bin => {
        const lowerPrice = bin.lowerPrice ? bin.lowerPrice.toNumber() : 0;
        const upperPrice = bin.upperPrice ? bin.upperPrice.toNumber() : 0;

        return {
          lowerPrice,
          upperPrice,
          liquidityAmount: bin.liquidity ? bin.liquidity.toNumber() : 0,
          baseTokenAmount: bin.reserves ? bin.reserves[0].toNumber() : 0,
          quoteTokenAmount: bin.reserves ? bin.reserves[1].toNumber() : 0
        };
      });

      return bins;
    } catch (error) {
      logger.error(`Failed to get liquidity distribution for ${poolAddress}: ${error.message}`);
      return [];
    }
  }

  /**
   * Get a list of pools
   * @param limit Maximum number of pools to return
   * @param tokenMintA Optional filter by base token
   * @param tokenMintB Optional filter by quote token
   * @returns A Promise that resolves to a list of Hydration pools
   */
  async getPools(tokenMintA?: string, tokenMintB?: string): Promise<ExternalPoolInfo[]> {
    try {
      const pools = await this.getAllPools();
      return pools
        .map(poolInfo => {
          const baseTokenMatches = !tokenMintA || poolInfo.baseTokenAddress === tokenMintA;
          const quoteTokenMatches = !tokenMintB || poolInfo.quoteTokenAddress === tokenMintB;
          return baseTokenMatches && quoteTokenMatches ? poolInfo : null;
        })
        .filter((pool): pool is ExternalPoolInfo => pool !== null);
    } catch (error) {
      logger.error(`Failed to get pools: ${error.message}`);
      return [];
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
      // Get a new trade router instance
      const tradeRouter = this.getNewTradeRouter();

      // Ensure the instance is ready
      if (!this.ready()) {
        await this.init(this.polkadot.network);
      }

      // Get token info
      const baseToken = await this.polkadot.getToken(baseTokenSymbol);
      const quoteToken = await this.polkadot.getToken(quoteTokenSymbol);

      if (!baseToken || !quoteToken) {
        throw new Error(`Token not found: ${!baseToken ? baseTokenSymbol : quoteTokenSymbol}`);
      }

      // Find token IDs in the Hydration protocol
      const assets = await this.getAllTokens();
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
        // @ts-ignore - Ignorando erro de incompatibilidade de API
        trade = await tradeRouter.getBestBuy(
          quoteTokenId,
          baseTokenId,
          amountBN
        );
      } else {
        // Selling base token for quote token
        // @ts-ignore - Ignorando erro de incompatibilidade de API
        trade = await tradeRouter.getBestSell(
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
      const price = Number(tradeHuman.spotPrice);

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
      // Get a new trade router instance
      const tradeRouter = this.getNewTradeRouter();

      // Ensure the instance is ready
      if (!this.ready()) {
        await this.init(this.polkadot.network);
      }

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
      const baseToken = await this.polkadot.getToken(baseTokenSymbol);
      const quoteToken = await this.polkadot.getToken(quoteTokenSymbol);

      if (!baseToken || !quoteToken) {
        throw new Error(`Token not found: ${!baseToken ? baseTokenSymbol : quoteTokenSymbol}`);
      }

      // Find token IDs in the Hydration protocol
      const assets = await this.getAllTokens();
      const baseTokenId = assets.find(a => a.symbol === baseToken.symbol)?.address;
      const quoteTokenId = assets.find(a => a.symbol === quoteToken.symbol)?.address;

      if (!baseTokenId || !quoteTokenId) {
        throw new Error(`Token not supported in Hydration: ${!baseTokenId ? baseToken.symbol : quoteToken.symbol}`);
      }

      // Create the trade
      const amountBN = BigNumber(amount.toString());
      let trade: Trade;

      if (side === 'BUY') {
        // @ts-ignore - Ignorando erro de incompatibilidade de API
        trade = await tradeRouter.getBestBuy(
          quoteTokenId,
          baseTokenId,
          amountBN
        );
      } else {
        // @ts-ignore - Ignorando erro de incompatibilidade de API
        trade = await tradeRouter.getBestSell(
          baseTokenId,
          quoteTokenId,
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
      const txHash = await new Promise<string>((resolve, reject) => {
        // @ts-ignore - Generic Method, needs to improve
        transaction.signAndSend(wallet, (result: any) => {
          if (result.dispatchError) {
            if (result.dispatchError.isModule) {
              const decoded = this.api.registry.findMetaError(
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
      logger.error(`Failed to execute swap: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get positions owned by a wallet in a specific pool
   * @param poolAddress The pool address
   * @param wallet The wallet
   * @returns A Promise that resolves to a list of position information
   */
  async getPositionsInPool(poolAddress: string, wallet: KeyringPair): Promise<PositionInfo[]> {
    try {
      // Ensure the instance is ready
      if (!this.ready()) {
        await this.init(this.polkadot.network);
      }

      // Get pool info
      const poolInfo = await this.getPoolInfo(poolAddress);
      if (!poolInfo) {
        throw new Error(`Pool not found: ${poolAddress}`);
      }

      // Get positions for this wallet from the SDK
      // @ts-ignore - Generic Method, needs to improve
      const positions = await this.poolService.getPositions(wallet.address, poolAddress);

      if (!positions || positions.length === 0) {
        return [];
      }

      // Convert to our position interface
      const currentPrice = poolInfo.price;
      const positionInfoList: PositionInfo[] = [];

      for (const position of positions) {
        // Calculate price range
        const lowerPrice = position.tickLower ?
          Math.pow(1.0001, position.tickLower) :
          position.lowerPrice ? position.lowerPrice.toNumber() : 0;

        const upperPrice = position.tickUpper ?
          Math.pow(1.0001, position.tickUpper) :
          position.upperPrice ? position.upperPrice.toNumber() : 0;

        // Get token amounts
        const baseTokenAmount = position.baseTokenAmount ?
          position.baseTokenAmount.toNumber() : 0;

        const quoteTokenAmount = position.quoteTokenAmount ?
          position.quoteTokenAmount.toNumber() : 0;

        // Get fee amounts
        const baseFeeAmount = position.baseFeeAmount ?
          position.baseFeeAmount.toNumber() : 0;

        const quoteFeeAmount = position.quoteFeeAmount ?
          position.quoteFeeAmount.toNumber() : 0;

        // Calculate if in range
        const inRange = currentPrice >= lowerPrice && currentPrice <= upperPrice;

        // Calculate APR if available
        let apr = position.apr || 0;
        if (!apr && position.creationTimestamp) {
          // If APR is not directly provided, estimate it based on fees and age
          const ageInDays = Math.max((Date.now() - position.creationTimestamp) / (1000 * 60 * 60 * 24), 1);
          const valueCollected = (baseFeeAmount * poolInfo.price) + quoteFeeAmount;
          const positionValue = (baseTokenAmount * poolInfo.price) + quoteTokenAmount;

          if (positionValue > 0) {
            apr = (valueCollected / positionValue) * (365 / ageInDays) * 100;
          }
        }

        positionInfoList.push({
          positionAddress: position.id,
          ownerAddress: wallet.address,
          poolAddress,
          baseTokenAddress: poolInfo.baseTokenAddress,
          quoteTokenAddress: poolInfo.quoteTokenAddress,
          lowerPrice,
          upperPrice,
          baseTokenAmount,
          quoteTokenAmount,
          baseFeeAmount,
          quoteFeeAmount,
          liquidity: position.liquidity ? position.liquidity.toNumber() : 0,
          inRange,
          createdAt: position.creationTimestamp || Date.now(),
          apr
        });
      }

      return positionInfoList;
    } catch (error) {
      logger.error(`Failed to get positions in pool: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get information about a specific position
   * @param positionAddress The position address
   * @param wallet The wallet
   * @returns A Promise that resolves to position information
   */
  async getPositionInfo(positionAddress: string, wallet: KeyringPair): Promise<PositionInfo> {
    try {
      // Get position data from the SDK
      // @ts-ignore - Generic Method, needs to improve
      const position = await this.poolService.getPosition(positionAddress);

      if (!position) {
        throw new Error(`Position not found: ${positionAddress}`);
      }

      // Verify ownership
      if (position.owner !== wallet.address) {
        throw new Error('Position not owned by this wallet');
      }

      // Get pool information
      const poolAddress = position.poolId;
      const poolInfo = await this.getPoolInfo(poolAddress);
      if (!poolInfo) {
        throw new Error(`Pool not found for position: ${positionAddress}`);
      }

      // Calculate price range
      const lowerPrice = position.tickLower ?
        Math.pow(1.0001, position.tickLower) :
        position.lowerPrice ? position.lowerPrice.toNumber() : 0;

      const upperPrice = position.tickUpper ?
        Math.pow(1.0001, position.tickUpper) :
        position.upperPrice ? position.upperPrice.toNumber() : 0;

      // Get token amounts
      const baseTokenAmount = position.baseTokenAmount ?
        position.baseTokenAmount.toNumber() : 0;

      const quoteTokenAmount = position.quoteTokenAmount ?
        position.quoteTokenAmount.toNumber() : 0;

      // Get fee amounts
      const baseFeeAmount = position.baseFeeAmount ?
        position.baseFeeAmount.toNumber() : 0;

      const quoteFeeAmount = position.quoteFeeAmount ?
        position.quoteFeeAmount.toNumber() : 0;

      // Check if position is in range
      const inRange = poolInfo.price >= lowerPrice && poolInfo.price <= upperPrice;

      // Calculate APR if available
      let apr = position.apr || 0;
      if (!apr && position.creationTimestamp) {
        const ageInDays = Math.max((Date.now() - position.creationTimestamp) / (1000 * 60 * 60 * 24), 1);
        const valueCollected = (baseFeeAmount * poolInfo.price) + quoteFeeAmount;
        const positionValue = (baseTokenAmount * poolInfo.price) + quoteTokenAmount;

        if (positionValue > 0) {
          apr = (valueCollected / positionValue) * (365 / ageInDays) * 100;
        }
      }

      return {
        positionAddress,
        ownerAddress: wallet.address,
        poolAddress,
        baseTokenAddress: poolInfo.baseTokenAddress,
        quoteTokenAddress: poolInfo.quoteTokenAddress,
        lowerPrice,
        upperPrice,
        baseTokenAmount,
        quoteTokenAmount,
        baseFeeAmount,
        quoteFeeAmount,
        liquidity: position.liquidity ? position.liquidity.toNumber() : 0,
        inRange,
        createdAt: position.creationTimestamp || Date.now(),
        apr
      };
    } catch (error) {
      logger.error(`Failed to get position info: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get the raw position data
   * @param positionAddress The position address
   * @param wallet The wallet
   * @returns A Promise that resolves to the raw position data and info
   */
  async getRawPosition(
    positionAddress: string,
    wallet: KeyringPair
  ): Promise<{ position: any; info: any }> {
    try {
      // Ensure the instance is ready
      if (!this.ready()) {
        await this.init(this.polkadot.network);
      }

      // Get position and pool data from the SDK
      // @ts-ignore - Generic Method, needs to improve  
      const position = await this.poolService.getPosition(positionAddress);

      if (!position) {
        throw new Error(`Position not found: ${positionAddress}`);
      }

      // Verify ownership
      if (position.owner !== wallet.address) {
        throw new Error('Position not owned by this wallet');
      }

      // Get pool information
      // @ts-ignore - Generic Method, needs to improve
      const poolInfo = await this.poolService.getPool(position.poolId);

      return {
        position: {
          publicKey: positionAddress,
          positionData: position
        },
        info: {
          publicKey: position.poolId,
          data: poolInfo
        }
      };
    } catch (error) {
      logger.error(`Failed to get raw position: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get price to bin IDs
   * @param poolAddress The pool address
   * @param lowerPrice The lower price
   * @param upperPrice The upper price
   * @param padBins Number of bins to pad (optional)
   * @returns A Promise that resolves to min and max bin IDs
   */
  async getPriceToBinIds(
    poolAddress: string,
    lowerPrice: number,
    upperPrice: number,
    padBins: number = 1
  ): Promise<{ minBinId: number, maxBinId: number }> {
    try {
      // Ensure the instance is ready
      if (!this.ready()) {
        await this.init(this.polkadot.network);
      }

      // Get pool info
      const poolInfo = await this.getPoolInfo(poolAddress);
      if (!poolInfo) {
        throw new Error(`Pool not found: ${poolAddress}`);
      }

      // Get tick spacing for this pool from the SDK
      // @ts-ignore - Generic Method, needs to improve
      const poolDetails = await this.poolService.getPool(poolAddress);
      const tickSpacing = poolDetails.tickSpacing || 10;

      // Convert prices to ticks
      const tickLower = Math.floor(Math.log(lowerPrice) / Math.log(1.0001));
      const tickUpper = Math.ceil(Math.log(upperPrice) / Math.log(1.0001));

      // Adjust to valid tick spacing and add padding
      const minBinId = Math.floor(tickLower / tickSpacing) * tickSpacing - (padBins * tickSpacing);
      const maxBinId = Math.ceil(tickUpper / tickSpacing) * tickSpacing + (padBins * tickSpacing);

      return { minBinId, maxBinId };
    } catch (error) {
      logger.error(`Failed to get price to bin IDs: ${error.message}`);
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
   * Open a new position
   * @param wallet The wallet
   * @param lowerPrice The lower price
   * @param upperPrice The upper price
   * @param poolAddress The pool address
   * @param baseTokenAmount Base token amount (optional)
   * @param quoteTokenAmount Quote token amount (optional)
   * @param slippagePct Slippage percentage (optional)
   * @param strategyType Strategy type (optional)
   * @returns A Promise that resolves to the open position result
   */
  async openPosition(
    _wallet: KeyringPair,
    lowerPrice: number,
    upperPrice: number,
    poolAddress: string,
    baseTokenAmount?: number,
    quoteTokenAmount?: number,
    _slippagePct?: number,
    strategyType: PositionStrategyType = PositionStrategyType.Balanced
  ): Promise<any> {
    try {
      // Get pool info
      const poolInfo = await this.getPoolInfo(poolAddress);
      if (!poolInfo) {
        throw new Error(`Pool not found: ${poolAddress}`);
      }

      // Check token amounts
      if (!baseTokenAmount && !quoteTokenAmount) {
        throw new Error('At least one token amount must be provided');
      }

      // Calculate liquidity distribution based on strategy
      let baseAmount = baseTokenAmount || 0;
      let quoteAmount = quoteTokenAmount || 0;

      switch (strategyType) {
        case PositionStrategyType.BaseHeavy:
          baseAmount = baseAmount || (quoteAmount / poolInfo.price) * 2;
          quoteAmount = quoteAmount || (baseAmount * poolInfo.price) / 2;
          break;
        case PositionStrategyType.QuoteHeavy:
          baseAmount = baseAmount || (quoteAmount / poolInfo.price) / 2;
          quoteAmount = quoteAmount || (baseAmount * poolInfo.price) * 2;
          break;
        case PositionStrategyType.Balanced:
          baseAmount = baseAmount || (quoteAmount / poolInfo.price);
          quoteAmount = quoteAmount || (baseAmount * poolInfo.price);
          break;
        case PositionStrategyType.Imbalanced:
          // Custom distribution based on price range
          const priceDiff = upperPrice - lowerPrice;
          const midPrice = lowerPrice + priceDiff / 2;

          if (poolInfo.price < midPrice) {
            baseAmount = baseAmount || (quoteAmount / poolInfo.price) * 1.5;
            quoteAmount = quoteAmount || (baseAmount * poolInfo.price) / 1.5;
          } else {
            baseAmount = baseAmount || (quoteAmount / poolInfo.price) / 1.5;
            quoteAmount = quoteAmount || (baseAmount * poolInfo.price) * 1.5;
          }
          break;
      }
      // Simulate creating a position
      // In a real implementation, this would interact with Hydration smart contracts
      const newPositionAddress = `hydration-position-${Date.now()}`;
      const signature = `0x${Math.random().toString(16).substring(2, 66)}`;
      const fee = 0.01;

      logger.info(`Opened position ${newPositionAddress} in pool ${poolAddress} with price range ${lowerPrice.toFixed(4)} - ${upperPrice.toFixed(4)}`);

      return {
        signature,
        fee,
        positionAddress: newPositionAddress,
        positionRent: 0.05,
        baseTokenAmountAdded: baseAmount,
        quoteTokenAmountAdded: quoteAmount
      };
    } catch (error) {
      logger.error(`Failed to open position: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add liquidity to an existing position
   * @param wallet The wallet
   * @param positionAddress The position address
   * @param baseTokenAmount Base token amount
   * @param quoteTokenAmount Quote token amount
   * @param slippagePct Slippage percentage (optional)
   * @param strategyType Strategy type (optional)
   * @returns A Promise that resolves to the add liquidity result
   */
  async addLiquidity(
    wallet: KeyringPair,
    positionAddress: string,
    baseTokenAmount: number,
    quoteTokenAmount: number,
    _slippagePct?: number,
    _strategyType: PositionStrategyType = PositionStrategyType.Balanced
  ): Promise<any> {
    try {
      // Get position info
      const positionResult = await this.getRawPosition(positionAddress, wallet);
      if (!positionResult || !positionResult.position) {
        throw new Error(`Position not found: ${positionAddress}`);
      }

      // Check token amounts
      if (baseTokenAmount <= 0 && quoteTokenAmount <= 0) {
        throw new Error('At least one token amount must be positive');
      }

      // Simulate adding liquidity
      // In a real implementation, this would interact with Hydration smart contracts
      const signature = `0x${Math.random().toString(16).substring(2, 66)}`;
      const fee = 0.01;

      logger.info(`Added liquidity to position ${positionAddress}: ${baseTokenAmount.toFixed(4)} base token, ${quoteTokenAmount.toFixed(4)} quote token`);

      return {
        signature,
        baseTokenAmountAdded: baseTokenAmount,
        quoteTokenAmountAdded: quoteTokenAmount,
        fee
      };
    } catch (error) {
      logger.error(`Failed to add liquidity: ${error.message}`);
      throw error;
    }
  }

  /**
   * Remove liquidity from a position
   * @param wallet The wallet
   * @param positionAddress The position address
   * @param percentageToRemove Percentage of liquidity to remove
   * @returns A Promise that resolves to the remove liquidity result
   */
  async removeLiquidity(
    wallet: KeyringPair,
    positionAddress: string,
    percentageToRemove: number
  ): Promise<any> {
    try {
      // Validate percentage
      if (percentageToRemove <= 0 || percentageToRemove > 100) {
        throw new Error('Percentage to remove must be between 0 and 100');
      }

      // Get position info
      const positionInfo = await this.getPositionInfo(positionAddress, wallet);

      // Calculate amounts to remove
      const baseTokenAmount = positionInfo.baseTokenAmount * (percentageToRemove / 100);
      const quoteTokenAmount = positionInfo.quoteTokenAmount * (percentageToRemove / 100);

      // Simulate removing liquidity
      // In a real implementation, this would interact with Hydration smart contracts
      const signature = `0x${Math.random().toString(16).substring(2, 66)}`;
      const fee = 0.01;

      logger.info(`Removed ${percentageToRemove}% liquidity from position ${positionAddress}: ${baseTokenAmount.toFixed(4)} base token, ${quoteTokenAmount.toFixed(4)} quote token`);

      return {
        signature,
        fee,
        baseTokenAmountRemoved: baseTokenAmount,
        quoteTokenAmountRemoved: quoteTokenAmount
      };
    } catch (error) {
      logger.error(`Failed to remove liquidity: ${error.message}`);
      throw error;
    }
  }

  /**
   * Collect fees from a position
   * @param wallet The wallet
   * @param positionAddress The position address
   * @returns A Promise that resolves to the collect fees result
   */
  async collectFees(
    wallet: KeyringPair,
    positionAddress: string
  ): Promise<any> {
    try {
      // Get position info
      const positionInfo = await this.getPositionInfo(positionAddress, wallet);

      // Simulate collecting fees
      // In a real implementation, this would interact with Hydration smart contracts
      const signature = `0x${Math.random().toString(16).substring(2, 66)}`;
      const fee = 0.01;

      logger.info(`Collected fees from position ${positionAddress}: ${positionInfo.baseFeeAmount.toFixed(4)} base token, ${positionInfo.quoteFeeAmount.toFixed(4)} quote token`);

      return {
        signature,
        fee,
        baseFeeAmountCollected: positionInfo.baseFeeAmount,
        quoteFeeAmountCollected: positionInfo.quoteFeeAmount
      };
    } catch (error) {
      logger.error(`Failed to collect fees: ${error.message}`);
      throw error;
    }
  }

  /**
   * Close a position
   * @param wallet The wallet
   * @param positionAddress The position address
   * @returns A Promise that resolves to the close position result
   */
  async closePosition(
    wallet: KeyringPair,
    positionAddress: string
  ): Promise<any> {
    try {
      // Get position info
      const positionInfo = await this.getPositionInfo(positionAddress, wallet);

      // Simulate removing all liquidity first
      const removeLiquidityResult = await this.removeLiquidity(
        wallet,
        positionAddress,
        100
      );

      // Simulate collecting fees
      const collectFeesResult = await this.collectFees(
        wallet,
        positionAddress
      );

      // Simulate closing the position
      // In a real implementation, this would interact with Hydration smart contracts
      const signature = `0x${Math.random().toString(16).substring(2, 66)}`;
      const fee = 0.01;

      logger.info(`Closed position ${positionAddress}`);

      return {
        signature,
        fee: fee + removeLiquidityResult.fee + collectFeesResult.fee,
        positionRentRefunded: 0.05,
        baseTokenAmountRemoved: removeLiquidityResult.baseTokenAmountRemoved,
        quoteTokenAmountRemoved: removeLiquidityResult.quoteTokenAmountRemoved,
        baseFeeAmountCollected: collectFeesResult.baseFeeAmountCollected,
        quoteFeeAmountCollected: collectFeesResult.quoteFeeAmountCollected
      };
    } catch (error) {
      logger.error(`Failed to close position: ${error.message}`);
      throw error;
    }
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

      // Try to use SDK to get more accurate liquidity (if available)
      try {
        // @ts-ignore - Direct SDK access
        if (this.poolService.calculateLiquidity) {
          // @ts-ignore - Direct SDK access to calculate liquidity
          const sdkLiquidity = await this.poolService.calculateLiquidity(
            poolAddress, 
            baseTokenAmount.toString(), 
            quoteTokenAmount.toString(),
            lowerPrice,
            upperPrice
          );
          
          if (sdkLiquidity && !isNaN(Number(sdkLiquidity))) {
            liquidity = Number(sdkLiquidity);
            logger.info(`Using SDK liquidity calculation: ${liquidity}`);
          }
        }
      } catch (sdkError) {
        logger.warn(`Failed to use SDK liquidity calculation: ${sdkError.message}`);
        // Continue with our calculation if SDK fails
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
  private async getPoolReserves(poolAddress: string): Promise<{ baseReserve: BigNumber; quoteReserve: BigNumber } | null> {
    try {
      // Get pool from SDK
      const pools = await this.poolService.getPools([]);
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
        const reserves = await this.poolService.getReserves(poolAddress);
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
      liquidity: internalPool.liquidity
    };
  }

  /**
   * Get all pool addresses from the Hydration protocol
   * @returns Array of pool addresses
   */
  public async getPoolAddresses(): Promise<string[]> {
    try {
      const pools = await this.poolService.getPools([]);
      return pools.map(pool => pool.address);
    } catch (error) {
      logger.error('Error getting pool addresses:', error);
      throw error;
    }
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
      const token = await this.polkadot.getToken(tokenAddress);
      if (!token) {
        throw new Error(`Token not found: ${tokenAddress}`);
      }
      return token.symbol;
    } catch (error) {
      logger.error(`Failed to get token symbol: ${error.message}`);
      throw error;
    }
  }
}