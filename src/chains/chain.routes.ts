import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { Chain } from '../services/common-interfaces';
import { ConfigManagerV2 } from '../services/config-manager-v2';
import { getInitializedChain } from '../services/connection-manager';
import {
  AllowancesRequest,
  AllowancesResponse,
  NonceRequest,
  NonceResponse,
  CancelRequest,
  CancelResponse,
  ApproveRequest,
  ApproveResponse,
  NonceRequestSchema,
  NonceResponseSchema,
  AllowancesRequestSchema,
  AllowancesResponseSchema,
  ApproveRequestSchema,
  ApproveResponseSchema,
  StatusRequest,
  BalanceRequest,
  PollRequest,
  TokensRequest,
} from './chain.requests';
import { TransferRequest } from '../services/common-interfaces';
import {
  allowances,
  approve,
  balances,
  cancel,
  getTokens,
  nextNonce,
  nonce,
  poll,
  transfer,
} from './chain.controller';
import { getStatus } from './chain.controller';
import { validateNonceRequest } from './ethereum/ethereum.validators';
import {
  mkRequestValidator,
  RequestValidator,
  validateTxHash,
} from '../services/validators';
import {
  validateChain as validateEthereumChain,
  validateNetwork as validateEthereumNetwork,
} from '../chains/ethereum/ethereum.validators';

export const validatePollRequest: RequestValidator = mkRequestValidator([
  validateTxHash,
]);

export const validateTokensRequest: RequestValidator = mkRequestValidator([
  // validateEthereumChain,
  validateEthereumNetwork,
]);

export const chainRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /status
  fastify.get<{ Querystring: StatusRequest }>(
    '/status',
    {
      schema: {
        tags: ['chain'],
        querystring: Type.Object({
          chain: Type.Optional(Type.String()),
          network: Type.Optional(Type.String()),
        }),
      },
    },
    async (request) => {
      return await getStatus(request.query);
    }
  );

  // GET /config
  fastify.get('/config', {
    schema: {
      tags: ['chain'],
    },
  }, async () => {
    return ConfigManagerV2.getInstance().allConfigurations;
  });

  // POST /balances
  fastify.post<{ Body: BalanceRequest }>(
    '/balances',
    {
      schema: {
        tags: ['chain'],
      },
    },
    async (request) => {
      const chain = await getInitializedChain<Chain>(
        request.body.chain,
        request.body.network
      );
      return await balances(chain, request.body);
    }
  );

  // POST /poll
  fastify.post<{ Body: PollRequest }>(
    '/poll',
    {
      schema: {
        tags: ['chain'],
        body: {
          type: 'object',
          required: ['chain', 'network', 'txHash'],
          properties: {
            chain: { type: 'string' },
            network: { type: 'string' },
            txHash: { type: 'string' }
          }
        }
      },
    },
    async (request, reply) => {
      try {
        console.log('POST /poll request body:', JSON.stringify(request.body, null, 2));
        
        if (!request.body) {
          return reply.status(400).send({
            error: 'ValidationError',
            message: 'Request body is required'
          });
        }

        const { chain, network, txHash } = request.body;
        
        if (!chain || !network || !txHash) {
          return reply.status(400).send({
            error: 'ValidationError',
            message: 'chain, network, and txHash are required fields'
          });
        }

        const chainInstance = await getInitializedChain(chain, network);
        
        if (!chainInstance) {
          return reply.status(503).send({
            error: 'ChainError',
            message: 'Failed to initialize chain'
          });
        }

        const result = await poll(chainInstance, request.body);
        console.log('POST /poll response:', JSON.stringify(result, null, 2));
        return result;
      } catch (error) {
        console.error('Error in POST /poll:', error);
        return reply.status(503).send({
          error: 'PollError',
          message: error instanceof Error ? error.message : 'Unknown error occurred'
        });
      }
    }
  );

  // GET /tokens
  fastify.get<{ Querystring: TokensRequest }>(
    '/tokens',
    {
      schema: {
        tags: ['chain'],
      },
    },
    async (request) => {
      const chain = await getInitializedChain(
        request.query.chain,
        request.query.network
      );
      return await getTokens(chain, request.query);
    }
  );

  // POST /nextNonce
  fastify.post<{ Body: NonceRequest; Reply: NonceResponse }>(
    '/nextNonce',
    {
      schema: {
        tags: ['chain'],
      },
    },
    async (request) => {
      const chain = await getInitializedChain(
        request.body.chain,
        request.body.network
      );
      return await nextNonce(chain, request.body);
    }
  );

  // POST /nonce
  fastify.post<{ Body: NonceRequest; Reply: NonceResponse }>(
    '/nonce',
    {
      schema: {
        description: 'Get nonce for address',
        tags: ['chain'],
        body: NonceRequestSchema,
        response: {
          200: NonceResponseSchema
        }
      }
    },
    async (request) => {
      validateNonceRequest(request.body);
      const chain = await getInitializedChain(
        request.body.chain,
        request.body.network
      );
      return await nonce(chain, request.body);
    }
  );

  // POST /allowances
  fastify.post<{ Body: AllowancesRequest; Reply: AllowancesResponse }>(
    '/allowances',
    {
      schema: {
        tags: ['chain'],
        description: 'Get token allowances',
        body: AllowancesRequestSchema,
        response: {
          200: AllowancesResponseSchema
        }
      }
    },
    async (request) => {
      const chain = await getInitializedChain(
        request.body.chain,
        request.body.network
      );
      return await allowances(chain, request.body);
    }
  );

  // POST /approve
  fastify.post<{ Body: ApproveRequest; Reply: ApproveResponse }>(
    '/approve',
    {
      schema: {
        tags: ['chain'],
        description: 'Approve token spending',
        body: ApproveRequestSchema,
        response: {
          200: ApproveResponseSchema
        }
      }
    },
    async (request) => {
      const chain = await getInitializedChain(
        request.body.chain,
        request.body.network
      );
      return await approve(chain, request.body);
    }
  );

  // POST /cancel
  fastify.post<{ Body: CancelRequest; Reply: CancelResponse }>(
    '/cancel',
    {
      schema: {
        tags: ['chain'],
      },
    },
    async (request) => {
      const chain = await getInitializedChain(
        request.body.chain,
        request.body.network
      );
      return await cancel(chain, request.body);
    }
  );

  // POST /transfer
  fastify.post<{ Body: TransferRequest }>(
    '/transfer',
    {
      schema: {
        tags: ['chain'],
      },
    },
    async (request) => {
      const chain = await getInitializedChain(
        request.body.chain,
        request.body.network
      );
      return await transfer(chain, request.body);
    }
  );
};

export default chainRoutes;
