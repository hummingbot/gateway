import { BigNumber } from 'ethers';
import { FastifyPluginAsync } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  GetSwapQuoteRequest,
  GetSwapQuoteResponse,
  GetSwapQuoteRequestType,
  GetSwapQuoteResponseType,
} from '../../../schemas/swap-schema';
import { logger } from '../../../services/logger';
import { ZeroX } from '../0x';
import { ZeroXConfig } from '../0x.config';

export const quoteSwapRoute: FastifyPluginAsync = async (fastify, _options) => {
  // Import the httpErrors plugin to ensure it's available
  await fastify.register(require('@fastify/sensible'));

  // Get first wallet address for example
  const walletAddressExample = await Ethereum.getWalletAddressExample();

  // Get available networks from 0x configuration
  const networks = ZeroXConfig.networks.mainnet.availableNetworks;

  fastify.get<{
    Querystring: GetSwapQuoteRequestType;
    Reply: GetSwapQuoteResponseType;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get a swap quote from 0x DEX aggregator',
        tags: ['0x'],
        querystring: {
          ...GetSwapQuoteRequest,
          properties: {
            ...GetSwapQuoteRequest.properties,
            network: { type: 'string', default: 'mainnet', enum: networks },
            walletAddress: { type: 'string', examples: [walletAddressExample] },
            baseToken: { type: 'string', examples: ['WETH'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [0.1] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            slippagePct: { type: 'number', examples: [0.5] },
          },
        },
        response: {
          200: GetSwapQuoteResponse,
        },
      },
    },
    async (request, reply) => {
      try {
        logger.info(
          `Received quote-swap request: ${JSON.stringify(request.query)}`,
        );

        const {
          network = 'mainnet',
          baseToken: baseTokenSymbol,
          quoteToken: quoteTokenSymbol,
          amount,
          side,
          slippagePct,
        } = request.query;

        // Validate essential parameters
        if (!baseTokenSymbol || !quoteTokenSymbol || !amount || !side) {
          logger.error('Missing required parameters in request');
          return reply.badRequest('Missing required parameters');
        }

        // Get Ethereum instance for the network
        const ethereum = await Ethereum.getInstance(network);

        // Get wallet address - use first available
        const walletAddress = await Ethereum.getFirstWalletAddress();
        if (!walletAddress) {
          return reply.badRequest('No default wallet found');
        }
        logger.info(`Using first available wallet address: ${walletAddress}`);

        // Get token information
        const baseToken = await ethereum.getTokenBySymbol(baseTokenSymbol);
        const quoteToken = await ethereum.getTokenBySymbol(quoteTokenSymbol);

        if (!baseToken) {
          logger.error(`Base token not found: ${baseTokenSymbol}`);
          return reply.notFound(`Token not found: ${baseTokenSymbol}`);
        }

        if (!quoteToken) {
          logger.error(`Quote token not found: ${quoteTokenSymbol}`);
          return reply.notFound(`Token not found: ${quoteTokenSymbol}`);
        }

        // Get 0x instance
        const zeroX = await ZeroX.getInstance(network);

        // Determine input/output tokens based on side
        let sellToken: string;
        let buyToken: string;
        let sellAmount: string | undefined;
        let buyAmount: string | undefined;

        if (side === 'SELL') {
          // SELL means we're selling the base token for quote token
          sellToken = baseToken.address;
          buyToken = quoteToken.address;
          sellAmount = zeroX.parseTokenAmount(amount, baseToken.decimals);
        } else {
          // BUY means we're buying the base token with quote token
          sellToken = quoteToken.address;
          buyToken = baseToken.address;
          buyAmount = zeroX.parseTokenAmount(amount, baseToken.decimals);
        }

        // Get quote from 0x
        const slippagePercentage =
          slippagePct !== undefined
            ? zeroX.convertSlippageToPercentage(slippagePct)
            : zeroX.convertSlippageToPercentage(zeroX.allowedSlippage * 100);

        const priceResponse = await zeroX.getPrice({
          sellToken,
          buyToken,
          sellAmount,
          buyAmount,
          takerAddress: walletAddress,
          slippagePercentage,
        });

        // Calculate balance changes based on side
        let baseTokenBalanceChange: number;
        let quoteTokenBalanceChange: number;

        if (side === 'SELL') {
          // Selling base token: base decreases, quote increases
          baseTokenBalanceChange = -amount;
          quoteTokenBalanceChange = Number(
            zeroX.formatTokenAmount(
              priceResponse.buyAmount,
              quoteToken.decimals,
            ),
          );
        } else {
          // Buying base token: base increases, quote decreases
          baseTokenBalanceChange = amount;
          quoteTokenBalanceChange = -Number(
            zeroX.formatTokenAmount(
              priceResponse.sellAmount,
              quoteToken.decimals,
            ),
          );
        }

        // Calculate price based on the amounts
        const price =
          side === 'SELL'
            ? quoteTokenBalanceChange / amount
            : Math.abs(quoteTokenBalanceChange) / amount;

        // Extract gas information
        const estimatedGas = parseInt(
          priceResponse.estimatedGas || priceResponse.gas,
        );
        const gasPrice = Number(
          zeroX.formatTokenAmount(priceResponse.gasPrice, 9), // Gas price is in gwei (9 decimals)
        );

        // Calculate estimated amounts based on side
        let estimatedAmountIn: number;
        let estimatedAmountOut: number;
        let minAmountOut: number;
        let maxAmountIn: number;

        if (side === 'SELL') {
          estimatedAmountIn = amount;
          estimatedAmountOut = Number(
            zeroX.formatTokenAmount(
              priceResponse.buyAmount,
              quoteToken.decimals,
            ),
          );
          minAmountOut = estimatedAmountOut; // 0x already accounts for slippage
          maxAmountIn = amount;
        } else {
          estimatedAmountOut = amount;
          estimatedAmountIn = Number(
            zeroX.formatTokenAmount(
              priceResponse.sellAmount,
              quoteToken.decimals,
            ),
          );
          minAmountOut = amount;
          maxAmountIn = estimatedAmountIn; // 0x already accounts for slippage
        }

        return {
          price,
          baseTokenBalanceChange,
          quoteTokenBalanceChange,
          computeUnits: estimatedGas,
          estimatedAmountIn,
          estimatedAmountOut,
          minAmountOut,
          maxAmountIn,
        };
      } catch (e: any) {
        logger.error(`Quote swap error: ${e.message}`);
        if (e.stack) {
          logger.debug(`Error stack: ${e.stack}`);
        }

        if (e.message.includes('0x API Error:')) {
          // Handle specific 0x API errors
          if (e.message.includes('Invalid token')) {
            return reply.notFound(e.message);
          }
          if (e.message.includes('Insufficient liquidity')) {
            return reply.badRequest(e.message);
          }
          return reply.badRequest(e.message);
        }

        return reply.internalServerError(`Failed to get quote: ${e.message}`);
      }
    },
  );
};

export default quoteSwapRoute;
