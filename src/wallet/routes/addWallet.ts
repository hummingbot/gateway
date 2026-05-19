import { FastifyPluginAsync } from 'fastify';

import { logger } from '../../services/logger';
import { AddWalletRequest, AddWalletResponse, AddWalletRequestSchema, AddWalletResponseSchema } from '../schemas';
import { addWallet } from '../utils';

export const addWalletRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: AddWalletRequest; Reply: AddWalletResponse }>(
    '/add',
    {
      schema: {
        description:
          'Add an existing wallet using a private key. Optionally specify `network` (e.g. `bsc`, `arbitrum`) ' +
          'or use `chainNetwork` shorthand (e.g. `ethereum-bsc`). The same address can be registered for ' +
          'multiple networks — each registration appears as a separate entry in walletDetails.',
        tags: ['/wallet'],
        body: {
          ...AddWalletRequestSchema,
          examples: [
            {
              summary: 'Ethereum mainnet wallet',
              value: { chain: 'ethereum', privateKey: '<your-private-key>', setDefault: true },
            },
            {
              summary: 'Ethereum BSC wallet via network param',
              value: { chain: 'ethereum', network: 'bsc', privateKey: '<your-private-key>' },
            },
            {
              summary: 'Ethereum Arbitrum wallet via chainNetwork shorthand',
              value: { chainNetwork: 'ethereum-arbitrum', privateKey: '<your-private-key>' },
            },
            {
              summary: 'Solana mainnet-beta wallet',
              value: { chain: 'solana', privateKey: '<your-private-key>', setDefault: true },
            },
          ],
        },
        response: {
          200: AddWalletResponseSchema,
        },
      },
    },
    async (request) => {
      logger.info(`Adding new wallet for chain: ${request.body.chain}`);
      return await addWallet(fastify, request.body);
    },
  );
};

export default addWalletRoute;
