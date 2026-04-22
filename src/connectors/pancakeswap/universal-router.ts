import { Provider } from '@ethersproject/providers';
import { TradeType, Percent, Currency, CurrencyAmount, Token } from '@pancakeswap/sdk';
import {
  Pool,
  PoolType,
  SMART_ROUTER_ADDRESSES,
  SmartRouter,
  SmartRouterTrade,
  SwapOptions,
  SwapRouter,
  TradeConfig,
} from '@pancakeswap/smart-router';
import { Pair as V2Pair, computePairAddress } from '@pancakeswap/v2-sdk';
import IPancakeswapV3Pool from '@pancakeswap/v3-core/artifacts/contracts/PancakeV3Pool.sol/PancakeV3Pool.json';
import { Pool as V3Pool, FeeAmount, computePoolAddress, nearestUsableTick, TICK_SPACINGS } from '@pancakeswap/v3-sdk';
import { BigNumber, Contract } from 'ethers';
import { Address } from 'viem';

import { Ethereum } from '../../chains/ethereum/ethereum';
import { logger } from '../../services/logger';

import {
  IPancakeswapV2PairABI,
  getPancakeswapV2FactoryAddress,
  getPancakeswapV3PoolDeployerAddress,
} from './pancakeswap.contracts';

// Common fee tiers for V3
const V3_FEE_TIERS = [FeeAmount.LOWEST, FeeAmount.LOW, FeeAmount.MEDIUM, FeeAmount.HIGH];

// Common intermediate/base tokens for multi-hop routing per network
// These are the most liquid tokens that are commonly used as routing intermediates
const INTERMEDIATE_TOKENS: { [network: string]: { symbol: string; address: string; decimals: number }[] } = {
  bsc: [
    { symbol: 'WBNB', address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals: 18 },
    { symbol: 'USDT', address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
    { symbol: 'USDC', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
    { symbol: 'BUSD', address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', decimals: 18 },
    { symbol: 'DAI', address: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3', decimals: 18 },
  ],
  mainnet: [
    { symbol: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
    { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
    { symbol: 'DAI', address: '0x6B175474E89094C44Da98b954EesdeC80D8D8Ac', decimals: 18 },
    { symbol: 'WBTC', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8 },
  ],
  arbitrum: [
    { symbol: 'WETH', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
    { symbol: 'USDT', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
    { symbol: 'USDC', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
    { symbol: 'DAI', address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18 },
  ],
  base: [
    { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18 },
    { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
    { symbol: 'DAI', address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18 },
  ],
};

export interface UniversalRouterQuoteResult {
  trade: SmartRouterTrade<TradeType>;
  route: string[];
  routePath: string;
  priceImpact: number;
  estimatedGasUsed: BigNumber;
  estimatedGasUsedQuoteToken: CurrencyAmount<Currency>;
  quote: CurrencyAmount<Currency>;
  quoteGasAdjusted: CurrencyAmount<Currency>;
  methodParameters?: {
    calldata: string;
    value: string;
    to: string;
  };
}

export class UniversalRouterService {
  private provider: Provider;
  private chainId: number;
  private network: string;
  private ethereum: Ethereum | null = null;

  constructor(provider: Provider, chainId: number, network: string) {
    this.provider = provider;
    this.chainId = chainId;
    this.network = network;
  }

  private async getEthereum(): Promise<Ethereum> {
    if (!this.ethereum) {
      this.ethereum = await Ethereum.getInstance(this.network);
    }
    return this.ethereum;
  }

  /**
   * Get a quote for a swap using Universal Router
   */
  async getQuote(
    tokenIn: Token,
    tokenOut: Token,
    amount: CurrencyAmount<Currency>,
    tradeType: TradeType,
    options: {
      slippageTolerance: Percent;
      deadline: number;
      recipient: string;
      protocols?: PoolType[];
      maxHops?: number;
      maxSplits?: number;
    },
  ): Promise<UniversalRouterQuoteResult> {
    logger.info(`[UniversalRouter] Starting quote generation`);
    logger.info(`[UniversalRouter] Input: ${amount.toExact()} ${tokenIn.symbol} (${tokenIn.address})`);
    logger.info(`[UniversalRouter] Output: ${tokenOut.symbol} (${tokenOut.address})`);
    logger.info(
      `[UniversalRouter] Trade type: ${tradeType === TradeType.EXACT_INPUT ? 'EXACT_INPUT' : 'EXACT_OUTPUT'}`,
    );
    logger.info(`[UniversalRouter] Recipient: ${options.recipient}`);
    logger.info(`[UniversalRouter] Slippage: ${options.slippageTolerance.toSignificant()}%`);
    if (options.maxHops !== undefined) {
      logger.info(`[UniversalRouter] Max hops: ${options.maxHops}`);
    }
    if (options.maxSplits !== undefined) {
      logger.info(`[UniversalRouter] Max splits: ${options.maxSplits}`);
    }

    const protocols = options.protocols || [PoolType.V2, PoolType.V3];
    logger.info(`[UniversalRouter] Protocols to check: ${protocols.join(', ')}`);
    const allPools: Pool[] = [];
    const poolAddresses = new Set<string>(); // Track added pools to avoid duplicates

    // Get intermediate tokens for this network
    const intermediateTokens = this.getIntermediateTokens(tokenIn, tokenOut);
    logger.info(
      `[UniversalRouter] Using ${intermediateTokens.length} intermediate tokens for multi-hop routing: ${intermediateTokens.map((t) => t.symbol).join(', ')}`,
    );

    // Collect all token pairs to search for pools
    // Direct pair + pairs through intermediate tokens
    const tokenPairs: [Token, Token][] = [[tokenIn, tokenOut]];

    // Add pairs through each intermediate token for multi-hop routing
    for (const intermediate of intermediateTokens) {
      tokenPairs.push([tokenIn, intermediate]);
      tokenPairs.push([intermediate, tokenOut]);
    }

    logger.info(`[UniversalRouter] Searching ${tokenPairs.length} token pairs for pools...`);

    // Search for V3 pools
    if (protocols.includes(PoolType.V3)) {
      logger.info(`[UniversalRouter] Searching for V3 pools...`);
      for (const [tokenA, tokenB] of tokenPairs) {
        try {
          const pool = await this.findV3Pool(tokenA, tokenB);
          if (pool) {
            const poolKey = `v3-${tokenA.address}-${tokenB.address}`;
            if (!poolAddresses.has(poolKey)) {
              poolAddresses.add(poolKey);
              (pool as unknown as Pool).type = PoolType.V3;
              allPools.push(pool as unknown as Pool);
              logger.info(`[UniversalRouter] Found V3 pool: ${tokenA.symbol} <-> ${tokenB.symbol}`);
            }
          }
        } catch (error) {
          // Pool doesn't exist, continue
        }
      }
    }

    // Search for V2 pools
    if (protocols.includes(PoolType.V2)) {
      logger.info(`[UniversalRouter] Searching for V2 pools...`);
      for (const [tokenA, tokenB] of tokenPairs) {
        try {
          const pair = await this.findV2Pool(tokenA, tokenB);
          if (pair) {
            const poolKey = `v2-${tokenA.address}-${tokenB.address}`;
            if (!poolAddresses.has(poolKey)) {
              poolAddresses.add(poolKey);
              (pair as unknown as Pool).type = PoolType.V2;
              allPools.push(pair as unknown as Pool);
              logger.info(`[UniversalRouter] Found V2 pool: ${tokenA.symbol} <-> ${tokenB.symbol}`);
            }
          }
        } catch (error) {
          // Pool doesn't exist, continue
        }
      }
    }

    logger.info(`[UniversalRouter] Total pools found: ${allPools.length}`);

    if (allPools.length === 0) {
      logger.error(`[UniversalRouter] No pools found for ${tokenIn.symbol} -> ${tokenOut.symbol}`);
      throw new Error(`No routes found for ${tokenIn.symbol} -> ${tokenOut.symbol}`);
    }

    // const publicClient = createPublicClient({
    //   chain: ethereum.chainId as unknown as Chain, // or the equivalent constant for BNB Chain
    //   transport: http(ethereum.rpcUrl),
    // });
    const quoteProvider = SmartRouter.createQuoteProvider({
      onChainProvider: undefined,
    });

    const gasPriceWei = async (): Promise<bigint> => {
      const gasPrice = await this.provider.getGasPrice();
      return gasPrice.toBigInt(); // ✅ convert to bigint
    };

    const tradeConfig: TradeConfig = {
      allowedPoolTypes: protocols,
      poolProvider: SmartRouter.createStaticPoolProvider(allPools),
      quoteProvider,
      quoterOptimization: true,
      gasPriceWei,
      maxHops: options.maxHops,
      maxSplits: options.maxSplits,
    };

    // Create RouterTrade based on the best route
    const bestTrade: SmartRouterTrade<TradeType> | null = await SmartRouter.getBestTrade(
      amount,
      tradeType === TradeType.EXACT_INPUT ? tokenOut : tokenIn,
      tradeType,
      tradeConfig,
    );

    // Build the Universal Router swap
    const swapOptions: SwapOptions = {
      slippageTolerance: options.slippageTolerance,
      deadlineOrPreviousBlockhash: options.deadline,
      recipient: options.recipient as Address,
    };

    logger.info(`[UniversalRouter] Building swap parameters...`);
    // Create method parameters for the swap
    const { calldata, value } = SwapRouter.swapCallParameters(bestTrade, swapOptions);
    logger.info(`[UniversalRouter] Calldata length: ${calldata.length}, Value: ${value}`);

    // Calculate route path
    const route = this.extractRoutePath(bestTrade);
    const routePath = route.join(', ');
    logger.info(`[UniversalRouter] Route path: ${routePath}`);

    // Skip gas estimation during quote phase - it will be done during execution
    logger.info(`[UniversalRouter] Skipping gas estimation for quote (will estimate during execution)`);
    const estimatedGasUsed = BigNumber.from(0); // Placeholder, actual estimation happens during execution

    // Simple gas cost estimation
    const estimatedGasUsedQuoteToken = CurrencyAmount.fromRawAmount(
      tokenOut,
      '0', // Simplified for now
    );

    const result = {
      trade: bestTrade,
      route,
      routePath,
      priceImpact: parseFloat(bestTrade.inputAmount.divide(bestTrade.outputAmount).toSignificant(6)),
      estimatedGasUsed,
      estimatedGasUsedQuoteToken,
      quote: bestTrade.outputAmount,
      quoteGasAdjusted: bestTrade.outputAmount,
      methodParameters: {
        calldata,
        value,
        to: SMART_ROUTER_ADDRESSES[this.chainId],
      },
    };

    logger.info(`[UniversalRouter] Quote generation complete`);
    logger.info(`[UniversalRouter] Input: ${bestTrade.inputAmount.toExact()} ${bestTrade.inputAmount.currency.symbol}`);
    logger.info(
      `[UniversalRouter] Output: ${bestTrade.outputAmount.toExact()} ${bestTrade.outputAmount.currency.symbol}`,
    );
    logger.info(`[UniversalRouter] Price Impact: ${result.priceImpact}%`);

    return result;
  }

  /**
   * Get intermediate tokens for multi-hop routing
   * Excludes the input and output tokens from the list
   */
  private getIntermediateTokens(tokenIn: Token, tokenOut: Token): Token[] {
    const intermediates = INTERMEDIATE_TOKENS[this.network] || [];
    const result: Token[] = [];

    for (const intermediate of intermediates) {
      // Skip if this is the input or output token
      if (
        intermediate.address.toLowerCase() === tokenIn.address.toLowerCase() ||
        intermediate.address.toLowerCase() === tokenOut.address.toLowerCase()
      ) {
        continue;
      }

      result.push(new Token(this.chainId, intermediate.address as Address, intermediate.decimals, intermediate.symbol));
    }

    return result;
  }

  /**
   * Find a V3 pool for a token pair (returns the pool with best liquidity)
   */
  private async findV3Pool(tokenA: Token, tokenB: Token): Promise<V3Pool | null> {
    let bestPool: V3Pool | null = null;
    let bestLiquidity = BigNumber.from(0);

    // Try each fee tier and find the one with most liquidity
    for (const fee of V3_FEE_TIERS) {
      try {
        // Compute pool address
        const poolAddress = computePoolAddress({
          deployerAddress: getPancakeswapV3PoolDeployerAddress(this.network),
          tokenA,
          tokenB,
          fee,
        });

        // Get pool contract
        const poolContract = new Contract(poolAddress, IPancakeswapV3Pool.abi, this.provider);

        // Check if pool exists by querying liquidity
        const liquidity = await poolContract.liquidity();
        if (liquidity.eq(0)) continue;

        // Get slot0 data
        const slot0 = await poolContract.slot0();
        const sqrtPriceX96 = slot0[0];
        const tick = slot0[1];

        // Create minimal tick data around current tick
        const tickSpacing = TICK_SPACINGS[fee];
        const numSurroundingTicks = 300; // Number of ticks on each side

        const minTick = nearestUsableTick(tick - numSurroundingTicks * tickSpacing, tickSpacing);
        const maxTick = nearestUsableTick(tick + numSurroundingTicks * tickSpacing, tickSpacing);

        // Create tick data - for simplicity, assume all ticks have liquidity
        const ticks = [];
        for (let i = minTick; i <= maxTick; i += tickSpacing) {
          ticks.push({
            index: i,
            liquidityNet: 0,
            liquidityGross: 1,
          });
        }

        // Create pool instance with tick data
        const pool = new V3Pool(tokenA, tokenB, fee, sqrtPriceX96.toString(), liquidity.toString(), tick, ticks);

        // Keep track of pool with best liquidity
        if (liquidity.gt(bestLiquidity)) {
          bestLiquidity = liquidity;
          bestPool = pool;
        }
      } catch (error) {
        // Pool doesn't exist or other error, continue to next fee tier
        continue;
      }
    }

    return bestPool;
  }

  /**
   * Find a V2 pool (pair) for a token pair
   */
  private async findV2Pool(tokenA: Token, tokenB: Token): Promise<V2Pair | null> {
    try {
      // Compute pair address
      const pairAddress = computePairAddress({
        factoryAddress: getPancakeswapV2FactoryAddress(this.network),
        tokenA,
        tokenB,
      });

      const pairContract = new Contract(pairAddress, IPancakeswapV2PairABI.abi, this.provider);
      const reserves = await pairContract.getReserves();
      const token0Address = await pairContract.token0();

      const [reserve0, reserve1] = reserves;

      // Check if pool has liquidity
      if (reserve0.eq(0) || reserve1.eq(0)) {
        return null;
      }

      // Determine which token is token0 and which is token1
      const isTokenAToken0 = tokenA.address.toLowerCase() === token0Address.toLowerCase();
      const [tokenAReserve, tokenBReserve] = isTokenAToken0 ? [reserve0, reserve1] : [reserve1, reserve0];

      const pair = new V2Pair(
        CurrencyAmount.fromRawAmount(tokenA, tokenAReserve.toString()),
        CurrencyAmount.fromRawAmount(tokenB, tokenBReserve.toString()),
      );

      return pair;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract route path from a trade
   * Returns an array of route descriptions with percentages and full token paths
   */
  private extractRoutePath(trade: SmartRouterTrade<TradeType>): string[] {
    const routeDescriptions: string[] = [];

    for (const route of trade.routes) {
      // Get the full path of tokens from the route
      // route.path contains all tokens including intermediates (e.g., [LINK, WBNB, DAI])
      const routeWithPath = route as unknown as { path?: Currency[]; percent?: number };

      let pathSymbols: string[];
      if (routeWithPath.path && routeWithPath.path.length > 0) {
        // Use the full path from the route
        pathSymbols = routeWithPath.path.map((currency: Currency) => {
          const token = currency as Token;
          return token.symbol || token.address;
        });
      } else {
        // Fallback to input/output if path not available
        pathSymbols = [
          route.inputAmount.currency.symbol || (route.inputAmount.currency as Token).address,
          route.outputAmount.currency.symbol || (route.outputAmount.currency as Token).address,
        ];
      }

      // Get the percentage for this route (from RouteWithoutQuote)
      const percent = routeWithPath.percent || 100;

      // Format as "X% via TOKEN1 -> TOKEN2 -> TOKEN3"
      const pathStr = pathSymbols.join(' -> ');
      routeDescriptions.push(`${percent}% via ${pathStr}`);
    }

    return routeDescriptions;
  }

  /**
   * Estimate gas for the swap
   */
  private async estimateGas(calldata: string, value: string, from: string): Promise<BigNumber> {
    const ethereum = await this.getEthereum();
    const routerAddress = SMART_ROUTER_ADDRESSES[this.chainId];

    logger.info(`[UniversalRouter] Estimating gas...`);
    logger.info(`[UniversalRouter] From: ${from}`);
    logger.info(`[UniversalRouter] To: ${routerAddress}`);
    logger.info(`[UniversalRouter] Value: ${value}`);
    logger.info(`[UniversalRouter] Calldata length: ${calldata.length}`);

    try {
      // Get gas options from Ethereum
      const gasOptions = await ethereum.prepareGasOptions(undefined, 500000);
      logger.info(`[UniversalRouter] Gas options: ${JSON.stringify(gasOptions)}`);

      const gasEstimate = await this.provider.estimateGas({
        to: routerAddress,
        data: calldata,
        value,
        from,
        gasLimit: BigNumber.from(600000), // Increase gas limit for estimation
        // ...gasOptions, // Include gas price options
      });

      logger.info(`[UniversalRouter] Gas estimation successful: ${gasEstimate.toString()}`);
      return gasEstimate;
    } catch (error) {
      // Check if this is a Permit2 AllowanceExpired error (0xd81b2f2e)
      const isPermit2Error = error.error && error.error.data && error.error.data.startsWith('0xd81b2f2e');

      if (isPermit2Error) {
        // This is expected if user hasn't approved tokens to Permit2 yet
        logger.info(`[UniversalRouter] Gas estimation skipped - Permit2 approval needed`);
        logger.debug(`[UniversalRouter] User needs to approve tokens to Permit2 before executing swap`);
      } else {
        // Log other errors as actual errors
        logger.error(`[UniversalRouter] Gas estimation failed:`, error);
        logger.error(`[UniversalRouter] Error message: ${error.message}`);
        if (error.error && error.error.data) {
          logger.error(`[UniversalRouter] Error data: ${error.error.data}`);
        }
        if (error.reason) {
          logger.error(`[UniversalRouter] Error reason: ${error.reason}`);
        }
      }

      // Use a higher default gas limit
      const defaultGas = BigNumber.from(500000);
      logger.info(`[UniversalRouter] Using default gas estimate: ${defaultGas.toString()}`);
      return defaultGas;
    }
  }
}
