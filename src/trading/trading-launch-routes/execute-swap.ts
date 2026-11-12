import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { ChainExecuteSwapResponseSchema } from '../../schemas/chain-schema';
import { logger } from '../../services/logger';
import { ensureTokenSaved, recordQuietly } from '../../services/token-pool-autosave';
import {
  chainNetworkField,
  connectorField,
  parseChainNetwork,
  rethrowRouteError,
  slippagePctField,
  walletAddressField,
  resolveWalletAddress,
} from '../common';
import { LAUNCH_SWAP_CONNECTORS, getLaunchOps } from '../connector-registry';

export const LaunchExecuteSwapRequestSchema = Type.Object(
  {
    chainNetwork: chainNetworkField(),
    connector: connectorField(LAUNCH_SWAP_CONNECTORS, 'Launchpad connector whose curve executes the swap', {
      defaulted: false,
    }),
    walletAddress: walletAddressField('Wallet address that will execute the swap'),
    baseToken: Type.String({ description: 'Symbol or address of the launched token' }),
    quoteToken: Type.String({ description: "Symbol or address of the curve's quote currency", default: 'SOL' }),
    amount: Type.Number({
      format: 'decimal',
      description: 'BUY: amount of quote token to spend. SELL: amount of base token to sell. Both sides are exact-in.',
      default: 0.01,
    }),
    side: Type.String({
      description: 'BUY means buying the launched token with the quote currency, SELL means selling it back',
      enum: ['BUY', 'SELL'],
      default: 'BUY',
    }),
    slippagePct: slippagePctField(),
  },
  { $id: 'LaunchExecuteSwapRequest', additionalProperties: false },
);

type LaunchExecuteSwapRequest = Static<typeof LaunchExecuteSwapRequestSchema>;

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/execute-swap',
    {
      schema: {
        description: "Quote and execute a swap on a launchpad's bonding curve",
        tags: ['/trading/launch'],
        body: LaunchExecuteSwapRequestSchema,
        response: { 200: ChainExecuteSwapResponseSchema },
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
      } = request.body as LaunchExecuteSwapRequest;
      try {
        const { chain, network } = parseChainNetwork(chainNetwork);
        const walletAddress = resolveWalletAddress(chain, requestedWallet);
        logger.info(
          `[trading/launch] execute ${side} ${amount} ${baseToken}-${quoteToken} on ${chain}/${network} via ${connector}`,
        );
        const result = await getLaunchOps(connector, chain).executeSwap({
          network,
          walletAddress,
          baseToken,
          quoteToken,
          amount,
          side: side as 'BUY' | 'SELL',
          slippagePct,
        });
        // A launched token is by definition one Gateway has never seen before, so
        // this is the surface where saving it matters most.
        await recordQuietly(
          Promise.all([ensureTokenSaved(chain, network, baseToken), ensureTokenSaved(chain, network, quoteToken)]),
          `tokens ${baseToken} and ${quoteToken}`,
        );
        return reply.code(200).send(result);
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to execute launch swap');
      }
    },
  );
};

export default executeSwapRoute;
