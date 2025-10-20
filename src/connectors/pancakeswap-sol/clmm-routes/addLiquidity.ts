import { Static } from '@sinclair/typebox';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { AddLiquidityResponse, AddLiquidityResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { PancakeswapSol } from '../pancakeswap-sol';
import { buildAddLiquidityTransaction } from '../pancakeswap-sol-utils';
import { PancakeswapSolClmmAddLiquidityRequest } from '../schemas';

async function addLiquidity(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  positionAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
): Promise<AddLiquidityResponseType> {
  const solana = await Solana.getInstance(network);
  const pancakeswapSol = await PancakeswapSol.getInstance(network);

  // Get position info
  const positionInfo = await pancakeswapSol.getPositionInfo(positionAddress);
  if (!positionInfo) {
    throw _fastify.httpErrors.notFound(`Position not found: ${positionAddress}`);
  }

  const wallet = await solana.getWallet(walletAddress);
  const walletPubkey = new PublicKey(walletAddress);
  const positionNftMint = new PublicKey(positionAddress);

  // Get token info
  const baseToken = await solana.getToken(positionInfo.baseTokenAddress);
  const quoteToken = await solana.getToken(positionInfo.quoteTokenAddress);

  if (!baseToken || !quoteToken) {
    throw _fastify.httpErrors.notFound('Token information not found');
  }

  // Convert amounts to BN with decimals
  const amount0Max = new BN(baseTokenAmount * 10 ** baseToken.decimals);
  const amount1Max = new BN(quoteTokenAmount * 10 ** quoteToken.decimals);

  // Use baseTokenAmount as the base (baseFlag=true means base on token0/base)
  const baseFlag = baseTokenAmount > 0;

  logger.info(
    `Adding liquidity to position ${positionAddress}: ${baseTokenAmount} ${baseToken.symbol}, ${quoteTokenAmount} ${quoteToken.symbol}`,
  );

  // Get priority fee
  const priorityFeeInLamports = await solana.estimateGasPrice();
  const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

  // Build transaction
  const transaction = await buildAddLiquidityTransaction(
    solana,
    positionNftMint,
    walletPubkey,
    amount0Max,
    amount1Max,
    baseFlag,
    600000,
    priorityFeePerCU,
  );

  // Sign and send
  transaction.sign([wallet]);
  await solana.simulateWithErrorHandling(transaction, _fastify);

  const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(transaction);

  if (confirmed && txData) {
    const totalFee = txData.meta.fee;

    // Extract balance changes
    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletAddress, [
      baseToken.address,
      quoteToken.address,
    ]);

    const baseTokenChange = balanceChanges[0];
    const quoteTokenChange = balanceChanges[1];

    logger.info(`Liquidity added successfully. Signature: ${signature}`);
    logger.info(
      `Added ${Math.abs(baseTokenChange).toFixed(4)} ${baseToken.symbol}, ${Math.abs(quoteTokenChange).toFixed(4)} ${quoteToken.symbol}`,
    );

    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        fee: totalFee / 1e9,
        baseTokenAmountAdded: Math.abs(baseTokenChange),
        quoteTokenAmountAdded: Math.abs(quoteTokenChange),
      },
    };
  }

  return {
    signature,
    status: 0, // PENDING
  };
}

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof PancakeswapSolClmmAddLiquidityRequest>;
    Reply: AddLiquidityResponseType;
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to an existing PancakeSwap Solana CLMM position',
        tags: ['/connector/pancakeswap-sol'],
        body: PancakeswapSolClmmAddLiquidityRequest,
        response: {
          200: AddLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          network = 'mainnet-beta',
          walletAddress,
          positionAddress,
          baseTokenAmount,
          quoteTokenAmount,
        } = request.body;

        return await addLiquidity(fastify, network, walletAddress, positionAddress, baseTokenAmount, quoteTokenAmount);
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Failed to add liquidity');
      }
    },
  );
};

export default addLiquidityRoute;
