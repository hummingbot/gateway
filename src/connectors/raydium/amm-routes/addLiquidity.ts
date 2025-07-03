import {
  AmmV4Keys,
  CpmmKeys,
  ApiV3PoolInfoStandardItem,
  ApiV3PoolInfoStandardItemCpmm,
  Percent,
  TokenAmount,
  toToken,
} from '@raydium-io/raydium-sdk-v2';
import { VersionedTransaction, Transaction } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana, BASE_FEE } from '../../../chains/solana/solana';
import {
  AddLiquidityRequest,
  AddLiquidityResponse,
  AddLiquidityRequestType,
  AddLiquidityResponseType,
  QuoteLiquidityResponseType,
} from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';

import { quoteLiquidity } from './quoteLiquidity';

async function createAddLiquidityTransaction(
  raydium: Raydium,
  ammPoolInfo: any,
  poolInfo: any,
  poolKeys: any,
  baseTokenAmountAdded: number,
  quoteTokenAmountAdded: number,
  baseLimited: boolean,
  slippage: Percent,
  computeBudgetConfig: { units: number; microLamports: number },
): Promise<VersionedTransaction | Transaction> {
  if (ammPoolInfo.poolType === 'amm') {
    const amountInA = new TokenAmount(
      toToken(poolInfo.mintA),
      new Decimal(baseTokenAmountAdded)
        .mul(10 ** poolInfo.mintA.decimals)
        .toFixed(0),
    );
    const amountInB = new TokenAmount(
      toToken(poolInfo.mintB),
      new Decimal(quoteTokenAmountAdded)
        .mul(10 ** poolInfo.mintB.decimals)
        .toFixed(0),
    );

    // Calculate otherAmountMin based on slippage
    // Convert Percent to decimal (e.g., 1% = 0.01)
    const slippageDecimal =
      slippage.numerator.toNumber() / slippage.denominator.toNumber();
    const slippageMultiplier = new Decimal(1).minus(slippageDecimal);
    const otherAmountMin = baseLimited
      ? new TokenAmount(
          toToken(poolInfo.mintB),
          new Decimal(amountInB.raw.toString())
            .mul(slippageMultiplier)
            .toFixed(0),
        )
      : new TokenAmount(
          toToken(poolInfo.mintA),
          new Decimal(amountInA.raw.toString())
            .mul(slippageMultiplier)
            .toFixed(0),
        );

    const response = await raydium.raydiumSDK.liquidity.addLiquidity({
      poolInfo: poolInfo as ApiV3PoolInfoStandardItem,
      poolKeys: poolKeys as AmmV4Keys,
      amountInA,
      amountInB,
      otherAmountMin,
      fixedSide: baseLimited ? 'a' : 'b',
      txVersion: raydium.txVersion,
      computeBudgetConfig,
    });
    return response.transaction;
  } else if (ammPoolInfo.poolType === 'cpmm') {
    const baseIn = baseLimited;
    const inputAmount = new BN(
      new Decimal(baseLimited ? baseTokenAmountAdded : quoteTokenAmountAdded)
        .mul(
          10 **
            (baseLimited ? poolInfo.mintA.decimals : poolInfo.mintB.decimals),
        )
        .toFixed(0),
    );
    const response = await raydium.raydiumSDK.cpmm.addLiquidity({
      poolInfo: poolInfo as ApiV3PoolInfoStandardItemCpmm,
      poolKeys: poolKeys as CpmmKeys,
      inputAmount,
      slippage,
      baseIn,
      txVersion: raydium.txVersion,
      computeBudgetConfig,
    });
    return response.transaction;
  }
  throw new Error(`Unsupported pool type: ${ammPoolInfo.poolType}`);
}

async function addLiquidity(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  poolAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct?: number,
  priorityFeePerCU?: number,
  computeUnits?: number,
): Promise<AddLiquidityResponseType> {
  const solana = await Solana.getInstance(network);
  const raydium = await Raydium.getInstance(network);
  const wallet = await solana.getWallet(walletAddress);

  const ammPoolInfo = await raydium.getAmmPoolInfo(poolAddress);

  // Get pool info and keys since they're no longer in quoteLiquidity response
  const [poolInfo, poolKeys] = await raydium.getPoolfromAPI(poolAddress);

  const quoteResponse = (await quoteLiquidity(
    _fastify,
    network,
    poolAddress,
    baseTokenAmount,
    quoteTokenAmount,
    slippagePct,
  )) as QuoteLiquidityResponseType;

  const {
    baseLimited,
    baseTokenAmountMax,
    quoteTokenAmountMax,
    computeUnits: quoteComputeUnits,
  } = quoteResponse;

  const baseTokenAmountAdded = baseLimited
    ? baseTokenAmount
    : baseTokenAmountMax;
  const quoteTokenAmountAdded = baseLimited
    ? quoteTokenAmount
    : quoteTokenAmountMax;

  logger.info(
    `Adding liquidity to Raydium ${ammPoolInfo.poolType} position...`,
  );
  const slippage = new Percent(
    Math.floor(
      ((slippagePct === 0 ? 0 : slippagePct || raydium.getSlippagePct()) *
        100) /
        10000,
    ),
  );

  // Use provided compute units or quote's estimate
  const computeUnitsToUse = computeUnits || quoteComputeUnits;

  // Calculate priority fee
  let priorityFeePerCUMicroLamports: number;
  if (priorityFeePerCU !== undefined) {
    // Convert from lamports per CU to microlamports per CU
    priorityFeePerCUMicroLamports = Math.floor(priorityFeePerCU * 1000);
  } else {
    // Default priority fee calculation
    const currentPriorityFee = (await solana.estimateGas()) * 1e9 - BASE_FEE;
    priorityFeePerCUMicroLamports = Math.floor(
      (currentPriorityFee * 1e6) / computeUnitsToUse,
    );
  }

  const transaction = await createAddLiquidityTransaction(
    raydium,
    ammPoolInfo,
    poolInfo,
    poolKeys,
    baseTokenAmountAdded,
    quoteTokenAmountAdded,
    baseLimited,
    slippage,
    {
      units: computeUnitsToUse,
      microLamports: priorityFeePerCUMicroLamports,
    },
  );
  console.log('transaction', transaction);

  if (transaction instanceof VersionedTransaction) {
    (transaction as VersionedTransaction).sign([wallet]);
  } else {
    const txAsTransaction = transaction as Transaction;
    const { blockhash, lastValidBlockHeight } =
      await solana.connection.getLatestBlockhash();
    txAsTransaction.recentBlockhash = blockhash;
    txAsTransaction.lastValidBlockHeight = lastValidBlockHeight;
    txAsTransaction.feePayer = wallet.publicKey;
    txAsTransaction.sign(wallet);
  }

  await solana.simulateTransaction(transaction);

  console.log('signed transaction', transaction);

  const { confirmed, signature, txData } =
    await solana.sendAndConfirmRawTransaction(transaction);
  if (confirmed && txData) {
    const { baseTokenBalanceChange, quoteTokenBalanceChange } =
      await solana.extractPairBalanceChangesAndFee(
        signature,
        await solana.getToken(poolInfo.mintA.address),
        await solana.getToken(poolInfo.mintB.address),
        wallet.publicKey.toBase58(),
      );
    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        fee: txData.meta.fee / 1e9,
        baseTokenAmountAdded: baseTokenBalanceChange,
        quoteTokenAmountAdded: quoteTokenBalanceChange,
      },
    };
  } else {
    return {
      signature,
      status: 0, // PENDING
    };
  }
}

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  // const walletAddressExample = await Solana.getWalletAddressExample();

  fastify.post<{
    Body: AddLiquidityRequestType;
    Reply: AddLiquidityResponseType;
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to a Raydium AMM/CPMM pool',
        tags: ['/connector/raydium'],
        body: AddLiquidityRequest,
        response: {
          200: AddLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          network,
          walletAddress,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        } = request.body;

        return await addLiquidity(
          fastify,
          network,
          walletAddress,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
          request.body.priorityFeePerCU,
          request.body.computeUnits,
        );
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default addLiquidityRoute;
