import { FastifyPluginAsync } from 'fastify';
import { Uniswap } from '../uniswap';
import { Ethereum } from '../../../chains/ethereum/ethereum';
import { logger } from '../../../services/logger';
import { 
  GetSwapQuoteResponseType,
  GetSwapQuoteResponse,
  GetSwapQuoteRequestType,
  GetSwapQuoteRequest
} from '../../../schemas/trading-types/swap-schema';
import { formatTokenAmount } from '../uniswap.utils';
import {
  Token,
  CurrencyAmount,
  Percent,
  TradeType,
} from '@uniswap/sdk-core';
import { AlphaRouter, SwapType, SwapRoute } from '@uniswap/smart-order-router';
import { ethers } from 'ethers';
import JSBI from 'jsbi';

/**
 * Get a Universal Router quote using AlphaRouter with SwapType.UNIVERSAL_ROUTER
 */
export async function getUniversalRouterQuote(
  ethereum: Ethereum,
  inputToken: Token,
  outputToken: Token,
  inputAmount: CurrencyAmount<Token>,
  exactIn: boolean,
  slippageTolerance: Percent
): Promise<SwapRoute> {
  // Use AlphaRouter to find optimal routes
  const alphaRouter = new AlphaRouter({
    chainId: ethereum.chainId,
    provider: ethereum.provider as ethers.providers.JsonRpcProvider,
  });

  // Generate a swap route using AlphaRouter with UNIVERSAL_ROUTER type
  const route = await alphaRouter.route(
    inputAmount,
    outputToken,
    exactIn ? TradeType.EXACT_INPUT : TradeType.EXACT_OUTPUT,
    {
      recipient: ethers.constants.AddressZero, // Dummy recipient for quote
      slippageTolerance,
      // Use SWAP_ROUTER_02 type for compatibility - the calldata will be sent to Universal Router later
      type: SwapType.SWAP_ROUTER_02,
      deadline: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
    }
  );

  if (!route) {
    throw new Error(`Could not find a route between ${inputToken.symbol} and ${outputToken.symbol}`);
  }

  return route;
}

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const ethereum = await Ethereum.getInstance('base');
  let firstWalletAddress = '<ethereum-wallet-address>';
  
  try {
    firstWalletAddress = await ethereum.getFirstWalletAddress() || firstWalletAddress;
  } catch (error) {
    logger.warn('No wallets found for examples in schema');
  }

  fastify.get<{
    Querystring: GetSwapQuoteRequestType;
    Reply: GetSwapQuoteResponseType;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get a swap quote using Uniswap Universal Router',
        tags: ['uniswap'],
        querystring: {
          type: 'object',
          properties: {
            network: { type: 'string', default: 'base' },
            baseToken: { type: 'string', examples: ['WETH'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [0.001] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            slippagePct: { type: 'number', examples: [0.5] }
          },
          required: ['baseToken', 'quoteToken', 'amount', 'side']
        },
        response: {
          200: GetSwapQuoteResponse
        }
      }
    },
    async (request) => {
      try {
        const { 
          network, 
          baseToken: baseTokenSymbol, 
          quoteToken: quoteTokenSymbol, 
          amount, 
          side, 
          slippagePct 
        } = request.query;
        
        const networkToUse = network || 'base';

        // Validate essential parameters
        if (!baseTokenSymbol || !quoteTokenSymbol || !amount || !side) {
          throw fastify.httpErrors.badRequest('Missing required parameters');
        }
        
        // Get Uniswap and Ethereum instances
        const uniswap = await Uniswap.getInstance(networkToUse);
        const ethereum = await Ethereum.getInstance(networkToUse);
        
        // Resolve tokens
        const baseToken = uniswap.getTokenBySymbol(baseTokenSymbol);
        const quoteToken = uniswap.getTokenBySymbol(quoteTokenSymbol);

        if (!baseToken || !quoteToken) {
          throw fastify.httpErrors.badRequest(`Token not found: ${!baseToken ? baseTokenSymbol : quoteTokenSymbol}`);
        }

        // Determine which token is being traded
        const exactIn = side === 'SELL';
        const [inputToken, outputToken] = exactIn 
          ? [baseToken, quoteToken] 
          : [quoteToken, baseToken];

        // Convert amount to token units with decimals
        const inputAmount = CurrencyAmount.fromRawAmount(
          inputToken,
          JSBI.BigInt(Math.floor(amount * Math.pow(10, inputToken.decimals)).toString())
        );

        try {
          // Calculate slippage tolerance
          const slippageTolerance = slippagePct ? 
            new Percent(Math.floor(slippagePct * 100), 10000) : 
            new Percent(50, 10000); // 0.5% default slippage
          
          // Generate a Universal Router quote
          const route = await getUniversalRouterQuote(
            ethereum,
            inputToken,
            outputToken,
            inputAmount,
            exactIn,
            slippageTolerance
          );

          // Calculate estimated amounts
          const estimatedAmountIn = Number(formatTokenAmount(
            exactIn ? inputAmount.quotient.toString() : route.quote.quotient.toString(),
            inputToken.decimals
          ));
          
          const estimatedAmountOut = Number(formatTokenAmount(
            exactIn ? route.quote.quotient.toString() : inputAmount.quotient.toString(),
            outputToken.decimals
          ));

          // Calculate min/max values with slippage
          const slippageNumber = slippagePct ? slippagePct / 100 : 0.005; // 0.5% default
          const minAmountOut = exactIn ? 
            estimatedAmountOut * (1 - slippageNumber) : 
            estimatedAmountOut;
          
          const maxAmountIn = exactIn ? 
            estimatedAmountIn : 
            estimatedAmountIn * (1 + slippageNumber);

          // Calculate price
          const price = estimatedAmountOut / estimatedAmountIn;
          
          // Get gas estimate (default value if not available)
          const gasLimit = route.estimatedGasUsed?.toNumber() || 350000; // Universal Router typically needs more gas
          const gasPriceWei = await ethereum.provider.getGasPrice();
          const gasPrice = parseFloat(ethers.utils.formatUnits(gasPriceWei, 'gwei'));
          const gasCost = gasPrice * gasLimit * 1e-9; // Convert to ETH

          // Prepare balance changes
          const baseTokenBalanceChange = side === 'BUY' ? estimatedAmountOut : -estimatedAmountIn;
          const quoteTokenBalanceChange = side === 'BUY' ? -estimatedAmountIn : estimatedAmountOut;

          // Store route in app state for later use in execute-swap
          // This gets cached for a brief period to be used by execute-swap
          const cacheKey = `${networkToUse}-${baseTokenSymbol}-${quoteTokenSymbol}-${amount}-${side}`;
          fastify.decorate(`uniswapRouteCache_${cacheKey}`, {
            route,
            timestamp: Date.now(),
            // Cache expires after 2 minutes
            expiresAt: Date.now() + 120000
          });

          return {
            estimatedAmountIn,
            estimatedAmountOut,
            minAmountOut,
            maxAmountIn,
            price,
            baseTokenBalanceChange,
            quoteTokenBalanceChange,
            gasPrice,
            gasLimit,
            gasCost
          };
        } catch (error) {
          logger.error(`Router error: ${error.message}`);
          throw fastify.httpErrors.badRequest(`Failed to get quote with router: ${error.message}`);
        }
      } catch (e) {
        logger.error(`Quote swap error: ${e.message}`);
        if (e.statusCode) {
          throw e; // Re-throw if it's already a Fastify error
        } else {
          throw fastify.httpErrors.internalServerError(`Failed to get quote: ${e.message}`);
        }
      }
    }
  );
};

export default quoteSwapRoute;