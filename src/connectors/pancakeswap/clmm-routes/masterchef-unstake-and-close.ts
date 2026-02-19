import { Static, Type } from '@sinclair/typebox';
import { FastifyInstance } from 'fastify';

import { logger } from '../../../services/logger';
import { Pancakeswap } from '../pancakeswap';

import { closePosition } from './closePosition';

const MasterChefUnstakeAndCloseSchema = Type.Object({
  network: Type.String({
    description: 'Blockchain network to use (e.g., "bsc")',
    examples: ['bsc'],
    default: 'bsc',
  }),
  walletAddress: Type.String({
    description: 'The wallet address that will sign the transactions. This must be the owner of the position.',
    examples: ['0xA57d70a25847A7457ED75E4e04F8d00bf1BE33bC'],
  }),
  tokenId: Type.Number({
    description: 'Token ID of the NFT position to unstake and close',
    examples: [6450873],
  }),
});

type MasterChefUnstakeAndCloseRequest = Static<typeof MasterChefUnstakeAndCloseSchema>;

export default async function masterchefUnstakeAndCloseRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: MasterChefUnstakeAndCloseRequest }>(
    '/masterchef-unstake-and-close',
    {
      schema: {
        summary: 'Unstake NFT from MasterChef and close the position',
        description:
          'Unstakes a PancakeSwap CLMM position NFT from the MasterChef contract and then closes the position. ' +
          'This is a convenience endpoint that chains two operations: unstake (withdraw from MasterChef) and close-position (remove liquidity and burn NFT). ' +
          'The unstake operation will return the NFT to your wallet and send any accumulated rewards. ' +
          'The close operation will then remove all remaining liquidity, collect any fees, and burn the NFT. ' +
          'Returns detailed information about tokens and fees collected during the close operation.',
        tags: ['/connector/pancakeswap'],
        body: MasterChefUnstakeAndCloseSchema,
        response: {
          200: Type.Object({
            message: Type.String({
              description: 'Success message',
            }),
            unstakeTransaction: Type.String({
              description: 'Transaction hash from the unstake operation',
            }),
            closeTransaction: Type.String({
              description: 'Transaction hash from the close position operation',
            }),
            positionClosed: Type.Object({
              fee: Type.Number({
                description: 'Transaction fee paid in ETH',
              }),
              positionRentRefunded: Type.Number({
                description: 'Position rent refunded',
              }),
              baseTokenAmountRemoved: Type.Number({
                description: 'Amount of base token removed from the position',
              }),
              quoteTokenAmountRemoved: Type.Number({
                description: 'Amount of quote token removed from the position',
              }),
              baseFeeAmountCollected: Type.Number({
                description: 'Base token fees collected',
              }),
              quoteFeeAmountCollected: Type.Number({
                description: 'Quote token fees collected',
              }),
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
        operationId: 'unstakeAndCloseMasterChefPosition',
        externalDocs: {
          url: 'https://docs.pancakeswap.finance/',
          description: 'PancakeSwap Documentation',
        },
        'x-examples': {
          'Unstake and Close Position': {
            value: {
              network: 'bsc',
              walletAddress: '0xA57d70a25847A7457ED75E4e04F8d00bf1BE33bC',
              tokenId: 6450873,
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { network, walletAddress, tokenId } = request.body;

      fastify.log.info(
        `Received unstake-and-close request for tokenId ${tokenId} on network ${network} with wallet ${walletAddress}`,
      );

      try {
        let unstakeTransactionHash = '';

        // Step 1: Unstake the NFT from MasterChef
        fastify.log.info(`Step 1: Unstaking NFT ${tokenId} from MasterChef...`);
        try {
          const pancakeswap = await Pancakeswap.getInstance(network);
          await pancakeswap.unstakeNft(tokenId, walletAddress);
          fastify.log.info(`Successfully unstaked tokenId ${tokenId}`);
          // Note: unstakeNft doesn't return tx hash, so we log that it was executed
          unstakeTransactionHash = `unstaked_${tokenId}`;
        } catch (unstakeError: any) {
          fastify.log.error(`Unstaking failed: ${unstakeError.message}`);
          throw new Error(`Failed to unstake NFT: ${unstakeError.message}`);
        }

        // Add a small delay to ensure the transaction is settled before closing
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Step 2: Close the position (remove liquidity and burn NFT)
        fastify.log.info(`Step 2: Closing position for NFT ${tokenId}...`);
        let closeResult;
        try {
          closeResult = await closePosition(network, walletAddress, tokenId.toString());
          fastify.log.info(`Successfully closed position for tokenId ${tokenId}`);
        } catch (closeError: any) {
          fastify.log.error(`Closing position failed: ${closeError.message}`);
          throw new Error(`Failed to close position: ${closeError.message}`);
        }

        fastify.log.info(`Successfully completed unstake and close operations for tokenId ${tokenId}`);
        reply.status(200).send({
          message:
            `Successfully unstaked NFT with tokenId ${tokenId} from MasterChef and closed the position. ` +
            `The liquidity has been removed, fees have been collected, and the NFT has been burned.`,
          unstakeTransaction: unstakeTransactionHash,
          closeTransaction: closeResult.signature,
          positionClosed: closeResult.data,
        });
      } catch (error: any) {
        fastify.log.error(`Failed to unstake and close tokenId ${tokenId}: ${error.message}`);
        reply.status(500).send({ error: `Failed to unstake and close position: ${error.message}` });
      }
    },
  );
}
