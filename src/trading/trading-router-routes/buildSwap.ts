import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../chains/solana/solana';
import { RouterQuoteSwapResponseSchema } from '../../schemas/chain-schema';
import { logger } from '../../services/logger';
import {
  assertBuildFields,
  BuildTransactionResponse,
  buildUnsigned,
  EvmBuildTransactionResponse,
  buildShapeFields,
  extraInstructionsField,
  priorityField,
} from '../build-common';
import { parseChainNetwork, rethrowRouteError, resolveSwapConnector, resolveWalletAddress } from '../common';
import { getRouterOps } from '../connector-registry';
import { assertRouterPlatformFee, platformFeeField, recordRouterFeeQuote, routerPlatformFee } from '../platform-fee';

import { RouterExecuteSwapRequestSchema } from './executeSwap';

export const RouterBuildSwapRequestSchema = Type.Object(
  {
    ...RouterExecuteSwapRequestSchema.properties,
    extraInstructions: extraInstructionsField(),
    ...buildShapeFields(),
    priority: priorityField(),
    platformFee: platformFeeField(
      'Jupiter only: a platform fee of bps of the input, quoted with it and paid by Jupiter into ' +
        "recipient's account for the input mint, which the transaction creates first if missing.",
    ),
  },
  { $id: 'RouterBuildSwapRequest', additionalProperties: false },
);

type RouterBuildSwapRequest = Static<typeof RouterBuildSwapRequestSchema>;

/**
 * The transaction plus the quote it embeds. Unlike /execute-swap — where the connector
 * silently re-quotes and the caller never sees what it committed to — build returns the
 * exact quote the transaction was built from, so the signer can enforce its own price
 * and slippage checks before signing.
 */
export const RouterBuildSwapResponseSchema = Type.Union(
  [
    Type.Composite([BuildTransactionResponse, Type.Object({ quote: RouterQuoteSwapResponseSchema })]),
    Type.Composite([EvmBuildTransactionResponse, Type.Object({ quote: RouterQuoteSwapResponseSchema })]),
  ],
  {
    $id: 'RouterBuildSwapResponse',
    description: 'The build (Solana or EVM shape, by chain) plus the quote its transaction embeds.',
  },
);
type RouterBuildSwapResponse = Static<typeof RouterBuildSwapResponseSchema>;

export const buildSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: RouterBuildSwapRequest; Reply: RouterBuildSwapResponse }>(
    '/build-swap',
    {
      schema: {
        description:
          'Quote a swap and build its unsigned transaction, for the caller to sign with its own wallet ' +
          'and broadcast via /chains/{chain}/submit. The response carries the exact quote the transaction ' +
          'embeds, so the signer can verify price and slippage before signing.',
        tags: ['/trading/router'],
        body: RouterBuildSwapRequestSchema,
        response: { 200: RouterBuildSwapResponseSchema },
      },
    },
    async (request, reply) => {
      const {
        chainNetwork,
        connector,
        walletAddress: requestedWallet,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct,
        approximateIfNoExactOut,
        extraInstructions,
        feePayer,
        format,
        memo,
        references,
        priority,
        platformFee,
      } = request.body;

      try {
        const { chain, network } = parseChainNetwork(chainNetwork);
        assertBuildFields(chain, { extraInstructions, feePayer, format, memo, references, priority, platformFee });
        const name = resolveSwapConnector(chain, network, 'router', connector);
        const walletAddress = resolveWalletAddress(chain, requestedWallet);

        logger.info(
          `[trading/router] build ${side} ${amount} ${baseToken}-${quoteToken} on ${chain}/${network} via ${name}`,
        );

        const ops = getRouterOps(name, chain);
        if (platformFee) assertRouterPlatformFee(name);

        // Quote first, then build the transaction FROM that quote (execute-quote resolves
        // it by id), so the quote in the response is the one the transaction embeds.
        const quote = await ops.quoteSwap({
          network,
          baseToken,
          quoteToken,
          amount,
          side: side as 'BUY' | 'SELL',
          slippagePct,
          approximateIfNoExactOut,
          walletAddress,
          platformFeeBps: platformFee?.bps,
        });
        if (platformFee) recordRouterFeeQuote(name, quote, platformFee.bps);

        const fee = platformFee
          ? await routerPlatformFee(name, await Solana.getInstance(network), walletAddress, quote.quoteId, platformFee)
          : undefined;

        const built = await buildUnsigned(
          chain,
          name,
          { extraInstructions, feePayer, format, memo, references },
          () =>
            fee?.feeAccount
              ? ops.executeQuote(walletAddress, network, quote.quoteId, fee.feeAccount)
              : ops.executeQuote(walletAddress, network, quote.quoteId),
          priority,
          fee?.platform,
        );

        return reply.code(200).send({ ...built, quote, ...(fee ? { platformFee: fee.charged } : {}) });
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to build swap transaction');
      }
    },
  );
};

export default buildSwapRoute;
