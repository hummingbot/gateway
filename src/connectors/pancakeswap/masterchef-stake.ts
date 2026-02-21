import { Static, Type } from '@sinclair/typebox';
import { FastifyInstance } from 'fastify';

import { Pancakeswap } from './pancakeswap';

const MasterChefStakeSchema = Type.Object({
  network: Type.String({
    description: 'Blockchain network to use (e.g., "bsc").',
    examples: ['bsc'],
    default: 'bsc',
  }),
  walletAddress: Type.String({
    description:
      'The wallet address that will sign and send the staking transaction. This must be an address with the necessary privileges to stake the NFT.',
    examples: ['0x742d35Cc6634C0532925a3b844Bc9e7595f42e0E'],
    default: '0x742d35Cc6634C0532925a3b844Bc9e7595f42e0E',
  }),
  tokenId: Type.Number({
    description: 'Token ID of the NFT to stake in the MasterChef contract.',
    examples: [6350589],
  }),
});

type MasterChefStakeRequest = Static<typeof MasterChefStakeSchema>;

export default async function masterchefStakeRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: MasterChefStakeRequest }>(
    '/masterchef-stake',
    {
      schema: {
        summary: 'Stake a PancakeSwap CLMM NFT in the MasterChef contract',
        description:
          'Stakes a PancakeSwap CLMM position NFT (by tokenId) into the MasterChef contract on the specified network. The transaction is signed and sent by the provided walletAddress, which must have the necessary privileges and NFT approval.',
        tags: ['/connector/pancakeswap'],
        body: MasterChefStakeSchema,
        response: {
          200: Type.Object({
            message: Type.String({
              description: 'Success message indicating the NFT was staked.',
            }),
          }),
          400: Type.Object({
            error: Type.String({
              description: 'Error message for invalid input or request.',
            }),
          }),
          500: Type.Object({
            error: Type.String({
              description: 'Error message for internal server or transaction errors.',
            }),
          }),
        },
        consumes: ['application/json'],
        produces: ['application/json'],
        operationId: 'stakeMasterChefNFT',
        externalDocs: {
          url: 'https://docs.pancakeswap.finance/',
          description: 'PancakeSwap Documentation',
        },
        'x-examples': {
          'Stake NFT': {
            value: {
              network: 'bsc',
              walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f42e0E',
              tokenId: 6350589,
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { network, walletAddress, tokenId } = request.body;

      fastify.log.info(
        `Received stake request for tokenId ${tokenId} on network ${network} with wallet ${walletAddress}`,
      );

      try {
        const pancakeswap = await Pancakeswap.getInstance(network);
        await pancakeswap.stakeNft(tokenId, walletAddress);
        fastify.log.info(`Successfully staked tokenId ${tokenId} with wallet ${walletAddress}`);
        reply
          .status(200)
          .send({ message: `Successfully staked NFT with tokenId ${tokenId} using wallet ${walletAddress}` });
      } catch (error) {
        fastify.log.error(`Failed to stake tokenId ${tokenId} with wallet ${walletAddress}: ${error.message}`);
        reply.status(500).send({ error: `Failed to stake NFT: ${error.message}` });
      }
    },
  );
}
