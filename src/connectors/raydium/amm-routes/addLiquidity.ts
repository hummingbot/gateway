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
import Decimal from 'decimal.js';
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
    const response = await raydium.raydiumSDK.liquidity.addLiquidity({
      poolInfo: poolInfo as ApiV3PoolInfoStandardItem,
      poolKeys: poolKeys as AmmV4Keys,
      amountInA: new TokenAmount(
        toToken(poolInfo.mintA),
        new Decimal(baseTokenAmountAdded)
          .mul(10 ** poolInfo.mintA.decimals)
          .toFixed(0),
      ),
      amountInB: new TokenAmount(
        toToken(poolInfo.mintB),
        new Decimal(quoteTokenAmountAdded)
          .mul(10 ** poolInfo.mintB.decimals)
          .toFixed(0),
      ),
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
  baseToken?: string,
  quoteToken?: string,
  slippagePct?: number,
): Promise<AddLiquidityResponseType> {
  const solana = await Solana.getInstance(network);
  const raydium = await Raydium.getInstance(network);
  const wallet = await solana.getWallet(walletAddress);

  // If no pool address provided, find default pool using base and quote tokens
  let poolAddressToUse = poolAddress;
  if (!poolAddressToUse) {
    if (!baseToken || !quoteToken) {
      throw new Error(
        'Either poolAddress or both baseToken and quoteToken must be provided',
      );
    }

    poolAddressToUse = await raydium.findDefaultPool(
      baseToken,
      quoteToken,
      'amm',
    );
    if (!poolAddressToUse) {
      throw new Error(`No AMM pool found for pair ${baseToken}-${quoteToken}`);
    }
  }

  const ammPoolInfo = await raydium.getAmmPoolInfo(poolAddressToUse);

  // Get pool info and keys since they're no longer in quoteLiquidity response
  const [poolInfo, poolKeys] = await raydium.getPoolfromAPI(poolAddressToUse);

  const { baseLimited, baseTokenAmountMax, quoteTokenAmountMax } =
    (await quoteLiquidity(
      _fastify,
      network,
      poolAddressToUse,
      baseTokenAmount,
      quoteTokenAmount,
      slippagePct,
    )) as QuoteLiquidityResponseType;

  const baseTokenAmountAdded = baseLimited
    ? baseTokenAmount
    : baseTokenAmountMax;
  const quoteTokenAmountAdded = baseLimited
    ? quoteTokenAmount
    : quoteTokenAmountMax;

  logger.info(
    `Adding liquidity to Raydium ${ammPoolInfo.poolType} position...`,
  );
  const COMPUTE_UNITS = 600000;
  const slippage = new Percent(
    Math.floor(
      ((slippagePct === 0 ? 0 : slippagePct || raydium.getSlippagePct()) *
        100) /
        10000,
    ),
  );

  let currentPriorityFee = (await solana.estimateGas()) * 1e9 - BASE_FEE;
  while (currentPriorityFee <= solana.config.maxPriorityFee * 1e9) {
    const priorityFeePerCU = Math.floor(
      (currentPriorityFee * 1e6) / COMPUTE_UNITS,
    );

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
        fee: txData.meta.fee / 1e9,
        baseTokenAmountAdded: baseTokenBalanceChange,
        quoteTokenAmountAdded: quoteTokenBalanceChange,
      };
    }
    currentPriorityFee =
      currentPriorityFee * solana.config.priorityFeeMultiplier;
    logger.info(
      `Increasing max priority fee to ${(currentPriorityFee / 1e9).toFixed(6)} SOL`,
    );
  }
  throw new Error(
    `Add liquidity failed after reaching max priority fee of ${(solana.config.maxPriorityFee / 1e9).toFixed(6)} SOL`,
  );
}

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  const firstWalletAddress = await Solana.getWalletAddressExample();

  // Update schema example
  AddLiquidityRequest.properties.walletAddress.examples = [firstWalletAddress];

  fastify.post<{
    Body: AddLiquidityRequestType;
    Reply: AddLiquidityResponseType;
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to a Raydium AMM/CPMM pool',
        tags: ['raydium/amm'],
        body: {
          ...AddLiquidityRequest,
          properties: {
            ...AddLiquidityRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            poolAddress: {
              type: 'string',
              examples: ['6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg'],
            }, // AMM RAY-USDC
            baseToken: { type: 'string', examples: ['SOL'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            slippagePct: { type: 'number', examples: [1] },
            baseTokenAmount: { type: 'number', examples: [1] },
            quoteTokenAmount: { type: 'number', examples: [1] },
          },
        },
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
          baseToken,
          quoteToken,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        } = request.body;

        // Check if either poolAddress or both baseToken and quoteToken are provided
        if (!poolAddress && (!baseToken || !quoteToken)) {
          throw fastify.httpErrors.badRequest(
            'Either poolAddress or both baseToken and quoteToken must be provided',
          );
        }

        return await addLiquidity(
          fastify,
          network || 'mainnet-beta',
          walletAddress,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          baseToken,
          quoteToken,
          slippagePct,
        );
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default addLiquidityRoute;
