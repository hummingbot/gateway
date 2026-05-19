import { FastifyPluginAsync } from 'fastify';

import { logger } from '../../services/logger';
import {
  CreateWalletRequest,
  CreateWalletResponse,
  CreateWalletRequestSchema,
  CreateWalletResponseSchema,
} from '../schemas';
import { createWallet } from '../utils';

export const createWalletRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: CreateWalletRequest; Reply: CreateWalletResponse }>(
    '/create',
    {
      schema: {
        description:
          'Generate a new random wallet and add it to Gateway. Optionally specify `network` or `chainNetwork` ' +
          'to register it for a specific network (defaults to mainnet/mainnet-beta).',
        tags: ['/wallet'],
        body: {
          ...CreateWalletRequestSchema,
          examples: [
            {
              summary: 'New Solana mainnet-beta wallet',
              value: { chain: 'solana', setDefault: true },
            },
            {
              summary: 'New Ethereum mainnet wallet',
              value: { chain: 'ethereum', setDefault: false },
            },
            {
              summary: 'New Ethereum BSC wallet',
              value: { chain: 'ethereum', network: 'bsc' },
            },
            {
              summary: 'New Ethereum Arbitrum wallet via chainNetwork',
              value: { chainNetwork: 'ethereum-arbitrum' },
            },
          ],
        },
        response: {
          200: CreateWalletResponseSchema,
        },
      },
    },
    async (request) => {
      logger.info(`Creating new wallet for chain: ${request.body.chain}`);
      return await createWallet(fastify, request.body);
    },
  );
};

export default createWalletRoute;
