import { FastifyPluginAsync } from 'fastify';

import { getDefaultSolanaWallet } from '../../chains/solana/solana.utils';
import { logger } from '../../services/logger';
import {
  SendTransactionRequest,
  SendTransactionResponse,
  SendTransactionRequestSchema,
  SendTransactionResponseSchema,
} from '../schemas';
import { sendTransaction } from '../utils';

export const sendTransactionRoute: FastifyPluginAsync = async (fastify) => {
  const defaultSolanaWallet = getDefaultSolanaWallet();

  fastify.post<{ Body: SendTransactionRequest; Reply: SendTransactionResponse }>(
    '/send',
    {
      schema: {
        description: 'Send native tokens or SPL/ERC20 tokens to another address',
        tags: ['/wallet'],
        body: {
          ...SendTransactionRequestSchema,
          examples: [
            {
              chain: 'solana',
              network: 'mainnet-beta',
              address: defaultSolanaWallet,
              toAddress: '<recipient-address>',
              amount: '0.1',
              token: 'SOL',
            },
          ],
        },
        response: {
          200: SendTransactionResponseSchema,
        },
      },
    },
    async (request) => {
      logger.info(
        `Sending ${request.body.amount} ${request.body.token || 'native'} from ${request.body.address} to ${request.body.toAddress}`,
      );
      return await sendTransaction(fastify, request.body);
    },
  );
};

export default sendTransactionRoute;
