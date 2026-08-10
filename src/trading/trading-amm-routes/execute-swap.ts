import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { executeSwap as meteoraExecuteSwap } from '../../connectors/meteora/amm-routes/executeSwap';
import { executeSwap as pancakeswapExecuteSwap } from '../../connectors/pancakeswap/amm-routes/executeSwap';
import { executeSwap as raydiumExecuteSwap } from '../../connectors/raydium/amm-routes/executeSwap';
import { executeSwap as uniswapExecuteSwap } from '../../connectors/uniswap/amm-routes/executeSwap';
import { ExecuteSwapResponse, ExecuteSwapResponseType } from '../../schemas/amm-schema';
import { httpErrors } from '../../services/error-handler';
import { logger } from '../../services/logger';

import { AMM_CONNECTORS, parseChainNetwork, defaultWallet } from './common';

const UnifiedAmmExecuteSwapRequest = Type.Object({
  connector: Type.String({ description: 'AMM connector (meteora, raydium, uniswap)', default: 'meteora' }),
  chainNetwork: Type.String({
    description: 'Chain and network in format: chain-network (e.g., solana-mainnet-beta, ethereum-mainnet)',
    default: 'solana-mainnet-beta',
  }),
  walletAddress: Type.String({ description: 'Wallet address', default: defaultWallet }),
  poolAddress: Type.String({ description: 'Pool contract address' }),
  baseToken: Type.String({ description: 'Base token symbol or address (determines swap direction)' }),
  amount: Type.Number({ description: 'Amount denominated in the base token' }),
  side: Type.String({ description: 'Trade direction', enum: ['BUY', 'SELL'] }),
  slippagePct: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
});

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof UnifiedAmmExecuteSwapRequest>;
    Reply: ExecuteSwapResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a swap against a specific AMM pool from any supported connector',
        tags: ['/trading/amm'],
        body: UnifiedAmmExecuteSwapRequest,
        response: { 200: ExecuteSwapResponse },
      },
    },
    async (request) => {
      try {
        const { connector, chainNetwork, walletAddress, poolAddress, baseToken, amount, side, slippagePct } =
          request.body;
        const { network } = parseChainNetwork(chainNetwork);
        const s = side as 'BUY' | 'SELL';
        switch (connector) {
          case 'meteora':
            return await meteoraExecuteSwap(network, walletAddress, poolAddress, baseToken, s, amount, slippagePct);
          case 'raydium':
            return await raydiumExecuteSwap(network, walletAddress, poolAddress, baseToken, s, amount, slippagePct);
          case 'uniswap':
            return await uniswapExecuteSwap(network, walletAddress, poolAddress, baseToken, s, amount, slippagePct);
          case 'pancakeswap':
            return await pancakeswapExecuteSwap(network, walletAddress, poolAddress, baseToken, s, amount, slippagePct);
          default:
            throw httpErrors.badRequest(
              `Unsupported AMM connector: ${connector}. Supported: ${AMM_CONNECTORS.join(', ')}`,
            );
        }
      } catch (e: any) {
        logger.error('Failed to execute AMM swap:', e);
        if (e.statusCode) throw e;
        throw httpErrors.internalServerError('Failed to execute swap');
      }
    },
  );
};

export default executeSwapRoute;
