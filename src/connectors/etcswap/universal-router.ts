/**
 * ETCswap Universal Router Service
 *
 * Provides routing functionality across ETCswap V2 and V3 pools
 * using the Universal Router contract on Ethereum Classic.
 *
 * Uses Uniswap SDKs for calldata generation since ETCswap is ABI-compatible.
 */

import { getCreate2Address } from '@ethersproject/address';
import { Provider } from '@ethersproject/providers';
import { keccak256, pack } from '@ethersproject/solidity';
// Use Uniswap SDKs for Universal Router integration (ABI-compatible)
import { Protocol, Trade as RouterTrade } from '@uniswap/router-sdk';
import { TradeType, Percent, Currency, CurrencyAmount, Token } from '@uniswap/sdk-core';
import { SwapRouter, SwapOptions } from '@uniswap/universal-router-sdk';
import { Pair as V2Pair, Route as V2Route, Trade as V2Trade } from '@uniswap/v2-sdk';
import IUniswapV3Pool from '@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json';
import {
  Pool as V3Pool,
  Route as V3Route,
  Trade as V3Trade,
  FeeAmount,
  computePoolAddress,
  nearestUsableTick,
  TICK_SPACINGS,
} from '@uniswap/v3-sdk';
// Uniswap Universal Router SDK for calldata generation
// V3 Pool ABI from Uniswap (contracts are ABI-compatible)
import { BigNumber, Contract } from 'ethers';

import { Ethereum } from '../../chains/ethereum/ethereum';
import { logger } from '../../services/logger';

import {
  IUniswapV2PairABI,
  getETCswapV3FactoryAddress,
  getETCswapV2FactoryAddress,
  getUniversalRouterAddress,
  getETCswapV2InitCodeHash,
  ETCSWAP_V3_INIT_CODE_HASH,
} from './etcswap.contracts';

/**
 * Compute ETCswap V2 pair address using the correct INIT_CODE_HASH
 * This is necessary because ETCswap has a different INIT_CODE_HASH than Uniswap
 */
function computeETCswapV2PairAddress(
  factoryAddress: string,
  tokenA: Token,
  tokenB: Token,
  initCodeHash: string,
): string {
  const [token0, token1] = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA];
  return getCreate2Address(
    factoryAddress,
    keccak256(['bytes'], [pack(['address', 'address'], [token0.address, token1.address])]),
    initCodeHash,
  );
}

// Common fee tiers for V3
const V3_FEE_TIERS = [FeeAmount.LOWEST, FeeAmount.LOW, FeeAmount.MEDIUM, FeeAmount.HIGH];

export interface ETCswapUniversalRouterQuoteResult {
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

export class ETCswapUniversalRouterService {
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
   * Get the Universal Router address for this network
   */
  private getRouterAddress(): string {
    return getUniversalRouterAddress(this.network);
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
  ): Promise<ETCswapUniversalRouterQuoteResult> {
    logger.info(`[ETCswap UniversalRouter] Starting quote generation`);
    logger.info(`[ETCswap UniversalRouter] Input: ${amount.toExact()} ${tokenIn.symbol} (${tokenIn.address})`);
    logger.info(`[ETCswap UniversalRouter] Output: ${tokenOut.symbol} (${tokenOut.address})`);
    logger.info(
      `[ETCswap UniversalRouter] Trade type: ${tradeType === TradeType.EXACT_INPUT ? 'EXACT_INPUT' : 'EXACT_OUTPUT'}`,
    );
    logger.info(`[ETCswap UniversalRouter] Recipient: ${options.recipient}`);
    logger.info(`[ETCswap UniversalRouter] Slippage: ${options.slippageTolerance.toSignificant()}%`);

    const protocols = options.protocols || [Protocol.V2, Protocol.V3];
    logger.info(`[ETCswap UniversalRouter] Protocols to check: ${protocols.join(', ')}`);
    const routes: any[] = [];

    // Try to find routes through each protocol
    if (protocols.includes(Protocol.V3)) {
      logger.info(`[ETCswap UniversalRouter] Searching for V3 routes...`);
      try {
        const v3Trade = await this.findV3Route(tokenIn, tokenOut, amount, tradeType);
        if (v3Trade) {
          logger.info(
            `[ETCswap UniversalRouter] Found V3 route: ${v3Trade.inputAmount.toExact()} -> ${v3Trade.outputAmount.toExact()}`,
          );
          routes.push({
            routev3: v3Trade.route,
            inputAmount: v3Trade.inputAmount,
            outputAmount: v3Trade.outputAmount,
          });
        } else {
          logger.info(`[ETCswap UniversalRouter] No V3 route found`);
        }
      } catch (error) {
        logger.warn(`[ETCswap UniversalRouter] Failed to find V3 route: ${error.message}`);
      }
    }

    if (protocols.includes(Protocol.V2)) {
      logger.info(`[ETCswap UniversalRouter] Searching for V2 routes...`);
      try {
        const v2Trade = await this.findV2Route(tokenIn, tokenOut, amount, tradeType);
        if (v2Trade) {
          logger.info(
            `[ETCswap UniversalRouter] Found V2 route: ${v2Trade.inputAmount.toExact()} -> ${v2Trade.outputAmount.toExact()}`,
          );
          routes.push({
            routev2: v2Trade.route,
            inputAmount: v2Trade.inputAmount,
            outputAmount: v2Trade.outputAmount,
          });
        } else {
          logger.info(`[ETCswap UniversalRouter] No V2 route found`);
        }
      } catch (error) {
        logger.warn(`[ETCswap UniversalRouter] Failed to find V2 route: ${error.message}`);
      }
    }

    if (routes.length === 0) {
      logger.error(`[ETCswap UniversalRouter] No routes found for ${tokenIn.symbol} -> ${tokenOut.symbol}`);
      throw new Error(`No routes found for ${tokenIn.symbol} -> ${tokenOut.symbol}`);
    }

    logger.info(`[ETCswap UniversalRouter] Found ${routes.length} route(s), selecting best route`);

    // Select the best route based on output amount (for EXACT_INPUT) or input amount (for EXACT_OUTPUT)
    let bestRoute = routes[0];
    for (const route of routes) {
      if (tradeType === TradeType.EXACT_INPUT) {
        // For exact input, we want the highest output
        if (
          BigNumber.from(route.outputAmount.quotient.toString()).gt(
            BigNumber.from(bestRoute.outputAmount.quotient.toString()),
          )
        ) {
          bestRoute = route;
        }
      } else {
        // For exact output, we want the lowest input
        if (
          BigNumber.from(route.inputAmount.quotient.toString()).lt(
            BigNumber.from(bestRoute.inputAmount.quotient.toString()),
          )
        ) {
          bestRoute = route;
        }
      }
    }

    // Create RouterTrade based on the best route
    let bestTrade: RouterTrade<Currency, Currency, TradeType>;

    if (bestRoute.routev3) {
      logger.info(`[ETCswap UniversalRouter] Creating RouterTrade with V3 route`);
      bestTrade = new RouterTrade({
        v2Routes: [],
        v3Routes: [bestRoute],
        v4Routes: [],
        tradeType,
      });
    } else {
      logger.info(`[ETCswap UniversalRouter] Creating RouterTrade with V2 route`);
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

    logger.info(`[ETCswap UniversalRouter] Building swap parameters...`);
    // Create method parameters for the swap
    const { calldata, value } = SwapRouter.swapCallParameters(bestTrade, swapOptions);
    logger.info(`[ETCswap UniversalRouter] Calldata length: ${calldata.length}, Value: ${value}`);

    // Calculate route path
    const route = this.extractRoutePath(bestTrade);
    const routePath = route.join(' -> ');
    logger.info(`[ETCswap UniversalRouter] Route path: ${routePath}`);

    // Skip gas estimation during quote phase - it will be done during execution
    logger.info(`[ETCswap UniversalRouter] Skipping gas estimation for quote (will estimate during execution)`);
    const estimatedGasUsed = BigNumber.from(0);

    // Simple gas cost estimation placeholder
    const estimatedGasUsedQuoteToken = CurrencyAmount.fromRawAmount(tokenOut, '0');

    // Get ETCswap Universal Router address
    const routerAddress = this.getRouterAddress();

    const result = {
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
        to: routerAddress,
      },
    };

    logger.info(`[ETCswap UniversalRouter] Quote generation complete`);
    logger.info(
      `[ETCswap UniversalRouter] Input: ${bestTrade.inputAmount.toExact()} ${bestTrade.inputAmount.currency.symbol}`,
    );
    logger.info(
      `[ETCswap UniversalRouter] Output: ${bestTrade.outputAmount.toExact()} ${bestTrade.outputAmount.currency.symbol}`,
    );
    logger.info(`[ETCswap UniversalRouter] Price Impact: ${result.priceImpact}%`);
    logger.info(`[ETCswap UniversalRouter] Router address: ${routerAddress}`);

    return result;
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
    const factoryAddress = getETCswapV3FactoryAddress(this.network);

    // Try each fee tier
    for (const fee of V3_FEE_TIERS) {
      try {
        // Compute pool address using ETCswap's init code hash
        const poolAddress = computePoolAddress({
          factoryAddress,
          tokenA: tokenIn,
          tokenB: tokenOut,
          fee,
          initCodeHashManualOverride: ETCSWAP_V3_INIT_CODE_HASH,
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
        const numSurroundingTicks = 300;

        const minTick = nearestUsableTick(tick - numSurroundingTicks * tickSpacing, tickSpacing);
        const maxTick = nearestUsableTick(tick + numSurroundingTicks * tickSpacing, tickSpacing);

        // Create tick data
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
      const factoryAddress = getETCswapV2FactoryAddress(this.network);
      const initCodeHash = getETCswapV2InitCodeHash(this.network);

      // Compute pair address using ETCswap's INIT_CODE_HASH
      const pairAddress = computeETCswapV2PairAddress(factoryAddress, tokenIn, tokenOut, initCodeHash);

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
  async estimateGas(calldata: string, value: string, from: string): Promise<BigNumber> {
    const ethereum = await this.getEthereum();
    const routerAddress = this.getRouterAddress();

    logger.info(`[ETCswap UniversalRouter] Estimating gas...`);
    logger.info(`[ETCswap UniversalRouter] From: ${from}`);
    logger.info(`[ETCswap UniversalRouter] To: ${routerAddress}`);
    logger.info(`[ETCswap UniversalRouter] Value: ${value}`);
    logger.info(`[ETCswap UniversalRouter] Calldata length: ${calldata.length}`);

    try {
      // Get gas options from Ethereum
      const gasOptions = await ethereum.prepareGasOptions(undefined, 500000);
      logger.info(`[ETCswap UniversalRouter] Gas options: ${JSON.stringify(gasOptions)}`);

      const gasEstimate = await this.provider.estimateGas({
        to: routerAddress,
        data: calldata,
        value,
        from,
        gasLimit: BigNumber.from(600000),
        ...gasOptions,
      });

      logger.info(`[ETCswap UniversalRouter] Gas estimation successful: ${gasEstimate.toString()}`);
      return gasEstimate;
    } catch (error) {
      // Check if this is a Permit2 AllowanceExpired error
      const isPermit2Error = error.error && error.error.data && error.error.data.startsWith('0xd81b2f2e');

      if (isPermit2Error) {
        logger.info(`[ETCswap UniversalRouter] Gas estimation skipped - Permit2 approval needed`);
      } else {
        logger.error(`[ETCswap UniversalRouter] Gas estimation failed:`, error);
      }

      // Use a higher default gas limit
      const defaultGas = BigNumber.from(500000);
      logger.info(`[ETCswap UniversalRouter] Using default gas estimate: ${defaultGas.toString()}`);
      return defaultGas;
    }
  }
}
