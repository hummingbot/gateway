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
import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { getStatus } from '../chain.controller';

export const ethereumRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /ethereum/config
  fastify.get('/config', {
    schema: {
      tags: ['ethereum'],
      description: 'Get Ethereum configuration',
    },
  }, async () => {
    const ethereumNamespace = ConfigManagerV2.getInstance().getNamespace('ethereum');
    return ethereumNamespace ? ethereumNamespace.configuration : {};
  });

  // POST /ethereum/poll
  fastify.post<{ Body: PollRequest }>(
    '/poll',
    {
      schema: {
        tags: ['ethereum'],
        description: 'Poll Ethereum transaction status',
      },
    },
    async (request) => {
      const chain = await getInitializedChain<Ethereumish>(
        request.body.chain,
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
      },
    },
    async (request) => {
      const chain = await getInitializedChain<Ethereumish>(
        request.body.chain,
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
        request.query.chain,
        request.query.network
      );
      return await EVMController.getTokens(chain, request.query);
    }
  );

  // POST /ethereum/allowances
  fastify.post<{ Body: AllowancesRequest }>(
    '/allowances',
    {
      schema: {
        tags: ['ethereum'],
        description: 'Get token allowances',
      },
    },
    async (request) => {
      const chain = await getInitializedChain<Ethereumish>(
        request.body.chain,
        request.body.network
      );
      return await EVMController.allowances(chain, request.body);
    }
  );

  // POST /ethereum/balances
  fastify.post<{ Body: BalanceRequest }>(
    '/balances',
    {
      schema: {
        tags: ['ethereum'],
        description: 'Get Ethereum balances',
      },
    },
    async (request) => {
      const chain = await getInitializedChain<Ethereumish>(
        request.body.chain,
        request.body.network
      );
      return await EVMController.balances(chain, request.body);
    }
  );

  // POST /ethereum/approve
  fastify.post<{ Body: ApproveRequest }>(
    '/approve',
    {
      schema: {
        tags: ['ethereum'],
        description: 'Approve token spending',
      },
    },
    async (request) => {
      const chain = await getInitializedChain<Ethereumish>(
        request.body.chain,
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
      },
    },
    async (request) => {
      const chain = await getInitializedChain<Ethereumish>(
        request.body.chain,
        request.body.network
      );
      return await EVMController.cancel(chain, request.body);
    }
  );

  // GET /ethereum/status
  fastify.get<{ Querystring: StatusRequest }>(
    '/status',
    {
      schema: {
        tags: ['ethereum'],
        description: 'Get Ethereum chain status',
        querystring: Type.Object({
          chain: Type.Optional(Type.String()),
          network: Type.String(),
        }),
      },
    },
    async (request) => {
      return await getStatus(request.query);
    }
  );
};

export default ethereumRoutes;
