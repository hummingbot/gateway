import { Static, Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { closePosition as meteoraClosePosition } from '../../connectors/meteora/amm-routes/closePosition';
import { ClosePositionResponse, ClosePositionResponseType } from '../../schemas/amm-schema';
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

// Close an AMM position completely — the counterpart of /trading/clmm/close.
//
// Distinct from remove at 100%: removing all the liquidity leaves the position
// account behind still holding its rent, while closing withdraws and closes the
// account, returning that rent to the wallet. Only AMMs with discrete position
// accounts (meteora DAMM v2) have anything to close.
const UnifiedAmmClosePositionRequest = Type.Object({
  connector: connectorField(AMM_CONNECTORS, 'AMM connector (only non-fungible-LP AMMs supported: meteora)'),
  chainNetwork: chainNetworkField(),
  walletAddress: Type.String({ description: 'Wallet that owns the position', default: defaultWallet }),
  poolAddress: Type.String({ description: 'Pool the position belongs to' }),
  positionAddress: Type.String({ description: 'Position to close' }),
  slippagePct: slippagePctField('Maximum acceptable slippage on the withdrawn amounts.'),
});

export const closePositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof UnifiedAmmClosePositionRequest>;
    Reply: ClosePositionResponseType;
  }>(
    '/close',
    {
      schema: {
        description:
          "Withdraw all of a position's liquidity and close the position account, refunding its rent. " +
          'Supported only for non-fungible-LP AMMs (meteora DAMM v2). Fungible-LP AMMs (raydium, ' +
          'uniswap, pancakeswap) have no position account — use remove with percentageToRemove 100.',
        tags: ['/trading/amm'],
        body: UnifiedAmmClosePositionRequest,
        response: { 200: ClosePositionResponse },
      },
    },
    async (request) => {
      try {
        const { connector, chainNetwork, walletAddress, poolAddress, positionAddress, slippagePct } = request.body;
        const { network } = parseChainNetwork(chainNetwork);

        switch (connector) {
          case 'meteora':
            return await meteoraClosePosition(network, walletAddress, poolAddress, positionAddress, slippagePct);
          case 'raydium':
          case 'uniswap':
          case 'pancakeswap':
            throw httpErrors.badRequest(
              `close is not supported for ${connector}: fungible-LP AMMs have no position account to ` +
                'close. Use remove with percentageToRemove 100 to withdraw everything.',
            );
          default:
            throw httpErrors.badRequest(
              `Unsupported AMM connector: ${connector}. Supported: ${AMM_CONNECTORS.join(', ')}`,
            );
        }
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to close AMM position');
      }
    },
  );
};

export default closePositionRoute;
