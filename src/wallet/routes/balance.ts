import { FastifyPluginAsync } from 'fastify';

import { WalletBalanceRequestSchema, WalletBalanceResponseSchema, WalletBalanceRequest } from '../schemas';
import { getWalletBalance } from '../utils';

export const walletBalanceRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: WalletBalanceRequest }>(
    '/balance',
    {
      schema: {
        description:
          'Get token balances for any wallet address on a given chain/network. ' +
          'Does not require the wallet to be registered with Gateway. ' +
          "Network resolution (Blockchain lens): If `network` is omitted, uses the address's primary registered network if found in wallet store; " +
          'otherwise defaults to mainnet/mainnet-beta. ' +
          'Pass `tokens: []` or omit `tokens` to return all non-zero balances. ' +
          'Use `network` or `chainNetwork` (e.g. `ethereum-bsc`) to explicitly target a specific network.',
        tags: ['/wallet'],
        body: {
          ...WalletBalanceRequestSchema,
          examples: [
            { chain: 'ethereum', address: '0xYourAddress' },
            { chain: 'ethereum', network: 'bsc', address: '0xYourAddress', tokens: ['BNB', 'CAKE'] },
            { chainNetwork: 'ethereum-arbitrum', address: '0xYourAddress', tokens: ['ETH', 'USDC'] },
            { chain: 'solana', address: 'YourSolanaAddress' },
          ],
        },
        response: {
          200: WalletBalanceResponseSchema,
        },
      },
    },
    async (request) => {
      return await getWalletBalance(fastify, request.body);
    },
  );
};
