import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { addLiquidity as meteoraAddLiquidity } from '../../connectors/meteora/amm-routes/addLiquidity';
import { addLiquidity as pancakeswapAddLiquidity } from '../../connectors/pancakeswap/amm-routes/addLiquidity';
import { addLiquidity as raydiumAddLiquidity } from '../../connectors/raydium/amm-routes/addLiquidity';
import { addLiquidity as uniswapAddLiquidity } from '../../connectors/uniswap/amm-routes/addLiquidity';
import { AddLiquidityResponse, AddLiquidityResponseType } from '../../schemas/amm-schema';
import { httpErrors } from '../../services/error-handler';
import {
  AMM_CONNECTORS,
  chainNetworkField,
  connectorField,
  defaultWallet,
  parseChainNetwork,
  rethrowRouteError,
} from '../common';

const UnifiedAmmAddLiquidityRequest = Type.Object({
  connector: connectorField(AMM_CONNECTORS, 'AMM connector'),
  chainNetwork: chainNetworkField(),
  walletAddress: Type.String({ description: 'Wallet address', default: defaultWallet }),
  poolAddress: Type.String({ description: 'Pool contract address' }),
  baseTokenAmount: Type.Number({ description: 'Amount of base token to add' }),
  quoteTokenAmount: Type.Number({ description: 'Amount of quote token to add' }),
  positionAddress: Type.Optional(
    Type.String({
      description:
        'meteora only (DAMM v2 positions are NFTs): add to this specific position. Omit to open a new ' +
        'position. Ignored by fungible-LP AMMs.',
    }),
  ),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      default: 1,
      examples: [1],
    }),
  ),
});

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof UnifiedAmmAddLiquidityRequest>;
    Reply: AddLiquidityResponseType;
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to an AMM pool from any supported connector',
        tags: ['/trading/amm'],
        body: UnifiedAmmAddLiquidityRequest,
        response: { 200: AddLiquidityResponse },
      },
    },
    async (request) => {
      try {
        const {
          connector,
          chainNetwork,
          walletAddress,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          positionAddress,
          slippagePct,
        } = request.body;
        const { network } = parseChainNetwork(chainNetwork);
        switch (connector) {
          case 'meteora':
            return await meteoraAddLiquidity(
              network,
              walletAddress,
              poolAddress,
              baseTokenAmount,
              quoteTokenAmount,
              slippagePct,
              positionAddress,
            );
          case 'raydium':
            return await raydiumAddLiquidity(
              network,
              walletAddress,
              poolAddress,
              baseTokenAmount,
              quoteTokenAmount,
              slippagePct,
            );
          case 'uniswap':
            return await uniswapAddLiquidity(
              network,
              walletAddress,
              poolAddress,
              baseTokenAmount,
              quoteTokenAmount,
              slippagePct,
            );
          case 'pancakeswap':
            return await pancakeswapAddLiquidity(
              network,
              walletAddress,
              poolAddress,
              baseTokenAmount,
              quoteTokenAmount,
              slippagePct,
            );
          default:
            throw httpErrors.badRequest(
              `Unsupported AMM connector: ${connector}. Supported: ${AMM_CONNECTORS.join(', ')}`,
            );
        }
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to add AMM liquidity');
      }
    },
  );
};

export default addLiquidityRoute;
