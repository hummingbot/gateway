import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import {
  AddWalletRequest,
  AddWalletResponse,
  RemoveWalletRequest,
  WalletSignRequest,
  WalletSignResponse,
  GetWalletResponse,
  AddWalletRequestSchema,
  AddWalletResponseSchema,
  RemoveWalletRequestSchema,
  WalletSignRequestSchema,
  WalletSignResponseSchema,
  GetWalletResponseSchema,
} from './wallet.requests';
import {
  addWallet,
  removeWallet,
  getWallets,
  signMessage,
} from './wallet.controllers';
import {
  validateAddWalletRequest,
  validateRemoveWalletRequest,
  validateWalletSignRequest,
} from './wallet.validators';
import fastifyRateLimit from 'fastify-rate-limit';

export const walletRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.register(fastifyRateLimit, {
    max: 100, // maximum number of requests
    timeWindow: '15 minutes' // time window for rate limiting
  });

  // GET /
  fastify.get<{ Reply: GetWalletResponse[] }>(
    '/',
    {
      schema: {
        description: 'Get all wallets',
        tags: ['wallet'],
        response: {
          200: Type.Array(GetWalletResponseSchema)
        }
      }
    },
    async () => {
      return await getWallets();
    }
  );

  // POST /add
  fastify.post<{ Body: AddWalletRequest; Reply: AddWalletResponse }>(
    '/add',
    {
      schema: {
        description: 'Add a new wallet',
        tags: ['wallet'],
        body: AddWalletRequestSchema,
        response: {
          200: AddWalletResponseSchema
        }
      }
    },
    async (request) => {
      validateAddWalletRequest(request.body);
      return await addWallet(request.body);
    }
  );

  // DELETE /remove
  fastify.delete<{ Body: RemoveWalletRequest }>(
    '/remove',
    {
      schema: {
        description: 'Remove a wallet',
        tags: ['wallet'],
        body: RemoveWalletRequestSchema,
        response: {
          200: Type.Object({})
        }
      }
    },
    async (request) => {
      validateRemoveWalletRequest(request.body);
      await removeWallet(request.body);
      return {};
    }
  );

  // GET /sign
  fastify.get<{ Querystring: WalletSignRequest; Reply: WalletSignResponse }>(
    '/sign',
    {
      schema: {
        description: 'Sign a message',
        tags: ['wallet'],
        querystring: WalletSignRequestSchema,
        response: {
          200: WalletSignResponseSchema
        }
      }
    },
    async (request) => {
      validateWalletSignRequest(request.query);
      return await signMessage(request.query);
    }
  );
};

export default walletRoutes;
