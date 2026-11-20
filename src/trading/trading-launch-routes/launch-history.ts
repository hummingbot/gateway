import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { getLaunchHistory } from '../../connectors/pump/launch-routes/history';
import { chainNetworkField, connectorField, parseChainNetwork, rethrowRouteError } from '../common';
import { assertLaunchConnectorOnChain } from '../connector-registry';

/** Launchpads whose launch history Gateway reads. */
export const LAUNCH_HISTORY_CONNECTORS = ['pump'];

export const LaunchLaunchHistoryRequestSchema = Type.Object(
  {
    connector: connectorField(LAUNCH_HISTORY_CONNECTORS, 'Launchpad connector', { defaulted: false }),
    chainNetwork: chainNetworkField(),
    baseMint: Type.String({ description: 'The launched token' }),
    walletAddress: Type.Optional(
      Type.String({ description: "A wallet whose net SOL and token change each transaction reports (the launcher's)" }),
    ),
    maxTransactions: Type.Optional(
      Type.Integer({
        minimum: 1,
        maximum: 5000,
        default: 1000,
        description: 'Newest transactions to read; older ones are dropped and complete is false',
      }),
    ),
  },
  { $id: 'LaunchLaunchHistoryRequest', additionalProperties: false },
);

const Trade = Type.Object({
  venue: Type.String({ description: 'curve or pumpswap' }),
  side: Type.String({ description: 'BUY or SELL' }),
  user: Type.String(),
  baseAmount: Type.Number({ description: 'Tokens bought or sold' }),
  quoteAmount: Type.Number({ description: 'SOL the trader paid in or got out, fees included' }),
  creator: Type.String(),
  creatorFee: Type.Number({ description: "The creator's cut of this trade, in SOL" }),
});

export const LaunchHistoryResponse = Type.Object(
  {
    mint: Type.String(),
    creator: Type.String(),
    pumpswapPool: Type.String({ description: 'The canonical PumpSwap pool the token graduates to' }),
    complete: Type.Boolean({ description: 'False when maxTransactions cut the oldest history off' }),
    transactions: Type.Array(
      Type.Object({
        signature: Type.String(),
        blockTime: Type.Union([Type.Number(), Type.Null()]),
        kind: Type.String({ description: 'create, trade, migrate or other' }),
        trades: Type.Array(Trade),
        wallet: Type.Optional(
          Type.Object({
            quoteChange: Type.Number({ description: 'Net SOL (native + wrapped) change, fees and rent included' }),
            tokenChange: Type.Number({ description: 'Net change of the wallet balance of this token' }),
            signer: Type.Boolean(),
          }),
        ),
      }),
      { description: 'Oldest first' },
    ),
  },
  { $id: 'LaunchHistoryResponse' },
);

export const launchHistoryRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: Static<typeof LaunchLaunchHistoryRequestSchema> }>(
    '/launch-history',
    {
      schema: {
        description:
          "A launched token's creation and every trade on its curve and graduated pool, each with the creator fee " +
          "it paid, plus one wallet's flows per transaction — the ledger a launch's P&L is computed from",
        tags: ['/trading/launch'],
        querystring: LaunchLaunchHistoryRequestSchema,
        response: { 200: LaunchHistoryResponse },
      },
    },
    async (request) => {
      const { connector, chainNetwork, baseMint, walletAddress, maxTransactions } = request.query;
      try {
        const { chain, network } = parseChainNetwork(chainNetwork);
        assertLaunchConnectorOnChain(connector, chain);
        return await getLaunchHistory(network, baseMint, walletAddress, maxTransactions ?? 1000);
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to read the launch history');
      }
    },
  );
};

export default launchHistoryRoute;
