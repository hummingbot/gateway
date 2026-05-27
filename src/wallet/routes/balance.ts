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
          'If `network` is omitted, Gateway checks whether the address is already registered and uses its primary network; ' +
          'otherwise it defaults to `mainnet` (Ethereum) or `mainnet-beta` (Solana). ' +
          'Omit `tokens` or pass `tokens: []` to return all non-zero balances. ' +
          'Use `chainNetwork` (e.g. `"ethereum-bsc"`) as a shorthand for `chain` + `network` together.',
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
