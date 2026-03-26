/**
 * Remove Privy Wallet Route
 * Unregisters a Privy server wallet from Gateway
 */

import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { Ethereum } from '../../chains/ethereum/ethereum';
import { Solana } from '../../chains/solana/solana';
import { getPrivyWallets, savePrivyWallets, validateChainName } from '../utils';

// Request schema
export const RemovePrivyWalletRequestSchema = Type.Object({
  chain: Type.String({
    description: 'Blockchain for the Privy wallet',
    enum: ['ethereum', 'solana'],
    examples: ['solana', 'ethereum'],
  }),
  address: Type.String({
    description: 'Wallet address to remove',
  }),
});

// Response schema
export const RemovePrivyWalletResponseSchema = Type.Object({
  message: Type.String({
    description: 'Success message',
  }),
});

export type RemovePrivyWalletRequest = Static<typeof RemovePrivyWalletRequestSchema>;
export type RemovePrivyWalletResponse = Static<typeof RemovePrivyWalletResponseSchema>;

export const removePrivyWalletRoute: FastifyPluginAsync = async (fastify) => {
  fastify.delete<{
    Body: RemovePrivyWalletRequest;
    Reply: RemovePrivyWalletResponse;
  }>(
    '/remove-privy',
    {
      schema: {
        description: 'Unregister a Privy server wallet from Gateway',
        tags: ['/wallet'],
        body: {
          ...RemovePrivyWalletRequestSchema,
          examples: [
            {
              chain: 'solana',
              address: 'So11111111111111111111111111111111111111112',
            },
          ],
        },
        response: {
          200: {
            ...RemovePrivyWalletResponseSchema,
            examples: [
              {
                message: 'Privy wallet removed successfully',
              },
            ],
          },
        },
      },
    },
    async (request) => {
      const { chain, address } = request.body;

      // Validate chain name
      if (!validateChainName(chain)) {
        throw fastify.httpErrors.badRequest(`Unrecognized chain name: ${chain}`);
      }

      // Validate address format
      let validatedAddress: string;
      try {
        if (chain.toLowerCase() === 'ethereum') {
          validatedAddress = Ethereum.validateAddress(address);
        } else {
          validatedAddress = Solana.validateAddress(address);
        }
      } catch (error: any) {
        throw fastify.httpErrors.badRequest(error.message);
      }

      // Get existing Privy wallets
      const existingWallets = await getPrivyWallets(chain);

      // Find the wallet to remove
      const walletIndex = existingWallets.findIndex((w) => w.address.toLowerCase() === validatedAddress.toLowerCase());

      if (walletIndex === -1) {
        throw fastify.httpErrors.notFound(`Privy wallet not found: ${validatedAddress}`);
      }

      // Remove the wallet
      existingWallets.splice(walletIndex, 1);

      // Save updated wallet list
      await savePrivyWallets(chain, existingWallets);

      return {
        message: 'Privy wallet removed successfully',
      };
    },
  );
};

export default removePrivyWalletRoute;
