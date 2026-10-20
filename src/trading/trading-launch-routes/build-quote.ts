import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { logger } from '../../services/logger';
import {
  BuildTransactionResponse,
  buildUnsigned,
  buildShapeFields,
  extraInstructionsField,
  priorityField,
} from '../build-common';
import { parseChainNetwork, rethrowRouteError, resolveWalletAddress } from '../common';
import { getLaunchOps } from '../connector-registry';

import { LaunchExecuteQuoteRequestSchema } from './execute-quote';

/**
 * The unsigned transaction /execute-quote would have signed for a cached launch-curve
 * quote. /build-swap quotes afresh and builds from that; this builds from the quote the
 * caller already holds, so what is signed is what was shown.
 */
export const LaunchBuildQuoteRequestSchema = Type.Object(
  {
    ...LaunchExecuteQuoteRequestSchema.properties,
    extraInstructions: extraInstructionsField(),
    ...buildShapeFields(),
    priority: priorityField(),
  },
  { $id: 'LaunchBuildQuoteRequest', additionalProperties: false },
);

type LaunchBuildQuoteRequest = Static<typeof LaunchBuildQuoteRequestSchema>;

export const buildQuoteRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: LaunchBuildQuoteRequest }>(
    '/build-quote',
    {
      schema: {
        description:
          'Build the unsigned transaction /trading/launch/execute-quote would sign for a cached launch-curve ' +
          'quote, for the caller to sign with its own wallet and broadcast via /chains/{chain}/submit.',
        tags: ['/trading/launch'],
        body: LaunchBuildQuoteRequestSchema,
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
      } = request.body;

      try {
        const { chain, network } = parseChainNetwork(chainNetwork);
        const walletAddress = resolveWalletAddress(chain, requestedWallet);
        logger.info(`[trading/launch] build quote ${quoteId} on ${chain}/${network} via ${connector}`);
        const ops = getLaunchOps(connector, chain);

        return await buildUnsigned(
          'solana', // launchpads are Solana-only: the launch registry refused any other chain above
          connector,
          { extraInstructions, feePayer, format, memo, references },
          () => ops.executeQuote(walletAddress, network, quoteId),
          priority,
        );
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to build launch quote transaction');
      }
    },
  );
};

export default buildQuoteRoute;
