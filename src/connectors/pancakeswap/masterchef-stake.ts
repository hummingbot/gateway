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

const MasterChefStakeResponse = Type.Object({
  message: Type.String({ description: 'Human-readable success message.' }),
  txHash: Type.String({ description: 'Transaction hash of the staking transfer.' }),
  // Position details
  poolAddress: Type.String({ description: 'V3 pool contract address for this position.' }),
  poolId: Type.Number({ description: 'MasterChef pool ID.' }),
  baseTokenAddress: Type.String({ description: 'Base token contract address.' }),
  baseTokenSymbol: Type.String({ description: 'Base token symbol (e.g. CAKE).' }),
  quoteTokenAddress: Type.String({ description: 'Quote token contract address.' }),
  quoteTokenSymbol: Type.String({ description: 'Quote token symbol (e.g. USDT).' }),
  feePct: Type.Number({ description: 'Pool trading fee as a percentage (e.g. 0.25 for 0.25%).' }),
  liquidity: Type.String({ description: 'Raw liquidity units in the staked position.' }),
  tickLower: Type.Number({ description: 'Lower tick boundary of the position.' }),
  tickUpper: Type.Number({ description: 'Upper tick boundary of the position.' }),
  currentPrice: Type.Number({ description: 'Current pool price in base/quote terms.' }),
  lowerPrice: Type.Number({ description: 'Lower price bound of the position in base/quote terms.' }),
  upperPrice: Type.Number({ description: 'Upper price bound of the position in base/quote terms.' }),
  inRange: Type.Boolean({ description: 'Whether the position is currently in range and earning trading fees.' }),
  // MasterChef reward / APR metadata
  cakePerSecond: Type.Number({
    description:
      'CAKE tokens distributed per second across the entire pool. Divide by total pool liquidity and multiply by CAKE price to estimate APR.',
  }),
  rewardEndTime: Type.Number({ description: 'Unix timestamp when the current CAKE reward period ends.' }),
  isRewardActive: Type.Boolean({ description: 'Whether the CAKE reward period is currently active.' }),
});

export default async function masterchefStakeRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: MasterChefStakeRequest }>(
    '/masterchef-stake',
    {
      schema: {
        summary: 'Stake a PancakeSwap CLMM NFT in the MasterChef contract',
        description:
          'Stakes a PancakeSwap CLMM position NFT (by tokenId) into the MasterChef contract on the specified network. ' +
          'The transaction is signed and sent by the provided walletAddress, which must own the NFT and have granted MasterChef approval. ' +
          'The response includes full position details (token addresses, price range, liquidity) and MasterChef reward metadata (cakePerSecond, rewardEndTime) that can be used to estimate the current CAKE APR.',
        tags: ['/connector/pancakeswap'],
        body: MasterChefStakeSchema,
        response: {
          200: MasterChefStakeResponse,
          400: Type.Object({ error: Type.String() }),
          500: Type.Object({ error: Type.String() }),
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
        const result = await pancakeswap.stakeNft(tokenId, walletAddress);

        fastify.log.info(
          `Successfully staked tokenId ${tokenId}: pool ${result.poolAddress}, ` +
            `${result.baseTokenSymbol}/${result.quoteTokenSymbol}, cakePerSecond=${result.cakePerSecond}`,
        );

        reply.status(200).send({
          message: `Successfully staked NFT ${tokenId} (${result.baseTokenSymbol}/${result.quoteTokenSymbol}) in MasterChef pool #${result.poolId}`,
          txHash: result.txHash,
          poolAddress: result.poolAddress,
          poolId: result.poolId,
          baseTokenAddress: result.baseTokenAddress,
          baseTokenSymbol: result.baseTokenSymbol,
          quoteTokenAddress: result.quoteTokenAddress,
          quoteTokenSymbol: result.quoteTokenSymbol,
          feePct: result.feePct,
          liquidity: result.liquidity,
          tickLower: result.tickLower,
          tickUpper: result.tickUpper,
          currentPrice: result.currentPrice,
          lowerPrice: result.lowerPrice,
          upperPrice: result.upperPrice,
          inRange: result.inRange,
          cakePerSecond: result.cakePerSecond,
          rewardEndTime: result.rewardEndTime,
          isRewardActive: result.isRewardActive,
        });
      } catch (error) {
        fastify.log.error(`Failed to stake tokenId ${tokenId} with wallet ${walletAddress}: ${error.message}`);
        reply.status(500).send({ error: `Failed to stake NFT: ${error.message}` });
      }
    },
  );
}
