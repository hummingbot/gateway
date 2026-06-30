/**
 * Remove Swig Wallet Route
 * Unregisters a Swig smart-contract wallet from Gateway. This only removes the local
 * mapping; it does not touch the on-chain Swig account or its roles.
 */

import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../chains/solana/solana';
import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';
import { logger } from '../../services/logger';
import { getSwigWallets, saveSwigWallets } from '../utils';

export const RemoveSwigWalletRequestSchema = Type.Object({
  address: Type.String({ description: 'Swig wallet (funds-owner) address to remove' }),
  passphrase: Type.String({ description: 'Gateway passphrase (required for security)' }),
});

export const RemoveSwigWalletResponseSchema = Type.Object({
  message: Type.String({ description: 'Success message' }),
});

export type RemoveSwigWalletRequest = Static<typeof RemoveSwigWalletRequestSchema>;
export type RemoveSwigWalletResponse = Static<typeof RemoveSwigWalletResponseSchema>;

export const removeSwigWalletRoute: FastifyPluginAsync = async (fastify) => {
  fastify.delete<{
    Body: RemoveSwigWalletRequest;
    Reply: RemoveSwigWalletResponse;
  }>(
    '/remove-swig',
    {
      schema: {
        description: 'Unregister a Swig smart-contract wallet from Gateway',
        tags: ['/wallet'],
        body: RemoveSwigWalletRequestSchema,
        response: { 200: RemoveSwigWalletResponseSchema },
      },
    },
    async (request) => {
      const { address, passphrase } = request.body;
      const chain = 'solana';

      const configuredPassphrase = ConfigManagerCertPassphrase.readPassphrase();
      if (!configuredPassphrase) {
        throw fastify.httpErrors.internalServerError('No passphrase configured');
      }
      if (passphrase !== configuredPassphrase) {
        logger.warn('Invalid passphrase provided for remove-swig request');
        throw fastify.httpErrors.unauthorized('Invalid passphrase');
      }

      let validatedAddress: string;
      try {
        validatedAddress = Solana.validateAddress(address);
      } catch (error: any) {
        throw fastify.httpErrors.badRequest(error.message);
      }

      const existing = await getSwigWallets(chain);
      const index = existing.findIndex((w) => w.address.toLowerCase() === validatedAddress.toLowerCase());
      if (index === -1) {
        throw fastify.httpErrors.notFound(`Swig wallet not found: ${validatedAddress}`);
      }

      existing.splice(index, 1);
      await saveSwigWallets(chain, existing);

      logger.info(`Unregistered Swig wallet ${validatedAddress}`);
      return { message: 'Swig wallet removed successfully' };
    },
  );
};

export default removeSwigWalletRoute;
