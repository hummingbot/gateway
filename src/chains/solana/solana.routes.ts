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

export const solanaRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /solana/status
  fastify.get<{ Querystring: StatusRequest }>(
    '/status',
    {
      schema: {
        tags: ['solana'],
        description: 'Get Solana chain status',
        querystring: Type.Object({
          network: Type.String(),
        }),
      },
    },
    async (request) => {
      const chain = await getInitializedChain<Solanaish>(
        'solana',
        request.query.network
      );
      return await SolanaController.getStatus(chain, request.query);
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
        'solana',
        request.query.network
      );
      return await SolanaController.getTokens(chain, request.query);
    }
  );

  // POST /solana/balances
  fastify.post<{ Body: BalanceRequest }>(
    '/balances',
    {
      schema: {
        tags: ['solana'],
        description: 'Get Solana balances',
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
      const chain = await getInitializedChain<Solanaish>(
        'solana',
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
          required: ['network', 'txHash'],
          properties: {
            network: { type: 'string' },
            txHash: { type: 'string' }
          }
        }
      },
    },
    async (request) => {
      const chain = await getInitializedChain<Solanaish>(
        'solana',
        request.body.network
      );
      return await SolanaController.poll(chain, request.body);
    }
  );

};

export default solanaRoutes;
