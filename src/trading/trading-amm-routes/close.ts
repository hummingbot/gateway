import { Static, Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { closePosition as meteoraClosePosition } from '../../connectors/meteora/amm-routes/closePosition';
import { removeLiquidity as pancakeswapRemoveLiquidity } from '../../connectors/pancakeswap/amm-routes/removeLiquidity';
import { removeLiquidity as raydiumRemoveLiquidity } from '../../connectors/raydium/amm-routes/removeLiquidity';
import { removeLiquidity as uniswapRemoveLiquidity } from '../../connectors/uniswap/amm-routes/removeLiquidity';
import {
  ClosePositionResponse,
  ClosePositionResponseType,
  RemoveLiquidityResponseType,
} from '../../schemas/amm-schema';
import { httpErrors } from '../../services/error-handler';
import {
  AMM_CONNECTORS,
  chainNetworkField,
  connectorField,
  defaultWallet,
  parseChainNetwork,
  rethrowRouteError,
  withIdentifiers,
  slippagePctField,
} from '../common';

// Close a position completely — the counterpart of /trading/clmm/close.
//
// On Meteora DAMM v2 this is a distinct on-chain operation, not remove at 100%:
// withdrawing all the liquidity leaves the position NFT behind still holding its
// rent, so close withdraws AND closes the account, and reports the rent that came
// back. A fungible-LP AMM (raydium, uniswap, pancakeswap) has no position account —
// its liquidity is LP tokens — so closing is exactly a full withdrawal, and the
// route performs that remove and reports 0 rent refunded because none was held.
const UnifiedAmmClosePositionRequest = Type.Object({
  connector: connectorField(AMM_CONNECTORS, 'AMM connector'),
  chainNetwork: chainNetworkField(),
  walletAddress: Type.String({ description: 'Wallet that owns the position', default: defaultWallet }),
  poolAddress: Type.String({ description: 'Pool the position belongs to' }),
  positionAddress: Type.Optional(
    Type.String({
      description:
        'Position to close. Required on AMMs whose positions are discrete accounts (meteora DAMM v2), where a wallet may hold several per pool. Ignored by fungible-LP AMMs, which hold one LP balance per pool.',
      'x-connectors': ['meteora'],
    } as any),
  ),
  slippagePct: slippagePctField('Maximum acceptable slippage on the withdrawn amounts.'),
});

/**
 * Re-frame a fungible-LP full withdrawal as a close. No position account existed, so
 * no rent was held and none comes back — the zero is a fact about the AMM, not a
 * placeholder for a value we failed to read.
 */
const asClosed = (removed: RemoveLiquidityResponseType): ClosePositionResponseType =>
  removed.data
    ? {
        signature: removed.signature,
        status: removed.status,
        data: {
          fee: removed.data.fee,
          positionRentRefunded: 0,
          baseTokenAmountRemoved: removed.data.baseTokenAmountRemoved,
          quoteTokenAmountRemoved: removed.data.quoteTokenAmountRemoved,
        },
      }
    : { signature: removed.signature, status: removed.status };

export const closePositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof UnifiedAmmClosePositionRequest>;
    Reply: ClosePositionResponseType;
  }>(
    '/close',
    {
      schema: {
        description:
          "Withdraw all of a position's liquidity. On AMMs whose positions are discrete accounts " +
          '(meteora DAMM v2) this also closes the position account and refunds its rent; on fungible-LP ' +
          'AMMs (raydium, uniswap, pancakeswap) it withdraws the full LP balance and refunds no rent.',
        tags: ['/trading/amm'],
        body: UnifiedAmmClosePositionRequest,
        response: { 200: ClosePositionResponse },
      },
    },
    async (request) => {
      try {
        const { connector, chainNetwork, walletAddress, poolAddress, positionAddress, slippagePct } = request.body;
        const { network } = parseChainNetwork(chainNetwork);

        const result = await (async () => {
          switch (connector) {
            case 'meteora':
              // DAMM v2 positions are NFTs and a wallet may hold several per pool, so
              // there is no "the" position to infer — the caller must name it.
              if (!positionAddress) {
                throw httpErrors.badRequest(
                  'positionAddress is required for meteora: DAMM v2 positions are NFTs and a wallet may ' +
                    'hold several per pool. List them with position-info or positions-owned.',
                );
              }
              return await meteoraClosePosition(network, walletAddress, poolAddress, positionAddress, slippagePct);
            case 'raydium':
              return asClosed(await raydiumRemoveLiquidity(network, walletAddress, poolAddress, 100, slippagePct));
            case 'uniswap':
              return asClosed(await uniswapRemoveLiquidity(network, walletAddress, poolAddress, 100, slippagePct));
            case 'pancakeswap':
              return asClosed(await pancakeswapRemoveLiquidity(network, walletAddress, poolAddress, 100, slippagePct));
            default:
              throw httpErrors.badRequest(
                `Unsupported AMM connector: ${connector}. Supported: ${AMM_CONNECTORS.join(', ')}`,
              );
          }
        })();

        return withIdentifiers(result, { poolAddress, positionAddress });
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to close AMM position');
      }
    },
  );
};

export default closePositionRoute;
