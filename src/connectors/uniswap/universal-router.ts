import { Provider } from '@ethersproject/providers';
import { Protocol, Trade as RouterTrade } from '@uniswap/router-sdk';
import { TradeType, Percent, Currency, CurrencyAmount, Token } from '@uniswap/sdk-core';
import {
  SwapRouter,
  SwapOptions,
  UNIVERSAL_ROUTER_ADDRESS,
  UniversalRouterVersion,
} from '@uniswap/universal-router-sdk';
import { Pair as V2Pair, Route as V2Route, Trade as V2Trade, computePairAddress } from '@uniswap/v2-sdk';
import IUniswapV3Pool from '@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json';
import {
  Pool as V3Pool,
  Route as V3Route,
  Trade as V3Trade,
  FeeAmount,
  computePoolAddress,
  FACTORY_ADDRESS,
  nearestUsableTick,
  TickMath,
  TICK_SPACINGS,
} from '@uniswap/v3-sdk';
import { BigNumber, Contract } from 'ethers';

import { logger } from '../../services/logger';

import {
  IUniswapV2PairABI,
  getUniswapV3FactoryAddress,
  getUniswapV2FactoryAddress,
  getUniswapV3QuoterV2ContractAddress,
} from './uniswap.contracts';

// Common fee tiers for V3
const V3_FEE_TIERS = [FeeAmount.LOWEST, FeeAmount.LOW, FeeAmount.MEDIUM, FeeAmount.HIGH];

export interface UniversalRouterQuoteResult {
  trade: RouterTrade<Currency, Currency, TradeType>;
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

  constructor(provider: Provider, chainId: number, network: string) {
    this.provider = provider;
    this.chainId = chainId;
    this.network = network;
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
      protocols?: Protocol[];
    },
  ): Promise<UniversalRouterQuoteResult> {
    logger.info(`Getting Universal Router quote for ${amount.toExact()} ${tokenIn.symbol} -> ${tokenOut.symbol}`);

    const protocols = options.protocols || [Protocol.V2, Protocol.V3];
    const routes: any[] = [];

    // Try to find routes through each protocol
    if (protocols.includes(Protocol.V3)) {
      try {
        const v3Trade = await this.findV3Route(tokenIn, tokenOut, amount, tradeType);
        if (v3Trade) {
          routes.push({
            routev3: v3Trade.route,
            inputAmount: v3Trade.inputAmount,
            outputAmount: v3Trade.outputAmount,
          });
        }
      } catch (error) {
        logger.debug(`Failed to find V3 route: ${error.message}`);
      }
    }

    if (protocols.includes(Protocol.V2)) {
      try {
        const v2Trade = await this.findV2Route(tokenIn, tokenOut, amount, tradeType);
        if (v2Trade) {
          routes.push({
            routev2: v2Trade.route,
            inputAmount: v2Trade.inputAmount,
            outputAmount: v2Trade.outputAmount,
          });
        }
      } catch (error) {
        logger.debug(`Failed to find V2 route: ${error.message}`);
      }
    }

    if (routes.length === 0) {
      throw new Error(`No routes found for ${tokenIn.symbol} -> ${tokenOut.symbol}`);
    }

    // Pick the best route (for now, just use the first one)
    const bestRoute = routes[0];

    // Create RouterTrade based on the best route
    let bestTrade: RouterTrade<Currency, Currency, TradeType>;

    if (bestRoute.routev3) {
      bestTrade = new RouterTrade({
        v2Routes: [],
        v3Routes: [bestRoute],
        v4Routes: [],
        tradeType,
      });
    } else {
      bestTrade = new RouterTrade({
        v2Routes: [bestRoute],
        v3Routes: [],
        v4Routes: [],
        tradeType,
      });
    }

    // Build the Universal Router swap
    const swapOptions: SwapOptions = {
      slippageTolerance: options.slippageTolerance,
      deadlineOrPreviousBlockhash: options.deadline,
      recipient: options.recipient,
    };

    // Create method parameters for the swap
    const { calldata, value } = SwapRouter.swapCallParameters(bestTrade, swapOptions);

    // Calculate route path
    const route = this.extractRoutePath(bestTrade);
    const routePath = route.join(' -> ');

    // Estimate gas
    const estimatedGasUsed = await this.estimateGas(calldata, value, options.recipient);

    // Simple gas cost estimation
    const estimatedGasUsedQuoteToken = CurrencyAmount.fromRawAmount(
      tokenOut,
      '0', // Simplified for now
    );

    return {
      trade: bestTrade,
      route,
      routePath,
      priceImpact: parseFloat(bestTrade.priceImpact.toSignificant(6)),
      estimatedGasUsed,
      estimatedGasUsedQuoteToken,
      quote: bestTrade.outputAmount,
      quoteGasAdjusted: bestTrade.outputAmount,
      methodParameters: {
        calldata,
        value,
        to: UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V2_0, this.chainId),
      },
    };
  }

  /**
   * Find V3 route using pool address computation
   */
  private async findV3Route(
    tokenIn: Token,
    tokenOut: Token,
    amount: CurrencyAmount<Currency>,
    tradeType: TradeType,
  ): Promise<V3Trade<Currency, Currency, TradeType> | null> {
    // Try each fee tier
    for (const fee of V3_FEE_TIERS) {
      try {
        // Compute pool address
        const poolAddress = computePoolAddress({
          factoryAddress: getUniswapV3FactoryAddress(this.network),
          tokenA: tokenIn,
          tokenB: tokenOut,
          fee,
        });

        // Get pool contract
        const poolContract = new Contract(poolAddress, IUniswapV3Pool.abi, this.provider);

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
        const pool = new V3Pool(tokenIn, tokenOut, fee, sqrtPriceX96.toString(), liquidity.toString(), tick, ticks);

        // Create route and trade
        const route = new V3Route([pool], tokenIn, tokenOut);

        return tradeType === TradeType.EXACT_INPUT ? V3Trade.exactIn(route, amount) : V3Trade.exactOut(route, amount);
      } catch (error) {
        // Pool doesn't exist or other error, continue to next fee tier
        continue;
      }
    }

    return null;
  }

  /**
   * Find V2 route for a token pair
   */
  private async findV2Route(
    tokenIn: Token,
    tokenOut: Token,
    amount: CurrencyAmount<Currency>,
    tradeType: TradeType,
  ): Promise<V2Trade<Currency, Currency, TradeType> | null> {
    try {
      // Compute pair address
      const pairAddress = computePairAddress({
        factoryAddress: getUniswapV2FactoryAddress(this.network),
        tokenA: tokenIn,
        tokenB: tokenOut,
      });

      const pairContract = new Contract(pairAddress, IUniswapV2PairABI.abi, this.provider);
      const reserves = await pairContract.getReserves();
      const token0 = await pairContract.token0();

      const [reserve0, reserve1] = reserves;
      const [reserveIn, reserveOut] =
        tokenIn.address.toLowerCase() === token0.toLowerCase() ? [reserve0, reserve1] : [reserve1, reserve0];

      const pair = new V2Pair(
        CurrencyAmount.fromRawAmount(tokenIn, reserveIn.toString()),
        CurrencyAmount.fromRawAmount(tokenOut, reserveOut.toString()),
      );

      const route = new V2Route([pair], tokenIn, tokenOut);

      return new V2Trade(route, amount, tradeType);
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract route path from a trade
   */
  private extractRoutePath(trade: RouterTrade<Currency, Currency, TradeType>): string[] {
    const path: string[] = [];

    if (trade.swaps.length > 0) {
      const firstSwap = trade.swaps[0];
      const route = firstSwap.route;

      path.push(route.input.symbol || (route.input as Token).address);
      path.push(route.output.symbol || (route.output as Token).address);
    }

    return path;
  }

  /**
   * Estimate gas for the swap
   */
  private async estimateGas(calldata: string, value: string, from: string): Promise<BigNumber> {
    try {
      const gasEstimate = await this.provider.estimateGas({
        to: UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V2_0, this.chainId),
        data: calldata,
        value,
        from,
      });
      return gasEstimate;
    } catch (error) {
      logger.warn(`Failed to estimate gas, using default: ${error.message}`);
      return BigNumber.from(300000); // Default gas estimate
    }
  }
}
