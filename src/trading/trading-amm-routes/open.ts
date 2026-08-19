import { Static, Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { openPosition as meteoraOpenPosition } from '../../connectors/meteora/amm-routes/openPosition';
import { OpenPositionResponse, OpenPositionResponseType } from '../../schemas/amm-schema';
import { httpErrors } from '../../services/error-handler';
import {
  AMM_CONNECTORS,
  chainNetworkField,
  connectorField,
  defaultWallet,
  parseChainNetwork,
  rethrowRouteError,
  slippagePctField,
} from '../common';

// Open a NEW AMM position and seed it with liquidity — the counterpart of
// /trading/clmm/open, minus the price range a concentrated position needs.
//
// Only AMMs whose positions are discrete accounts can open one. On Meteora DAMM v2
// positions are NFTs, so opening mints the position and locks rent for it. Fungible-LP
// AMMs (raydium, uniswap, pancakeswap) issue LP tokens against the pool and have no
// position to open, so they are rejected here and pointed at add.
const UnifiedAmmOpenPositionRequest = Type.Object({
  connector: connectorField(AMM_CONNECTORS, 'AMM connector (only non-fungible-LP AMMs supported: meteora)'),
  chainNetwork: chainNetworkField(),
  walletAddress: Type.String({ description: 'Wallet that will own the position', default: defaultWallet }),
  poolAddress: Type.String({ description: 'Pool to open the position in' }),
  baseTokenAmount: Type.Number({ format: 'decimal', description: 'Amount of base token to deposit' } as any),
  quoteTokenAmount: Type.Number({ format: 'decimal', description: 'Amount of quote token to deposit' } as any),
  slippagePct: slippagePctField(),
});

export const openPositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof UnifiedAmmOpenPositionRequest>;
    Reply: OpenPositionResponseType;
  }>(
    '/open',
    {
      schema: {
        description:
          'Open a new AMM position with initial liquidity. Supported only for non-fungible-LP AMMs ' +
          '(meteora DAMM v2), whose positions are NFTs. Fungible-LP AMMs (raydium, uniswap, ' +
          'pancakeswap) have no position to open — use add instead.',
        tags: ['/trading/amm'],
        body: UnifiedAmmOpenPositionRequest,
        response: { 200: OpenPositionResponse },
      },
    },
    async (request) => {
      try {
        const { connector, chainNetwork, walletAddress, poolAddress, baseTokenAmount, quoteTokenAmount, slippagePct } =
          request.body;
        const { network } = parseChainNetwork(chainNetwork);

        switch (connector) {
          case 'meteora':
            return await meteoraOpenPosition(
              network,
              walletAddress,
              poolAddress,
              baseTokenAmount,
              quoteTokenAmount,
              slippagePct,
            );
          case 'raydium':
          case 'uniswap':
          case 'pancakeswap':
            throw httpErrors.badRequest(
              `open is not supported for ${connector}: fungible-LP AMMs issue LP tokens against the ` +
                'pool and have no position to open. Use add instead.',
            );
          default:
            throw httpErrors.badRequest(
              `Unsupported AMM connector: ${connector}. Supported: ${AMM_CONNECTORS.join(', ')}`,
            );
        }
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to open AMM position');
      }
    },
  );
};

export default openPositionRoute;
