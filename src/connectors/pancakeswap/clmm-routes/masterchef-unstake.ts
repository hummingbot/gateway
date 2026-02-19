import { Static, Type } from '@sinclair/typebox';
import { FastifyInstance } from 'fastify';

import { Pancakeswap } from '../pancakeswap';

const MasterChefUnstakeSchema = Type.Object({
  network: Type.String({ description: 'Blockchain network (e.g., bsc-mainnet)' }),
  walletAddress: Type.String({
    description: 'The wallet address to receive the unstaked NFT and rewards',
    examples: ['0xA57d70a25847A7457ED75E4e04F8d00bf1BE33bC'],
  }),
  tokenId: Type.Number({ description: 'Token ID of the NFT to unstake' }),
});

type MasterChefUnstakeRequest = Static<typeof MasterChefUnstakeSchema>;

export default async function masterchefUnstakeRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: MasterChefUnstakeRequest }>(
    '/masterchef-unstake',
    {
      schema: {
        description: 'Unstake an NFT from the MasterChef contract',
        tags: ['/connector/pancakeswap'],
        body: MasterChefUnstakeSchema,
        response: {
          200: Type.Object({ message: Type.String() }),
          400: Type.Object({ error: Type.String() }),
          500: Type.Object({ error: Type.String() }),
        },
      },
    },
    async (request, reply) => {
      const { network, walletAddress, tokenId } = request.body;

      fastify.log.info(
        `Received unstake request for tokenId ${tokenId} on network ${network} with wallet ${walletAddress}`,
      );

      try {
        const pancakeswap = await Pancakeswap.getInstance(network);
        await pancakeswap.unstakeNft(tokenId, walletAddress);
        fastify.log.info(`Successfully unstaked tokenId ${tokenId}`);
        reply
          .status(200)
          .send({ message: `Successfully unstaked NFT with tokenId ${tokenId} and sent rewards to ${walletAddress}` });
      } catch (error) {
        fastify.log.error(`Failed to unstake tokenId ${tokenId}: ${error.message}`);
        reply.status(500).send({ error: `Failed to unstake NFT: ${error.message}` });
      }
    },
  );
}
