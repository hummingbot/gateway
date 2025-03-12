import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { getInitializedChain } from '../../services/connection-manager';
import { PolkadotController } from './polkadot.controllers';
import { Polkadot } from './polkadot';
import { TransactionStatus } from './polkadot.types';

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
  txHash: Type.String(),
  address: Type.Optional(Type.String())
});

const StakingRequestSchema = Type.Object({
  network: Type.String(),
  address: Type.String()
});

const TransferRequestSchema = Type.Object({
  network: Type.String(),
  fromAddress: Type.String(),
  toAddress: Type.String(),
  amount: Type.Number(),
  tokenSymbol: Type.String(),
  tip: Type.Optional(Type.String()),
  keepAlive: Type.Optional(Type.Boolean()),
  waitForFinalization: Type.Optional(Type.Boolean())
});

const MetadataRequestSchema = Type.Object({
  network: Type.String(),
  palletName: Type.String()
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
  balanceChange: Type.Union([Type.Number(), Type.Null()]),
  timestamp: Type.Number(),
  latency: Type.Number()
});

const StakingResponseSchema = Type.Object({
  address: Type.String(),
  stakingInfo: Type.Object({
    totalStake: Type.String(),
    ownStake: Type.String(),
    rewardDestination: Type.String(),
    nominators: Type.Array(Type.Object({
      address: Type.String(),
      value: Type.String()
    })),
    validators: Type.Array(Type.Object({
      address: Type.String(),
      value: Type.String(),
      commission: Type.String()
    }))
  }),
  timestamp: Type.Number(),
  latency: Type.Number()
});

const TransferResponseSchema = Type.Object({
  txHash: Type.String(),
  blockHash: Type.String(),
  blockNumber: Type.Number(),
  status: Type.Number(),
  fee: Type.Union([Type.String(), Type.Null()]),
  timestamp: Type.Number(),
  latency: Type.Number()
});

const MetadataResponseSchema = Type.Object({
  palletName: Type.String(),
  metadata: Type.Record(Type.String(), Type.Any()),
  timestamp: Type.Number(),
  latency: Type.Number()
});

// Export TypeScript types
export type TokensRequest = Static<typeof TokensRequestSchema>;
export type BalanceRequest = Static<typeof BalanceRequestSchema>;
export type PollRequest = Static<typeof PollRequestSchema>;
export type StatusRequest = Static<typeof StatusRequestSchema>;
export type StakingRequest = Static<typeof StakingRequestSchema>;
export type TransferRequest = Static<typeof TransferRequestSchema>;
export type MetadataRequest = Static<typeof MetadataRequestSchema>;

// Export response types
export type StatusResponse = Static<typeof StatusResponseSchema>;
export type TokensResponse = Static<typeof TokensResponseSchema>;
export type BalanceResponse = Static<typeof BalanceResponseSchema>;
export type PollResponse = Static<typeof PollResponseSchema>;
export type StakingResponse = Static<typeof StakingResponseSchema>;
export type TransferResponse = Static<typeof TransferResponseSchema>;
export type MetadataResponse = Static<typeof MetadataResponseSchema>;

export const polkadotRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /polkadot/status
  fastify.get<{ Querystring: StatusRequest; Reply: StatusResponse }>(
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
      const status = await PolkadotController.getStatus(chain as Polkadot, request.query);
      return reply.send(status);
    }
  );

  // GET /polkadot/tokens
  fastify.get<{ Querystring: TokensRequest; Reply: TokensResponse }>(
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
      const response = await PolkadotController.getTokens(chain as Polkadot, request.query);
      return reply.send(response);
    }
  );

  // POST /polkadot/balances
  fastify.post<{ Body: BalanceRequest; Reply: BalanceResponse }>(
    '/balances',
    {
      schema: {
        tags: ['polkadot'],
        description: 'Get token balances for a Polkadot address',
        body: {
          ...BalanceRequestSchema,
          examples: [
            {
              network: 'mainnet',
              address: '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5',
              tokenSymbols: ['DOT', 'KSM']
            }
          ]
        },
        response: {
          200: BalanceResponseSchema
        }
      }
    },
    async (request, reply) => {
      const chain = await getInitializedChain<Polkadot>('polkadot', request.body.network);
      const response = await PolkadotController.balances(chain as Polkadot, request.body);
      return reply.send(response);
    }
  );

  // POST /polkadot/poll
  fastify.post<{ Body: PollRequest; Reply: PollResponse }>(
    '/poll',
    {
      schema: {
        tags: ['polkadot'],
        description: 'Poll for the status of a Polkadot transaction',
        body: {
          ...PollRequestSchema,
          examples: [
            {
              network: 'mainnet',
              txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
              address: '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5'
            }
          ]
        },
        response: {
          200: PollResponseSchema
        }
      }
    },
    async (request, reply) => {
      const chain = await getInitializedChain<Polkadot>('polkadot', request.body.network);
      const response = await PolkadotController.poll(chain as Polkadot, request.body);
      return reply.send(response);
    }
  );

  // GET /polkadot/staking
  fastify.get<{ Querystring: StakingRequest; Reply: StakingResponse }>(
    '/staking',
    {
      schema: {
        tags: ['polkadot'],
        description: 'Get staking information for a Polkadot address',
        querystring: StakingRequestSchema,
        response: {
          200: StakingResponseSchema
        }
      }
    },
    async (request, reply) => {
      const chain = await getInitializedChain<Polkadot>('polkadot', request.query.network);
      const response = await PolkadotController.getStakingInfo(chain as Polkadot, request.query);
      return reply.send(response);
    }
  );

  // POST /polkadot/transfer
  fastify.post<{ Body: TransferRequest; Reply: TransferResponse }>(
    '/transfer',
    {
      schema: {
        tags: ['polkadot'],
        description: 'Transfer tokens from one Polkadot address to another',
        body: {
          ...TransferRequestSchema,
          examples: [
            {
              network: 'mainnet',
              fromAddress: '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5',
              toAddress: '14Gjs1TD93gnwEBfDMHoCgsuf1s2TVKUP6Z1qKmAZnZ8cW5q',
              amount: 1.5,
              tokenSymbol: 'DOT',
              keepAlive: true
            }
          ]
        },
        response: {
          200: TransferResponseSchema
        }
      }
    },
    async (request, reply) => {
      const chain = await getInitializedChain<Polkadot>('polkadot', request.body.network);
      const response = await PolkadotController.transfer(chain as Polkadot, request.body);
      return reply.send(response);
    }
  );

  // GET /polkadot/metadata
  fastify.get<{ Querystring: MetadataRequest; Reply: MetadataResponse }>(
    '/metadata',
    {
      schema: {
        tags: ['polkadot'],
        description: 'Get metadata for a specific Polkadot pallet',
        querystring: MetadataRequestSchema,
        response: {
          200: MetadataResponseSchema
        }
      }
    },
    async (request, reply) => {
      const chain = await getInitializedChain<Polkadot>('polkadot', request.query.network);
      const response = await PolkadotController.getMetadata(chain as Polkadot, request.query);
      return reply.send(response);
    }
  );
};

export default polkadotRoutes;

