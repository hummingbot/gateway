import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { getInitializedChain } from '../../services/connection-manager';
import {
  BalanceRequest,
  PollRequest,
  TokensRequest,
  StatusRequest,
} from '../chain.requests';
import { SolanaController } from './solana.controllers';
import { Solanaish } from './solana';
import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { getStatus } from '../chain.controller';

export const solanaRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /solana/config
  fastify.get('/config', {
    schema: {
      tags: ['solana'],
      description: 'Get Solana configuration',
    },
  }, async () => {
    const solanaNamespace = ConfigManagerV2.getInstance().getNamespace('solana');
    return solanaNamespace ? solanaNamespace.configuration : {};
  });

  // POST /solana/balances
  fastify.post<{ Body: BalanceRequest }>(
    '/balances',
    {
      schema: {
        tags: ['solana'],
        description: 'Get Solana balances',
      },
    },
    async (request) => {
      const chain = await getInitializedChain<Solanaish>(
        request.body.chain,
        request.body.network
      );
      return await SolanaController.balances(chain, request.body);
    }
  );

  // POST /solana/poll
  fastify.post<{ Body: PollRequest }>(
    '/poll',
    {
      schema: {
        tags: ['solana'],
        description: 'Poll Solana transaction status',
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
    async (request) => {
      const chain = await getInitializedChain<Solanaish>(
        request.body.chain,
        request.body.network
      );
      return await SolanaController.poll(chain, request.body);
    }
  );

  // GET /solana/tokens
  fastify.get<{ Querystring: TokensRequest }>(
    '/tokens',
    {
      schema: {
        tags: ['solana'],
        description: 'Get Solana tokens',
      },
    },
    async (request) => {
      const chain = await getInitializedChain<Solanaish>(
        request.query.chain,
        request.query.network
      );
      return await SolanaController.getTokens(chain, request.query);
    }
  );

  // GET /solana/status
  fastify.get<{ Querystring: StatusRequest }>(
    '/status',
    {
      schema: {
        tags: ['solana'],
        description: 'Get Solana chain status',
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

export default solanaRoutes;
