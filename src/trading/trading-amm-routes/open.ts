import { Static, Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { openPosition as meteoraOpenPosition } from '../../connectors/meteora/amm-routes/openPosition';
import { addLiquidity as pancakeswapAddLiquidity } from '../../connectors/pancakeswap/amm-routes/addLiquidity';
import { addLiquidity as raydiumAddLiquidity } from '../../connectors/raydium/amm-routes/addLiquidity';
import { addLiquidity as uniswapAddLiquidity } from '../../connectors/uniswap/amm-routes/addLiquidity';
import { AddLiquidityResponseType, OpenPositionResponse, OpenPositionResponseType } from '../../schemas/amm-schema';
import { httpErrors } from '../../services/error-handler';
import {
  AMM_CONNECTORS,
  chainNetworkField,
  connectorField,
  defaultWallet,
  resolveChainNetwork,
  rethrowRouteError,
  withIdentifiers,
  slippagePctField,
} from '../common';

// Open a position and seed it with liquidity — the counterpart of /trading/clmm/open,
// minus the price range a concentrated position needs.
//
// Every AMM answers this route, but "a position" means different things. On Meteora
// DAMM v2 a position is an NFT, so opening mints it and locks rent, and the response
// carries its address. A fungible-LP AMM (raydium, uniswap, pancakeswap) holds
// liquidity as LP tokens against the pool, so opening IS the first deposit: the route
// performs the same add and reports no position address and no rent, because none
// exists. Callers that do not care which kind of AMM they are on can therefore always
// open, and read positionAddress only when it is there.
export const UnifiedAmmOpenPositionRequest = Type.Object(
  {
    connector: connectorField(AMM_CONNECTORS, 'AMM connector'),
    chainNetwork: chainNetworkField(),
    walletAddress: Type.String({ description: 'Wallet that will own the position', default: defaultWallet }),
    poolAddress: Type.String({ description: 'Pool to open the position in' }),
    baseTokenAmount: Type.Number({ format: 'decimal', description: 'Amount of base token to deposit' } as any),
    quoteTokenAmount: Type.Number({ format: 'decimal', description: 'Amount of quote token to deposit' } as any),
    slippagePct: slippagePctField(),
  },
  { $id: 'AmmOpenRequest' },
);

/**
 * Re-frame a fungible-LP add as an open. No position account is created, so there is
 * no address to report and no rent was locked — the zero is a fact about the AMM, not
 * a placeholder for a value we failed to read.
 */
const asOpened = (added: AddLiquidityResponseType): OpenPositionResponseType =>
  added.data
    ? {
        signature: added.signature,
        status: added.status,
        data: {
          fee: added.data.fee,
          positionRent: 0,
          baseTokenAmountAdded: added.data.baseTokenAmountAdded,
          quoteTokenAmountAdded: added.data.quoteTokenAmountAdded,
        },
      }
    : { signature: added.signature, status: added.status };

export const openPositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof UnifiedAmmOpenPositionRequest>;
    Reply: OpenPositionResponseType;
  }>(
    '/open',
    {
      schema: {
        description:
          'Open a position with initial liquidity. On AMMs whose positions are discrete accounts ' +
          '(meteora DAMM v2) this mints the position and returns its address and rent; on fungible-LP ' +
          'AMMs (raydium, uniswap, pancakeswap) it performs the equivalent deposit and returns neither.',
        tags: ['/trading/amm'],
        body: UnifiedAmmOpenPositionRequest,
        response: { 200: OpenPositionResponse },
      },
    },
    async (request) => {
      try {
        const { connector, chainNetwork, walletAddress, poolAddress, baseTokenAmount, quoteTokenAmount, slippagePct } =
          request.body;
        const { network } = resolveChainNetwork(chainNetwork, connector, 'amm');
        const args = [network, walletAddress, poolAddress, baseTokenAmount, quoteTokenAmount, slippagePct] as const;

        const result = await (async () => {
          switch (connector) {
            case 'meteora':
              // Opens a NEW position NFT rather than adding to an existing one.
              return await meteoraOpenPosition(...args);
            case 'raydium':
              return asOpened(await raydiumAddLiquidity(...args));
            case 'uniswap':
              return asOpened(await uniswapAddLiquidity(...args));
            case 'pancakeswap':
              return asOpened(await pancakeswapAddLiquidity(...args));
            default:
              throw httpErrors.badRequest(
                `Unsupported AMM connector: ${connector}. Supported: ${AMM_CONNECTORS.join(', ')}`,
              );
          }
        })();

        return withIdentifiers(result, { poolAddress });
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to open AMM position');
      }
    },
  );
};

export default openPositionRoute;
