import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../chains/solana/solana';
import { RouterQuoteSwapResponseSchema } from '../../schemas/chain-schema';
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
import { appendedPlatformFee, platformFeeField, toPublicKey } from '../platform-fee';

import { LaunchExecuteSwapRequestSchema } from './execute-swap';

export const LaunchBuildSwapRequestSchema = Type.Object(
  {
    ...LaunchExecuteSwapRequestSchema.properties,
    extraInstructions: extraInstructionsField(),
    ...buildShapeFields(),
    priority: priorityField(),
    platformFee: platformFeeField(
      'A platform fee of bps of the quoted input amount, in the input token, paid to recipient in the same ' +
        'transaction (after the trade).',
    ),
  },
  { $id: 'LaunchBuildSwapRequest', additionalProperties: false },
);

type LaunchBuildSwapRequest = Static<typeof LaunchBuildSwapRequestSchema>;

/**
 * The transaction plus the quote it embeds. A launch curve moves with every trade,
 * so the signer — a wallet buying into a token it just created, say —
 * needs the exact quote the transaction was built from rather than
 * whatever the curve says by the time it signs.
 */
export const LaunchBuildSwapResponseSchema = Type.Composite(
  [
    BuildTransactionResponse,
    Type.Object({
      quote: RouterQuoteSwapResponseSchema,
    }),
  ],
  { $id: 'LaunchBuildSwapResponse' },
);
type LaunchBuildSwapResponse = Static<typeof LaunchBuildSwapResponseSchema>;

export const buildSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: LaunchBuildSwapRequest; Reply: LaunchBuildSwapResponse }>(
    '/build-swap',
    {
      schema: {
        description:
          "Quote a swap on a launchpad's curve and build its unsigned transaction, for the caller to sign " +
          'with its own wallet and broadcast via /chains/{chain}/submit. The response carries the exact quote ' +
          'the transaction embeds, so the signer can verify price and slippage before signing.',
        tags: ['/trading/launch'],
        body: LaunchBuildSwapRequestSchema,
        response: { 200: LaunchBuildSwapResponseSchema },
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
        const walletAddress = resolveWalletAddress(chain, requestedWallet);
        logger.info(
          `[trading/launch] build ${side} ${amount} ${baseToken}-${quoteToken} on ${chain}/${network} via ${connector}`,
        );
        const ops = getLaunchOps(connector, chain);

        // Quote first, then build the transaction FROM that quote (execute-quote
        // resolves it by id), so the quote in the response is the one the
        // transaction embeds.
        const quote = await ops.quoteSwap({
          network,
          baseToken,
          quoteToken,
          amount,
          side: side as 'BUY' | 'SELL',
          slippagePct,
          walletAddress,
        });

        const fee = platformFee
          ? await appendedPlatformFee(
              await Solana.getInstance(network),
              toPublicKey(walletAddress, 'walletAddress'),
              toPublicKey(quote.tokenIn, 'quoted tokenIn'),
              Number(quote.amountIn),
              platformFee,
            )
          : undefined;

        const built = await buildUnsigned(
          chain,
          connector,
          { extraInstructions, feePayer, format, memo, references },
          () => ops.executeQuote(walletAddress, network, quote.quoteId),
          priority,
          fee?.platform,
        );

        return reply.code(200).send({ ...built, quote, ...(fee ? { platformFee: fee.charged } : {}) });
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to build launch swap transaction');
      }
    },
  );
};

export default buildSwapRoute;
