import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { getInitializedChain } from '../../services/connection-manager';
import { SolanaController } from './solana.controllers';
import { Solana } from './solana';
import { estimateGasRoute } from './routes/estimate-gas';

// Define schemas
const StatusRequestSchema = Type.Object({
  network: Type.String()
});

const TokensRequestSchema = Type.Object({
  network: Type.String(),
  tokenSymbols: Type.Optional(
    Type.Union([
      Type.String(),
      Type.Array(Type.String())
    ])
  )
});

const BalanceRequestSchema = Type.Object({
  network: Type.String(),
  address: Type.String(),
  tokenSymbols: Type.Optional(Type.Array(Type.String()))
});

const PollRequestSchema = Type.Object({
  network: Type.String(),
  txHash: Type.String()
});

// Add response schemas
const StatusResponseSchema = Type.Object({
  chain: Type.String(),
  network: Type.String(),
  rpcUrl: Type.String(),
  currentBlockNumber: Type.Number(),
  nativeCurrency: Type.String(),
  timestamp: Type.Number(),
  latency: Type.Number()
});

const TokensResponseSchema = Type.Object({
  tokens: Type.Array(Type.Object({
    symbol: Type.String(),
    address: Type.String(),
    decimals: Type.Number(),
    name: Type.String()
  })),
  timestamp: Type.Number(),
  latency: Type.Number()
});

const BalanceResponseSchema = Type.Object({
  balances: Type.Record(Type.String(), Type.Number()),
  timestamp: Type.Number(),
  latency: Type.Number()
});

const PollResponseSchema = Type.Object({
  currentBlock: Type.Number(),
  txHash: Type.String(),
  txBlock: Type.Union([Type.Number(), Type.Null()]),
  txStatus: Type.Number(),
  txData: Type.Union([
    Type.Record(Type.String(), Type.Any()),
    Type.Null()
  ]),
  fee: Type.Union([Type.Number(), Type.Null()]),
  timestamp: Type.Number(),
  latency: Type.Number()
});


// Export TypeScript types
export type TokensRequest = Static<typeof TokensRequestSchema>;
export type BalanceRequest = Static<typeof BalanceRequestSchema>;
export type PollRequest = Static<typeof PollRequestSchema>;

// Export response types
export type StatusResponse = Static<typeof StatusResponseSchema>;
export type TokensResponse = Static<typeof TokensResponseSchema>;
export type BalanceResponse = Static<typeof BalanceResponseSchema>;
export type PollResponse = Static<typeof PollResponseSchema>;

export type StatusRequest = Static<typeof StatusRequestSchema>;

export const solanaRoutes: FastifyPluginAsync = async (fastify) => {
  // Register estimate-gas route
  fastify.register(estimateGasRoute);

  // GET /solana/status
  fastify.get<{ Querystring: StatusRequest; Reply: StatusResponse }>(
    '/status',
    {
      schema: {
        tags: ['solana'],
        description: 'Get Solana network status',
        querystring: StatusRequestSchema,
        response: {
          200: StatusResponseSchema
        }
      }
    },
    async (request, reply) => {
      const chain = await getInitializedChain<Solana>('solana', request.query.network);
      const status = await SolanaController.getStatus(chain as Solana, request.query);
      return reply.send(status);
    }
  );

  // GET /solana/tokens
  fastify.get<{ Querystring: TokensRequest; Reply: TokensResponse }>(
    '/tokens',
    {
      schema: {
        tags: ['solana'],
        description: 'Get list of supported Solana tokens with their addresses and decimals',
        querystring: TokensRequestSchema,
        response: {
          200: TokensResponseSchema
        }
      }
    },
    async (request, reply) => {
      const chain = await getInitializedChain<Solana>('solana', request.query.network);
      const response = await SolanaController.getTokens(chain as Solana, request.query);
      return reply.send(response);
    }
  );

  // POST /solana/balances
  fastify.post<{ Body: BalanceRequest; Reply: BalanceResponse }>(
    '/balances',
    {
      schema: {
        tags: ['solana'],
        description: 'Get token balances for a Solana address',
        body: {
          ...BalanceRequestSchema,
          examples: [
            {
              network: 'mainnet-beta',
              address: '<solana-address>',
              tokenSymbols: ['SOL', 'USDC']
            }
          ]
        },
        response: {
          200: BalanceResponseSchema
        }
      }
    },
    async (request, reply) => {
      const chain = await getInitializedChain<Solana>('solana', request.body.network);
      const response = await SolanaController.balances(chain as Solana, request.body);
      return reply.send(response);
    }
  );

  // POST /solana/poll
  fastify.post<{ Body: PollRequest; Reply: PollResponse }>(
    '/poll',
    {
      schema: {
        tags: ['solana'],
        description: 'Poll for the status of a Solana transaction',
        body: {
          ...PollRequestSchema,
          examples: [
            {
              network: 'mainnet-beta',
              txHash: '55ukR6VCt1sQFMC8Nyeo51R1SMaTzUC7jikmkEJ2jjkQNdqBxXHraH7vaoaNmf8rX4Y55EXAj8XXoyzvvsrQqWZa'
            }
          ]
        },
        response: {
          200: PollResponseSchema
        }
      }
    },
    async (request, reply) => {
      const chain = await getInitializedChain<Solana>('solana', request.body.network);
      const response = await SolanaController.poll(chain as Solana, request.body);
      return reply.send(response);
    }
  );
};

export default solanaRoutes;
