import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import {
  CollectFeesRequest,
  CollectFeesResponse,
  CollectFeesRequestType,
  CollectFeesResponseType,
} from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';

import { removeLiquidity } from './removeLiquidity';

export async function collectFees(
  network: string,
  walletAddress: string,
  positionAddress: string,
): Promise<CollectFeesResponseType> {
  const solana = await Solana.getInstance(network);
  const raydium = await Raydium.getInstance(network);

  // Prepare wallet and check if it's hardware
  const { wallet, isHardwareWallet } = await raydium.prepareWallet(walletAddress);

  // Set the owner for SDK operations
  await raydium.setOwner(wallet);

  const position = await raydium.getClmmPosition(positionAddress);
  if (!position) {
    throw httpErrors.notFound(`Position not found: ${positionAddress}`);
  }

  const [poolInfo] = await raydium.getClmmPoolfromAPI(position.poolId.toBase58());

  const tokenA = await solana.getToken(poolInfo.mintA.address);
  const tokenB = await solana.getToken(poolInfo.mintB.address);

  logger.info(`Collecting fees from CLMM position ${positionAddress} by removing 1% liquidity`);

  // Remove 1% of liquidity to collect fees
  const removeLiquidityResponse = await removeLiquidity(
    network,
    walletAddress,
    positionAddress,
    1, // 1% of position
    false, // don't close position
  );

  if (removeLiquidityResponse.status === 1 && removeLiquidityResponse.data) {
    // Use the new helper to extract balance changes including fees
    const { baseTokenChange, quoteTokenChange } = await solana.extractClmmBalanceChanges(
      removeLiquidityResponse.signature,
      walletAddress,
      tokenA,
      tokenB,
      removeLiquidityResponse.data.fee * 1e9,
    );

    // The total balance change includes both liquidity removal and fee collection
    // Since we know the liquidity amounts from removeLiquidity response,
    // we can calculate the fee amounts
    const baseFeeCollected = Math.abs(baseTokenChange) - removeLiquidityResponse.data.baseTokenAmountRemoved;
    const quoteFeeCollected = Math.abs(quoteTokenChange) - removeLiquidityResponse.data.quoteTokenAmountRemoved;

    logger.info(
      `Fees collected from position ${positionAddress}: ${Math.max(0, baseFeeCollected).toFixed(4)} ${tokenA.symbol}, ${Math.max(0, quoteFeeCollected).toFixed(4)} ${tokenB.symbol}`,
    );

    return {
      signature: removeLiquidityResponse.signature,
      status: 1, // CONFIRMED
      data: {
        fee: removeLiquidityResponse.data.fee,
        baseFeeAmountCollected: Math.max(0, baseFeeCollected),
        quoteFeeAmountCollected: Math.max(0, quoteFeeCollected),
      },
    };
  } else {
    // Return pending status
    return {
      signature: removeLiquidityResponse.signature,
      status: removeLiquidityResponse.status,
    };
  }
}

export const collectFeesRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Solana.getWalletAddressExample();

  fastify.post<{
    Body: CollectFeesRequestType;
    Reply: CollectFeesResponseType;
  }>(
    '/collect-fees',
    {
      schema: {
        description: 'Collect fees from a Raydium CLMM position by removing 1% of liquidity',
        tags: ['/connector/raydium'],
        body: {
          ...CollectFeesRequest,
          properties: {
            ...CollectFeesRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            walletAddress: { type: 'string', examples: [walletAddressExample] },
          },
        },
        response: { 200: CollectFeesResponse },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, positionAddress } = request.body;
        return await collectFees(network, walletAddress, positionAddress);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw httpErrors.createError(e.statusCode, e.message);
        }
        throw httpErrors.internalServerError('Failed to collect fees');
      }
    },
  );
};

export default collectFeesRoute;
