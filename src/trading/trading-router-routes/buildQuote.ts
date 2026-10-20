import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../chains/solana/solana';
import { logger } from '../../services/logger';
import {
  BuildTransactionResponse,
  buildUnsigned,
  buildShapeFields,
  extraInstructionsField,
  priorityField,
} from '../build-common';
import {
  chainNetworkField,
  connectorField,
  parseChainNetwork,
  rethrowRouteError,
  resolveSwapConnector,
  resolveWalletAddress,
  walletAddressField,
} from '../common';
import { ROUTER_CONNECTORS, getRouterOps } from '../connector-registry';
import { platformFeeField, routerPlatformFee } from '../platform-fee';

/**
 * The unsigned transaction /execute-quote would have signed for a cached quote: the
 * exact route the caller was shown, built for its own wallet to sign. /build-swap
 * quotes afresh and builds from that; this builds from the quote the caller already
 * holds, so what is signed is what was shown — and a quote that has expired is an
 * error, never a silent re-quote.
 */
export const RouterBuildQuoteRequestSchema = Type.Object(
  {
    chainNetwork: chainNetworkField(),
    connector: Type.Optional(
      connectorField(ROUTER_CONNECTORS, "Router connector. Defaults to the network's swapProvider", {
        defaulted: false,
      }),
    ),
    walletAddress: walletAddressField('Wallet address the transaction is built for'),
    quoteId: Type.String({ description: 'ID of a quote returned by /trading/router/quote-swap' }),
    extraInstructions: extraInstructionsField(),
    ...buildShapeFields(),
    priority: priorityField(),
    platformFee: platformFeeField(
      "Jupiter only: the quote's platform fee (it must have been quoted with platformFeeBps = bps), paid by " +
        "Jupiter into recipient's account for the input mint, which the transaction creates first if missing.",
    ),
  },
  { $id: 'RouterBuildQuoteRequest', additionalProperties: false },
);

type RouterBuildQuoteRequest = Static<typeof RouterBuildQuoteRequestSchema>;

export const buildQuoteRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/build-quote',
    {
      schema: {
        description:
          'Build the unsigned transaction /trading/router/execute-quote would sign for a cached quote, for ' +
          'the caller to sign with its own wallet and broadcast via /chains/{chain}/submit.',
        tags: ['/trading/router'],
        body: RouterBuildQuoteRequestSchema,
        response: { 200: BuildTransactionResponse },
      },
    },
    async (request) => {
      const {
        chainNetwork,
        connector,
        walletAddress: requestedWallet,
        quoteId,
        extraInstructions,
        feePayer,
        format,
        memo,
        references,
        priority,
        platformFee,
      } = request.body as RouterBuildQuoteRequest;

      try {
        const { chain, network } = parseChainNetwork(chainNetwork);
        const name = resolveSwapConnector(chain, network, 'router', connector);
        const walletAddress = resolveWalletAddress(chain, requestedWallet);

        logger.info(`[trading/router] build quote ${quoteId} on ${chain}/${network} via ${name}`);

        const fee = platformFee
          ? await routerPlatformFee(name, await Solana.getInstance(network), walletAddress, quoteId, platformFee)
          : undefined;

        const built = await buildUnsigned(
          chain,
          name,
          { extraInstructions, feePayer, format, memo, references },
          () =>
            fee?.feeAccount
              ? getRouterOps(name, chain).executeQuote(walletAddress, network, quoteId, fee.feeAccount)
              : getRouterOps(name, chain).executeQuote(walletAddress, network, quoteId),
          priority,
          fee?.platform,
        );
        return fee ? { ...built, platformFee: fee.charged } : built;
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to build quote transaction');
      }
    },
  );
};

export default buildQuoteRoute;
