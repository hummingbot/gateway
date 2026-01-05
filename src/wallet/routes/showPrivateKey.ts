import { FastifyPluginAsync } from 'fastify';

import { getDefaultSolanaWallet } from '../../chains/solana/solana.utils';
import { logger } from '../../services/logger';
import {
  ShowPrivateKeyRequest,
  ShowPrivateKeyResponse,
  ShowPrivateKeyRequestSchema,
  ShowPrivateKeyResponseSchema,
} from '../schemas';
import { showPrivateKey } from '../utils';

export const showPrivateKeyRoute: FastifyPluginAsync = async (fastify) => {
  const defaultSolanaWallet = getDefaultSolanaWallet();

  fastify.post<{ Body: ShowPrivateKeyRequest; Reply: ShowPrivateKeyResponse }>(
    '/show-private-key',
    {
      schema: {
        description: 'Show the private key for a wallet. Requires explicit passphrase verification for security.',
        tags: ['/wallet'],
        body: {
          ...ShowPrivateKeyRequestSchema,
          examples: [
            {
              chain: 'solana',
              address: defaultSolanaWallet,
              passphrase: '<gateway-passphrase>',
            },
          ],
        },
        response: {
          200: ShowPrivateKeyResponseSchema,
        },
      },
    },
    async (request) => {
      logger.info(`Show private key requested for chain: ${request.body.chain}, address: ${request.body.address}`);
      return await showPrivateKey(fastify, request.body);
    },
  );
};

export default showPrivateKeyRoute;
