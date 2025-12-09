import {
  AmmV4Keys,
  CpmmKeys,
  ApiV3PoolInfoStandardItem,
  ApiV3PoolInfoStandardItemCpmm,
  Percent,
  TokenAmount,
  toToken,
} from '@raydium-io/raydium-sdk-v2';
import { Static } from '@sinclair/typebox';
import { VersionedTransaction, Transaction } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import {
  AddLiquidityResponse,
  AddLiquidityResponseType,
  QuoteLiquidityResponseType,
} from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';
import { RaydiumConfig } from '../raydium.config';
import { RaydiumAmmAddLiquidityRequest } from '../schemas';

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
  userBaseAmount: number,
  userQuoteAmount: number,
): Promise<VersionedTransaction | Transaction> {
  if (ammPoolInfo.poolType === 'amm') {
    // Use user's provided amounts as the maximum they're willing to spend
    const amountInA = new TokenAmount(
      toToken(poolInfo.mintA),
      new Decimal(userBaseAmount).mul(10 ** poolInfo.mintA.decimals).toFixed(0),
    );
    const amountInB = new TokenAmount(
      toToken(poolInfo.mintB),
      new Decimal(userQuoteAmount).mul(10 ** poolInfo.mintB.decimals).toFixed(0),
    );

    // Calculate otherAmountMin based on the quoted amounts and slippage
    // Convert Percent to decimal (e.g., 1% = 0.01)
    const slippageDecimal = slippage.numerator.toNumber() / slippage.denominator.toNumber();
    const slippageMultiplier = new Decimal(1).minus(slippageDecimal);

    // For minimum amounts, we use the quoted amounts (exact pool ratio) with slippage
    const otherAmountMin = baseLimited
      ? new TokenAmount(
          toToken(poolInfo.mintB),
          new Decimal(quoteTokenAmountAdded)
            .mul(10 ** poolInfo.mintB.decimals)
            .mul(slippageMultiplier)
            .toFixed(0),
        )
      : new TokenAmount(
          toToken(poolInfo.mintA),
          new Decimal(baseTokenAmountAdded)
            .mul(10 ** poolInfo.mintA.decimals)
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
        .mul(10 ** (baseLimited ? poolInfo.mintA.decimals : poolInfo.mintB.decimals))
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
  slippagePct: number = RaydiumConfig.config.slippagePct,
): Promise<AddLiquidityResponseType> {
  const solana = await Solana.getInstance(network);
  const raydium = await Raydium.getInstance(network);

  // Prepare wallet and check if it's hardware
  const { wallet, isHardwareWallet } = await raydium.prepareWallet(walletAddress);

  const ammPoolInfo = await raydium.getAmmPoolInfo(poolAddress);
  if (!ammPoolInfo) {
    throw _fastify.httpErrors.notFound(`Pool not found for address: ${poolAddress}`);
  }

  // Get pool info and keys since they're no longer in quoteLiquidity response
  const poolResponse = await raydium.getPoolfromAPI(poolAddress);
  if (!poolResponse) {
    throw _fastify.httpErrors.notFound(`Pool not found for address: ${poolAddress}`);
  }
  const [poolInfo, poolKeys] = poolResponse;

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
    baseTokenAmount: quotedBaseAmount,
    quoteTokenAmount: quotedQuoteAmount,
    baseTokenAmountMax,
    quoteTokenAmountMax,
  } = quoteResponse;

  const baseTokenAmountAdded = baseLimited ? baseTokenAmount : quotedBaseAmount;
  const quoteTokenAmountAdded = baseLimited ? quotedQuoteAmount : quoteTokenAmount;

  logger.info(`Adding liquidity to Raydium ${ammPoolInfo.poolType} position...`);
  logger.info(
    `Quote response: baseLimited=${baseLimited}, quotedBase=${quotedBaseAmount}, quotedQuote=${quotedQuoteAmount}`,
  );
  logger.info(`Amounts to add: base=${baseTokenAmountAdded}, quote=${quoteTokenAmountAdded}`);
  // Convert percentage to basis points (e.g., 1% = 100 basis points)
  const slippage = new Percent(Math.floor(slippagePct * 100), 10000);

  // Use hardcoded compute units for AMM add liquidity
  const COMPUTE_UNITS = 400000;

  // Get priority fee from solana (returns lamports/CU)
  const priorityFeeInLamports = await solana.estimateGasPrice();
  // Convert lamports to microLamports (1 lamport = 1,000,000 microLamports)
  const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

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
      units: COMPUTE_UNITS,
      microLamports: priorityFeePerCU,
    },
    baseTokenAmount,
    quoteTokenAmount,
  );

  // Sign transaction using helper
  let signedTransaction: VersionedTransaction | Transaction;
  if (transaction instanceof VersionedTransaction) {
    signedTransaction = (await raydium.signTransaction(
      transaction,
      walletAddress,
      isHardwareWallet,
      wallet,
    )) as VersionedTransaction;
  } else {
    const txAsTransaction = transaction as Transaction;
    const { blockhash, lastValidBlockHeight } = await solana.connection.getLatestBlockhash();
    txAsTransaction.recentBlockhash = blockhash;
    txAsTransaction.lastValidBlockHeight = lastValidBlockHeight;
    txAsTransaction.feePayer = isHardwareWallet ? await solana.getPublicKey(walletAddress) : (wallet as any).publicKey;
    signedTransaction = (await raydium.signTransaction(
      txAsTransaction,
      walletAddress,
      isHardwareWallet,
      wallet,
    )) as Transaction;
  }

  await solana.simulateWithErrorHandling(signedTransaction, _fastify);

  const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(signedTransaction);
  if (confirmed && txData) {
    const tokenAInfo = await solana.getToken(poolInfo.mintA.address);
    const tokenBInfo = await solana.getToken(poolInfo.mintB.address);

    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletAddress, [
      tokenAInfo?.address || poolInfo.mintA.address,
      tokenBInfo?.address || poolInfo.mintB.address,
    ]);

    const baseTokenBalanceChange = balanceChanges[0];
    const quoteTokenBalanceChange = balanceChanges[1];
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
    Body: Static<typeof RaydiumAmmAddLiquidityRequest>;
    Reply: AddLiquidityResponseType;
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to a Raydium AMM/CPMM pool',
        tags: ['/connector/raydium'],
        body: RaydiumAmmAddLiquidityRequest,
        response: {
          200: AddLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, poolAddress, baseTokenAmount, quoteTokenAmount, slippagePct } = request.body;

        return await addLiquidity(
          fastify,
          network,
          walletAddress,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        );
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default addLiquidityRoute;
