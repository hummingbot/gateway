import sensible from '@fastify/sensible';
import { FastifyPluginAsync } from 'fastify';

import {
  RemoveWalletRequest,
  RemoveWalletResponse,
  RemoveWalletRequestSchema,
  RemoveWalletResponseSchema,
} from '../schemas';
import { removeWallet } from '../utils';

export const removeWalletRoute: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  fastify.delete<{ Body: RemoveWalletRequest; Reply: RemoveWalletResponse }>(
    '/remove',
    {
      schema: {
        description: 'Remove a wallet by its address, whatever its signer (local, hardware, external, privy)',
        tags: ['/wallet'],
        body: RemoveWalletRequestSchema,
        response: {
          200: RemoveWalletResponseSchema,
        },
      },
    },
    async (request) => {
      const { chain, address } = request.body;
      const signer = await removeWallet(chain, address);
      const label = signer === 'local' ? 'Wallet' : `${signer[0].toUpperCase()}${signer.slice(1)} wallet`;
      return { message: `${label} ${address} removed successfully` };
    },
  );
};

export default removeWalletRoute;
