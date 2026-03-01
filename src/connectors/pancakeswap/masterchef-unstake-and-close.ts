import { Static, Type } from '@sinclair/typebox';
import { FastifyInstance } from 'fastify';

import { closePosition } from './clmm-routes/closePosition';
import { Pancakeswap } from './pancakeswap';

const MasterChefUnstakeAndCloseSchema = Type.Object({
  network: Type.String({
    description: 'Blockchain network to use (e.g., "bsc")',
    examples: ['bsc'],
    default: 'bsc',
  }),
  walletAddress: Type.String({
    description: 'The wallet address that will sign the transactions. This must be the owner of the position.',
    examples: ['0x742d35Cc6634C0532925a3b844Bc9e7595f42e0E'],
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
          'This is a convenience endpoint that chains two operations: unstake (withdraw from MasterChef, harvesting CAKE) and close-position (remove liquidity and burn NFT). ' +
          'The response includes: CAKE rewards earned during unstake, token symbols and amounts returned when closing, and all collected trading fees.',
        tags: ['/connector/pancakeswap'],
        body: MasterChefUnstakeAndCloseSchema,
        response: {
          200: Type.Object({
            message: Type.String({ description: 'Success message' }),
            unstakeTransaction: Type.String({ description: 'Transaction hash from the unstake operation' }),
            closeTransaction: Type.String({ description: 'Transaction hash from the close position operation' }),
            // CAKE rewards from unstaking
            cakeRewardAmount: Type.Number({ description: 'Amount of CAKE tokens harvested during the unstake' }),
            rewardToken: Type.String({ description: 'Reward token symbol (CAKE)' }),
            rewardTokenAddress: Type.String({ description: 'Reward token contract address' }),
            // LP position close details
            positionClosed: Type.Object({
              fee: Type.Number({ description: 'Gas fee paid for the close transaction (in ETH/BNB)' }),
              positionRentRefunded: Type.Number({ description: 'Position rent refunded (0 on EVM chains)' }),
              baseTokenAmountRemoved: Type.Number({ description: 'Amount of base token removed from the position' }),
              quoteTokenAmountRemoved: Type.Number({
                description: 'Amount of quote token removed from the position',
              }),
              baseFeeAmountCollected: Type.Number({ description: 'Accumulated base token trading fees collected' }),
              quoteFeeAmountCollected: Type.Number({ description: 'Accumulated quote token trading fees collected' }),
              baseTokenSymbol: Type.Optional(Type.String({ description: 'Base token symbol (e.g. CAKE)' })),
              baseTokenAddress: Type.Optional(Type.String({ description: 'Base token contract address' })),
              quoteTokenSymbol: Type.Optional(Type.String({ description: 'Quote token symbol (e.g. USDT)' })),
              quoteTokenAddress: Type.Optional(Type.String({ description: 'Quote token contract address' })),
            }),
          }),
          400: Type.Object({ error: Type.String() }),
          500: Type.Object({ error: Type.String() }),
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
              walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f42e0E',
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
        // Step 1: Unstake the NFT from MasterChef (also harvests accumulated CAKE)
        fastify.log.info(`Step 1: Unstaking NFT ${tokenId} from MasterChef...`);
        let unstakeResult: { txHash: string; rewardAmount: number; rewardToken: string; rewardTokenAddress: string };
        try {
          const pancakeswap = await Pancakeswap.getInstance(network);
          unstakeResult = await pancakeswap.unstakeNft(tokenId, walletAddress);
          fastify.log.info(
            `Successfully unstaked tokenId ${tokenId}: earned ${unstakeResult.rewardAmount} ${unstakeResult.rewardToken}, tx ${unstakeResult.txHash}`,
          );
        } catch (unstakeError: any) {
          fastify.log.error(`Unstaking failed: ${unstakeError.message}`);
          throw new Error(`Failed to unstake NFT: ${unstakeError.message}`);
        }

        // Add a small delay to ensure the unstake transaction is settled before closing
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Step 2: Close the position (remove all liquidity, collect fees, burn NFT)
        fastify.log.info(`Step 2: Closing position for NFT ${tokenId}...`);
        let closeResult;
        try {
          closeResult = await closePosition(network, walletAddress, tokenId.toString());
          fastify.log.info(`Successfully closed position for tokenId ${tokenId}`);
        } catch (closeError: any) {
          fastify.log.error(`Closing position failed: ${closeError.message}`);
          throw new Error(`Failed to close position: ${closeError.message}`);
        }

        const baseSymbol = closeResult.data?.baseTokenSymbol ?? '';
        const quoteSymbol = closeResult.data?.quoteTokenSymbol ?? '';

        fastify.log.info(`Successfully completed unstake-and-close for tokenId ${tokenId}`);
        reply.status(200).send({
          message:
            `Successfully unstaked NFT ${tokenId} from MasterChef (harvested ${unstakeResult.rewardAmount} ${unstakeResult.rewardToken}) ` +
            `and closed the position (returned ${closeResult.data?.baseTokenAmountRemoved ?? 0} ${baseSymbol} + ` +
            `${closeResult.data?.quoteTokenAmountRemoved ?? 0} ${quoteSymbol}). ` +
            `The NFT has been burned.`,
          unstakeTransaction: unstakeResult.txHash,
          closeTransaction: closeResult.signature,
          cakeRewardAmount: unstakeResult.rewardAmount,
          rewardToken: unstakeResult.rewardToken,
          rewardTokenAddress: unstakeResult.rewardTokenAddress,
          positionClosed: closeResult.data,
        });
      } catch (error: any) {
        fastify.log.error(`Failed to unstake and close tokenId ${tokenId}: ${error.message}`);
        reply.status(500).send({ error: `Failed to unstake and close position: ${error.message}` });
      }
    },
  );
}
