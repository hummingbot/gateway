import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { getInitializedChain } from '../../services/connection-manager';
import { Ergo } from './ergo';
import {
  NonceRequest,
  NonceResponse,
  AllowancesRequest,
  BalanceRequest,
  TokensRequest,
  StatusRequest,
  PollRequest
} from '../chain.requests';
import { ErgoController } from './ergo.controllers';
import { EstimateGasRequestSchema, EstimateGasRequestType } from '../../schemas/chain-schema';
import { EstimateGasResponse, EstimateGasResponseSchema } from '../../connectors/connector.requests';

declare module 'fastify' {
  interface FastifySchema {
    tags?: readonly string[];
    description?: string;
  }
}

export const ergoRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /ergo/status
  fastify.get<{ Querystring: StatusRequest }>(
    '/status',
    {
      schema: {
        tags: ['ergo'],
        description: 'Get ergo chain status',
        querystring: Type.Object({
          network: Type.String(),
        }),
      },
    },
    async (request) => {
      const chain = await getInitializedChain<Ergo>(
        'ergo',
        request.query.network
      );
      return await ErgoController.getStatus(chain as Ergo, request.query);
    }
  );
  
  // GET /ergo/tokens
  fastify.get<{ Querystring: TokensRequest }>(
    '/tokens',
    {
      schema: {
        tags: ['ergo'],
        description: 'Get ergo tokens',
      },
    },
    async (request) => {
      const chain = await getInitializedChain<Ergo>(
        'ergo',
        request.query.network
      );
      return await ErgoController.getTokens(chain as Ergo, request.query);
    }
  );

  // POST /ergo/balances
  fastify.post<{ Body: BalanceRequest }>(
    '/balances',
    {
      schema: {
        tags: ['ergo'],
        description: 'Get ergo balances',
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
      const chain = await getInitializedChain<Ergo>(
        'ergo',
        request.body.network
      );
      return await ErgoController.balances(chain as Ergo, request.body);
    }
  );

  // POST /ergo/poll
  fastify.post<{ Body: PollRequest }>(
    '/poll',
    {
      schema: {
        tags: ['ergo'],
        description: 'Poll ergo transaction status',
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
      const chain = await getInitializedChain<Ergo>(
        'ergo',
        request.body.network
      );
      return await ErgoController.poll(chain as Ergo, request.body);
    }
  );

  // POST /ergo/nonce
  fastify.post<{ Body: NonceRequest; Reply: NonceResponse }>(
    '/nonce',
    {
      schema: {
        tags: ['ergo'],
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
      const chain = await getInitializedChain<Ergo>(
        'ergo',
        request.body.network
      );
      return await ErgoController.nonce(chain as Ergo, request.body);
    }
  );

  // POST /ergo/nextNonce
  fastify.post<{ Body: NonceRequest; Reply: NonceResponse }>(
    '/nextNonce',
    {
      schema: {
        tags: ['ergo'],
        description: 'Get next nonce for address',
      },
    },
    async (request) => {
      const chain = await getInitializedChain<Ergo>(
        request.body.chain,
        request.body.network
      );
      return await ErgoController.nonce(chain as Ergo, request.body);
    }
  );

  // POST /ergo/allowances
  fastify.post<{ Body: AllowancesRequest }>(
    '/allowances',
    {
      schema: {
        tags: ['ergo'],
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
      const chain = await getInitializedChain<Ergo>(
        'ergo',
        request.body.network
      );
      return await ErgoController.allowances(chain as Ergo, request.body);
    }
  );

  fastify.post<{
      Body: EstimateGasRequestType;
      Reply: EstimateGasResponse;
    }>(
      '/estimate-gas',
      {
        schema: {
          description: 'Estimate gas prices for Ergo transactions',
          tags: ['ergo'],
          body: {
            ...EstimateGasRequestSchema,
            properties: {
              ...EstimateGasRequestSchema.properties,
              chain: { type: 'string', enum: ['ergo'], examples: ['ergo'] },
              network: { type: 'string', examples: ['mainnet-beta', 'devnet'] },
              gasLimit: { type: 'number', examples: [1000000] }
            }
          },
          response: {
            200: EstimateGasResponseSchema
          }
        }
      },
      async (request) => {
        const chain = await getInitializedChain<Ergo>(
          'ergo',
          request.body.network
        );        
        // Validate chain is ergo
        if (request.body.chain.toLocaleLowerCase() !== 'ergo') {
          throw fastify.httpErrors.badRequest('Invalid chain specified. Only "solana" is supported for this endpoint.');
        }
        
        return await ErgoController.gas_cost(chain as Ergo, request.body);
      }
    );
};

export default ergoRoutes;
