import { FastifyPluginAsync } from 'fastify';

import { ExecuteSwapRequestType, ExecuteSwapResponseType, ExecuteSwapResponse } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Osmosis } from '../osmosis';
import { executeSwap } from '../osmosis.swap';

export const executeSwapRoute: FastifyPluginAsync = async (fastify, _options) => {
  // Import the httpErrors plugin to ensure it's available
  await fastify.register(require('@fastify/sensible'));
  const walletAddressExample = await Osmosis.getWalletAddressExample();
  const { ConfigManagerV2 } = require('../../../services/config-manager-v2');
  const osmosisNetworks = ['testnet', 'mainnet'];

  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: ExecuteSwapResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a swap using Osmosis Order Router',
        tags: ['osmosis'],
        body: {
          type: 'object',
          properties: {
            network: {
              type: 'string',
              default: 'mainnet',
              enum: osmosisNetworks,
            },
            walletAddress: { type: 'string', examples: [walletAddressExample] },
            baseToken: { type: 'string', examples: ['WETH'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [0.001] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            slippagePct: { type: 'number', examples: [0.5] },
          },
          required: ['walletAddress', 'baseToken', 'quoteToken', 'amount', 'side'],
        },
        response: {
          200: ExecuteSwapResponse,
        },
      },
    },
    async (request, reply) => {
      try {
        // Log the request parameters for debugging
        logger.info(`Received execute-swap request: ${JSON.stringify(request.body)}`);
        const { baseToken: baseTokenSymbol, quoteToken: quoteTokenSymbol, amount, side, poolAddress } = request.body;

        // Validate essential parameters
        if (!poolAddress || !baseTokenSymbol || !quoteTokenSymbol || !amount || !side) {
          logger.error('Missing required parameters in request');
          return reply.badRequest('Missing required parameters');
        }

        const executeSwapResponse = await executeSwap(fastify, request.body, 'amm');
        return executeSwapResponse;
      } catch (e) {
        logger.error(`Execute swap error: ${e.message}`);
        if (e.stack) {
          logger.debug(`Error stack: ${e.stack}`);
        }

        if (e.code === 'UNPREDICTABLE_GAS_LIMIT') {
          return reply.badRequest('Transaction failed: Insufficient funds or gas estimation error');
        }

        return reply.internalServerError(`Failed to execute swap: ${e.message}`);
      }
    },
  );
};

export default executeSwapRoute;
