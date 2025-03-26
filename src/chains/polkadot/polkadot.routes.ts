import { FastifyPluginAsync } from 'fastify';
import { getInitializedChain } from '../../services/connection-manager';
import { PolkadotController } from './polkadot.controllers';
import { Polkadot } from './polkadot';
import { 
  StatusRequestSchema,
  StatusResponseSchema,
  TokensRequestSchema,
  TokensResponseSchema,
  BalanceRequestSchema,
  BalanceResponseSchema,
  PollRequestSchema,
  PollResponseSchema,
  StatusRequestType,
  StatusResponseType,
  TokensRequestType,
  TokensResponseType,
  BalanceRequestType,
  BalanceResponseType,
  PollRequestType,
  PollResponseType
} from '../../schemas/chain-schema';

export const polkadotRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /polkadot/status
  fastify.get<{ Querystring: StatusRequestType; Reply: StatusResponseType }>(
    '/status',
    {
      schema: {
        tags: ['polkadot'],
        description: 'Get Polkadot network status',
        querystring: StatusRequestSchema,
        response: {
          200: StatusResponseSchema
        }
      }
    },
    async (request, reply) => {
      const chain = await getInitializedChain<Polkadot>('polkadot', request.query.network);
      const status = await PolkadotController.getStatus(chain, request.query);
      return reply.send(status);
    }
  );

  // GET /polkadot/tokens
  fastify.get<{ Querystring: TokensRequestType; Reply: TokensResponseType }>(
    '/tokens',
    {
      schema: {
        tags: ['polkadot'],
        description: 'Get list of supported Polkadot tokens with their addresses and decimals',
        querystring: TokensRequestSchema,
        response: {
          200: TokensResponseSchema
        }
      }
    },
    async (request, reply) => {
      const chain = await getInitializedChain<Polkadot>('polkadot', request.query.network);
      const response = await PolkadotController.getTokens(chain, request.query);
      return reply.send(response);
    }
  );

  // POST /polkadot/balances
  fastify.post<{ Body: BalanceRequestType; Reply: BalanceResponseType }>(
    '/balances',
    {
      schema: {
        tags: ['polkadot'],
        description: 'Get token balances for a Polkadot address',
        body: BalanceRequestSchema,
        response: {
          200: BalanceResponseSchema
        }
      }
    },
    async (request, reply) => {
      const chain = await getInitializedChain<Polkadot>('polkadot', request.body.network);
      const response = await PolkadotController.balances(chain, request.body);
      return reply.send(response);
    }
  );

  // POST /polkadot/poll
  fastify.post<{ Body: PollRequestType; Reply: PollResponseType }>(
    '/poll',
    {
      schema: {
        description: 'Poll for transaction status',
        tags: ['polkadot'],
        body: PollRequestSchema,
        response: {
          200: PollResponseSchema
        }
      }
    },
    async (request, reply) => {
      const chain = await getInitializedChain<Polkadot>('polkadot', request.body.network);
      const response = await PolkadotController.poll(chain, request.body);
      return reply.send(response);
    }
  );

  // GET /polkadot/staking
  fastify.get<{ Querystring: BalanceRequestType; Reply: BalanceResponseType }>(
    '/staking',
    {
      schema: {
        tags: ['polkadot'],
        description: 'Get staking information for a Polkadot address',
        querystring: BalanceRequestSchema,
        response: {
          200: BalanceResponseSchema
        }
      }
    },
    async (request, reply) => {
      const chain = await getInitializedChain<Polkadot>('polkadot', request.query.network);
      const response = await PolkadotController.getStakingInfo(chain, request.query);
      return reply.send(response);
    }
  );

  // POST /polkadot/transfer
  fastify.post<{ Body: BalanceRequestType; Reply: BalanceResponseType }>(
    '/transfer',
    {
      schema: {
        tags: ['polkadot'],
        description: 'Transfer tokens from one Polkadot address to another',
        body: BalanceRequestSchema,
        response: {
          200: BalanceResponseSchema
        }
      }
    },
    async (request, reply) => {
      const chain = await getInitializedChain<Polkadot>('polkadot', request.body.network);
      const response = await PolkadotController.transfer(chain, request.body);
      return reply.send(response);
    }
  );

  // GET /polkadot/metadata
  fastify.get<{ Querystring: StatusRequestType; Reply: StatusResponseType }>(
    '/metadata',
    {
      schema: {
        tags: ['polkadot'],
        description: 'Get metadata for a specific Polkadot pallet',
        querystring: StatusRequestSchema,
        response: {
          200: StatusResponseSchema
        }
      }
    },
    async (request, reply) => {
      const chain = await getInitializedChain<Polkadot>('polkadot', request.query.network);
      const response = await PolkadotController.getMetadata(chain, request.query);
      return reply.send(response);
    }
  );
};

export default polkadotRoutes;

