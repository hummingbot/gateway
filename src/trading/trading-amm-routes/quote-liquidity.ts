import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { quoteLiquidity as meteoraQuoteLiquidity } from '../../connectors/meteora/amm-routes/quoteLiquidity';
import { quoteLiquidity as pancakeswapQuoteLiquidity } from '../../connectors/pancakeswap/amm-routes/quoteLiquidity';
import { quoteLiquidity as raydiumQuoteLiquidity } from '../../connectors/raydium/amm-routes/quoteLiquidity';
import { quoteLiquidity as uniswapQuoteLiquidity } from '../../connectors/uniswap/amm-routes/quoteLiquidity';
import { QuoteLiquidityResponse, QuoteLiquidityResponseType } from '../../schemas/amm-schema';
import { httpErrors } from '../../services/error-handler';
import { AMM_CONNECTORS, chainNetworkField, connectorField, parseChainNetwork, rethrowRouteError } from '../common';

const UnifiedAmmQuoteLiquidityRequest = Type.Object({
  connector: connectorField(AMM_CONNECTORS, 'AMM connector'),
  chainNetwork: chainNetworkField(),
  poolAddress: Type.String({ description: 'Pool contract address' }),
  baseTokenAmount: Type.Number({ description: 'Amount of base token to deposit' }),
  quoteTokenAmount: Type.Number({ description: 'Amount of quote token to deposit' }),
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

export const quoteLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: Static<typeof UnifiedAmmQuoteLiquidityRequest>;
    Reply: QuoteLiquidityResponseType;
  }>(
    '/quote-liquidity',
    {
      schema: {
        description: 'Quote amounts for adding liquidity to an AMM pool from any supported connector',
        tags: ['/trading/amm'],
        querystring: UnifiedAmmQuoteLiquidityRequest,
        response: { 200: QuoteLiquidityResponse },
      },
    },
    async (request) => {
      try {
        const { connector, chainNetwork, poolAddress, baseTokenAmount, quoteTokenAmount, slippagePct } = request.query;
        const { network } = parseChainNetwork(chainNetwork);
        switch (connector) {
          case 'meteora':
            return await meteoraQuoteLiquidity(network, poolAddress, baseTokenAmount, quoteTokenAmount, slippagePct);
          case 'raydium':
            return await raydiumQuoteLiquidity(network, poolAddress, baseTokenAmount, quoteTokenAmount, slippagePct);
          case 'uniswap':
            return await uniswapQuoteLiquidity(network, poolAddress, baseTokenAmount, quoteTokenAmount, slippagePct);
          case 'pancakeswap':
            return await pancakeswapQuoteLiquidity(
              network,
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
        rethrowRouteError(e, 'Failed to quote AMM liquidity');
      }
    },
  );
};

export default quoteLiquidityRoute;
