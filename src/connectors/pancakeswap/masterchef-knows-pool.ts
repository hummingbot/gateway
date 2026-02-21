import { Static, Type } from '@sinclair/typebox';
import { FastifyInstance } from 'fastify';

import { Pancakeswap } from './pancakeswap';

const MasterChefKnowsPoolSchema = Type.Object({
  network: Type.String({
    description: 'Blockchain network to use (e.g., "bsc").',
    examples: ['bsc'],
    default: 'bsc',
  }),
  poolAddress: Type.String({
    description: 'The address of the PancakeSwap V3 pool to check.',
    examples: ['0xA5067360b13Fc7A2685Dc82dcD1bF2B4B8D7868B'],
  }),
});

type MasterChefKnowsPoolRequest = Static<typeof MasterChefKnowsPoolSchema>;

export default async function masterchefKnowsPoolRoute(fastify: FastifyInstance) {
  fastify.post<{ Body: MasterChefKnowsPoolRequest }>(
    '/masterchef-knows-pool',
    {
      schema: {
        summary: 'Check if MasterChef knows a PancakeSwap V3 pool',
        description:
          'Checks if the given PancakeSwap V3 pool address is registered in the MasterChef contract (using v3PoolAddressPid). Returns the pool ID if registered, or 0 if not.',
        tags: ['/connector/pancakeswap'],
        operationId: 'masterchefKnowsPool',
        body: MasterChefKnowsPoolSchema,
        response: {
          200: Type.Object({
            poolId: Type.String({ description: 'The pool ID if registered, or 0 if not.' }),
            known: Type.Boolean({ description: 'True if the pool is registered in MasterChef.' }),
          }),
          400: Type.Object({ error: Type.String() }),
          500: Type.Object({ error: Type.String() }),
        },
        consumes: ['application/json'],
        produces: ['application/json'],
        'x-examples': {
          'Check Pool': {
            value: {
              network: 'bsc',
              poolAddress: '0xA5067360b13Fc7A2685Dc82dcD1bF2B4B8D7868B',
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { network, poolAddress } = request.body;
      try {
        const pancakeswap = await Pancakeswap.getInstance(network);
        // Use the Pancakeswap instance to get the masterChef contract and ABI
        const poolId = await pancakeswap.getV3PoolIdFromMasterChef(poolAddress);
        reply.status(200).send({ poolId: poolId.toString(), known: poolId !== 0 });
      } catch (error) {
        fastify.log.error(`Failed to check pool in MasterChef: ${error.message}`);
        reply.status(500).send({ error: `Failed to check pool in MasterChef: ${error.message}` });
      }
    },
  );
}
