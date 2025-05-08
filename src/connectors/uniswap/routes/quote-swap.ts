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
import { AlphaRouter, SwapType } from '@uniswap/smart-order-router';
import { ethers } from 'ethers';
import JSBI from 'jsbi';

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: GetSwapQuoteRequestType;
    Reply: GetSwapQuoteResponseType;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get a swap quote using Uniswap V3 SmartOrderRouter',
        tags: ['uniswap'],
        body: GetSwapQuoteRequest,
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
        } = request.body;
        
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
          // Initialize AlphaRouter for optimal routing
          const alphaRouter = new AlphaRouter({
            chainId: ethereum.chainId,
            provider: ethereum.provider as ethers.providers.JsonRpcProvider,
          });

          // Generate a swap route
          const route = await alphaRouter.route(
            inputAmount,
            outputToken,
            exactIn ? TradeType.EXACT_INPUT : TradeType.EXACT_OUTPUT,
            {
              recipient: ethers.constants.AddressZero, // Dummy recipient for quote
              slippageTolerance: slippagePct ? 
                new Percent(Math.floor(slippagePct * 100), 10000) : 
                new Percent(50, 10000), // 0.5% default slippage
              deadline: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
              type: SwapType.SWAP_ROUTER_02
            }
          );

          if (!route) {
            throw fastify.httpErrors.badRequest(`Could not find a route for ${baseTokenSymbol}-${quoteTokenSymbol}`);
          }

          // Get expected and estimated amounts
          let estimatedAmountIn, estimatedAmountOut;
          
          // For SELL (exactIn), we know the exact input amount, output is estimated
          if (exactIn) {
            estimatedAmountIn = Number(formatTokenAmount(
              inputAmount.quotient.toString(),
              inputToken.decimals
            ));
            
            estimatedAmountOut = Number(formatTokenAmount(
              route.quote.quotient.toString(),
              outputToken.decimals
            ));
          } 
          // For BUY (exactOut), the output is exact, input is estimated
          else {
            estimatedAmountOut = Number(formatTokenAmount(
              inputAmount.quotient.toString(),
              outputToken.decimals
            ));
            
            estimatedAmountIn = Number(formatTokenAmount(
              route.quote.quotient.toString(), 
              inputToken.decimals
            ));
          }

          // Calculate min/max values
          const minAmountOut = exactIn ? estimatedAmountOut * (1 - (slippagePct || 0.5) / 100) : estimatedAmountOut;
          const maxAmountIn = exactIn ? estimatedAmountIn : estimatedAmountIn * (1 + (slippagePct || 0.5) / 100);

          // Calculate price
          const price = estimatedAmountOut / estimatedAmountIn;

          // Prepare balance changes
          const baseTokenBalanceChange = side === 'BUY' ? estimatedAmountOut : -estimatedAmountIn;
          const quoteTokenBalanceChange = side === 'BUY' ? -estimatedAmountIn : estimatedAmountOut;

          // Get gas estimate - if available
          const gasEstimate = route.estimatedGasUsed?.toString() || '200000'; // Default fallback
          const gasPriceWei = await ethereum.provider.getGasPrice();
          const gasPrice = parseFloat(ethers.utils.formatUnits(gasPriceWei, 'gwei'));
          const gasLimit = parseInt(gasEstimate);
          const gasCost = gasPrice * gasLimit * 1e-9; // Convert to ETH

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
        throw e.statusCode ? e : fastify.httpErrors.internalServerError(`Failed to get quote: ${e.message}`);
      }
    }
  );
};

export default quoteSwapRoute;