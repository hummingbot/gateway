import { TxVersion } from '@raydium-io/raydium-sdk-v2';
import { Static } from '@sinclair/typebox';
import { VersionedTransaction } from '@solana/web3.js';
import BN from 'bn.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { AddLiquidityResponse, AddLiquidityResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';
import { RaydiumConfig } from '../raydium.config';
import { RaydiumClmmAddLiquidityRequest } from '../schemas';

import { quotePosition } from './quotePosition';

export async function addLiquidity(
  network: string,
  walletAddress: string,
  positionAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct: number = RaydiumConfig.config.slippagePct,
): Promise<AddLiquidityResponseType> {
  const solana = await Solana.getInstance(network);
  const raydium = await Raydium.getInstance(network);

  // Prepare wallet and check if it's hardware
  const { wallet, isHardwareWallet } = await raydium.prepareWallet(walletAddress);

  const positionInfo = await raydium.getPositionInfo(positionAddress);
  const position = await raydium.getClmmPosition(positionAddress);
  if (!position) throw new Error('Position not found');

  const [poolInfo, poolKeys] = await raydium.getClmmPoolfromAPI(positionInfo.poolAddress);
  // const clmmPool = await raydium.getClmmPoolfromRPC(positionInfo.poolAddress);

  const baseToken = await solana.getToken(poolInfo.mintA.address);
  const quoteToken = await solana.getToken(poolInfo.mintB.address);

  const quotePositionResponse = await quotePosition(
    network,
    positionInfo.lowerPrice,
    positionInfo.upperPrice,
    positionInfo.poolAddress,
    baseTokenAmount,
    quoteTokenAmount,
    slippagePct,
  );
  console.log('quotePositionResponse', quotePositionResponse);
  logger.info('Adding liquidity to Raydium CLMM position...');

  // Use hardcoded compute units for add liquidity
  const COMPUTE_UNITS = 600000;

  // Get priority fee from solana (returns lamports/CU)
  const priorityFeeInLamports = await solana.estimateGasPrice();
  // Convert lamports to microLamports (1 lamport = 1,000,000 microLamports)
  const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

  let { transaction } = await raydium.raydiumSDK.clmm.increasePositionFromBase({
    poolInfo,
    ownerPosition: position,
    ownerInfo: { useSOLBalance: true },
    base: quotePositionResponse.baseLimited ? 'MintA' : 'MintB',
    baseAmount: quotePositionResponse.baseLimited
      ? new BN(quotePositionResponse.baseTokenAmount * 10 ** baseToken.decimals)
      : new BN(quotePositionResponse.quoteTokenAmount * 10 ** quoteToken.decimals),
    otherAmountMax: quotePositionResponse.baseLimited
      ? new BN(quotePositionResponse.quoteTokenAmountMax * 10 ** quoteToken.decimals)
      : new BN(quotePositionResponse.baseTokenAmountMax * 10 ** baseToken.decimals),
    txVersion: TxVersion.V0,
    computeBudgetConfig: {
      units: COMPUTE_UNITS,
      microLamports: priorityFeePerCU,
    },
  });

  // Sign transaction using helper
  transaction = (await raydium.signTransaction(
    transaction,
    walletAddress,
    isHardwareWallet,
    wallet,
  )) as VersionedTransaction;
  await solana.simulateWithErrorHandling(transaction);

  const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(transaction);

  if (confirmed && txData) {
    const totalFee = txData.meta.fee;

    // Handle balance changes - need to be careful when SOL is one of the tokens
    const tokenAddresses = [];
    const isBaseSol = baseToken.symbol === 'SOL' || baseToken.address === 'So11111111111111111111111111111111111111112';
    const isQuoteSol =
      quoteToken.symbol === 'SOL' || quoteToken.address === 'So11111111111111111111111111111111111111112';

    // Always get SOL balance change first
    tokenAddresses.push('So11111111111111111111111111111111111111112');

    // Add non-SOL tokens
    if (!isBaseSol) {
      tokenAddresses.push(baseToken.address);
    }
    if (!isQuoteSol) {
      tokenAddresses.push(quoteToken.address);
    }

    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletAddress, tokenAddresses);

    // Parse balance changes
    const solChangeIndex = 0;
    const baseChangeIndex = isBaseSol ? 0 : 1;
    const quoteChangeIndex = isQuoteSol ? 0 : isBaseSol ? 1 : 2;

    const baseTokenBalanceChange = balanceChanges[baseChangeIndex];
    const quoteTokenBalanceChange = balanceChanges[quoteChangeIndex];

    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        fee: totalFee / 1e9,
        baseTokenAmountAdded: baseTokenBalanceChange,
        quoteTokenAmountAdded: quoteTokenBalanceChange,
      },
    };
  } else {
    // Return pending status for Hummingbot to handle retry
    return {
      signature,
      status: 0, // PENDING
    };
  }
}

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof RaydiumClmmAddLiquidityRequest>;
    Reply: AddLiquidityResponseType;
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to existing Raydium CLMM position',
        tags: ['/connector/raydium'],
        body: RaydiumClmmAddLiquidityRequest,
        response: {
          200: AddLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, positionAddress, baseTokenAmount, quoteTokenAmount, slippagePct } =
          request.body;

        return await addLiquidity(
          network,
          walletAddress,
          positionAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        );
      } catch (e) {
        logger.error(e);
        throw httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default addLiquidityRoute;
