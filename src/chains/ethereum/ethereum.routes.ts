import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { getInitializedChain } from '../../services/connection-manager';
import { Chain as Ethereumish } from '../../services/common-interfaces';
import {
  NonceRequest,
  NonceResponse,
  AllowancesRequest,
  ApproveRequest,
  CancelRequest,
  BalanceRequest,
  TokensRequest,
  StatusRequest,
} from '../chain.requests';
import { PollRequest } from './ethereum.requests';
import { EVMController } from './evm.controllers';

export const ethereumRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /ethereum/status
  fastify.get<{ Querystring: StatusRequest }>(
    '/status',
    {
      schema: {
        tags: ['ethereum'],
        description: 'Get Ethereum chain status',
        querystring: Type.Object({
          network: Type.String(),
        }),
      },
    },
    async (request) => {
      const chain = await getInitializedChain<Ethereumish>(
        'ethereum',
        request.query.network
      );
      return await EVMController.getStatus(chain, request.query);
    }
  );
  
  // GET /ethereum/tokens
  fastify.get<{ Querystring: TokensRequest }>(
    '/tokens',
    {
      schema: {
        tags: ['ethereum'],
        description: 'Get Ethereum tokens',
      },
    },
    async (request) => {
      const chain = await getInitializedChain<Ethereumish>(
        'ethereum',
        request.query.network
      );
      return await EVMController.getTokens(chain, request.query);
    }
  );

  // POST /ethereum/balances
  fastify.post<{ Body: BalanceRequest }>(
    '/balances',
    {
      schema: {
        tags: ['ethereum'],
        description: 'Get Ethereum balances',
        body: {
            type: 'object',
            required: ['network'],
            properties: {
              network: { type: 'string' }
            }
          }
        },
    },
    async (request) => {
      const chain = await getInitializedChain<Ethereumish>(
        'ethereum',
        request.body.network
      );
      return await EVMController.balances(chain, request.body);
    }
  );

  // POST /ethereum/poll
  fastify.post<{ Body: PollRequest }>(
    '/poll',
    {
      schema: {
        tags: ['ethereum'],
        description: 'Poll Ethereum transaction status',
        body: {
          type: 'object',
          required: ['network', 'txHash'],
          properties: {
            network: { type: 'string' },
            txHash: { type: 'string' }
          }
        }
      },
    },
    async (request) => {
      const chain = await getInitializedChain<Ethereumish>(
        'ethereum',
        request.body.network
      );
      return await EVMController.poll(chain, request.body);
    }
  );

  // POST /ethereum/nonce
  fastify.post<{ Body: NonceRequest; Reply: NonceResponse }>(
    '/nonce',
    {
      schema: {
        tags: ['ethereum'],
        description: 'Get nonce for address',
        body: {
          type: 'object',
          required: ['network', 'address'],
          properties: {
            network: { type: 'string' },
            address: { type: 'string' }
          }
        }
      },
    },
    async (request) => {
      const chain = await getInitializedChain<Ethereumish>(
        'ethereum',
        request.body.network
      );
      return await EVMController.nonce(chain, request.body);
    }
  );

  // POST /ethereum/nextNonce
  fastify.post<{ Body: NonceRequest; Reply: NonceResponse }>(
    '/nextNonce',
    {
      schema: {
        tags: ['ethereum'],
        description: 'Get next nonce for address',
      },
    },
    async (request) => {
      const chain = await getInitializedChain<Ethereumish>(
        request.body.chain,
        request.body.network
      );
      return await EVMController.nextNonce(chain, request.body);
    }
  );

  // POST /ethereum/allowances
  fastify.post<{ Body: AllowancesRequest }>(
    '/allowances',
    {
      schema: {
        tags: ['ethereum'],
        description: 'Get token allowances',
        body: {
          type: 'object',
          required: ['network', 'address', 'spender', 'tokenSymbols'],
          properties: {
            network: { type: 'string' },
            address: { type: 'string' },
            spender: { type: 'string' },
            tokenSymbols: { type: 'array', items: { type: 'string' } }
          }
        }
      },
    },
    async (request) => {
      const chain = await getInitializedChain<Ethereumish>(
        'ethereum',
        request.body.network
      );
      return await EVMController.allowances(chain, request.body);
    }
  );

  // POST /ethereum/approve
  fastify.post<{ Body: ApproveRequest }>(
    '/approve',
    {
      schema: {
        tags: ['ethereum'],
        description: 'Approve token spending',
        body: {
          type: 'object',
          required: ['network', 'address', 'spender', 'token'],
          properties: {
            network: { type: 'string' },
            address: { type: 'string' },
            spender: { type: 'string' },
            token: { type: 'string' }
          }
        }
      },
    },
    async (request) => {
      const chain = await getInitializedChain<Ethereumish>(
        'ethereum',
        request.body.network
      );
      return await EVMController.approve(chain, request.body);
    }
  );

  // POST /ethereum/cancel
  fastify.post<{ Body: CancelRequest }>(
    '/cancel',
    {
      schema: {
        tags: ['ethereum'],
        description: 'Cancel transaction',
        body: {
          type: 'object',
          required: ['network', 'nonce'],
          properties: {
            network: { type: 'string' },
            nonce: { type: 'number' }
          }
        }
      },
    },
    async (request) => {
      const chain = await getInitializedChain<Ethereumish>(
        'ethereum',
        request.body.network
      );
      return await EVMController.cancel(chain, request.body);
    }
  );

};

export default ethereumRoutes;
