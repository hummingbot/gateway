import {
  AmmV4Keys,
  CpmmKeys,
  ApiV3PoolInfoStandardItem,
  ApiV3PoolInfoStandardItemCpmm,
  Percent,
} from '@raydium-io/raydium-sdk-v2';
import { Static } from '@sinclair/typebox';
import { VersionedTransaction, Transaction, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { RemoveLiquidityResponse, RemoveLiquidityResponseType } from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';
import { RaydiumConfig } from '../raydium.config';
import { RaydiumAmmRemoveLiquidityRequest } from '../schemas';

// Interfaces for SDK responses
interface TokenBurnInfo {
  amount: BN;
  mint: string;
  tokenAccount: string;
}

interface TokenReceiveInfo {
  amount: BN;
  mint: string;
  tokenAccount: string;
}

interface AMMRemoveLiquiditySDKResponse {
  transaction: VersionedTransaction | Transaction;
  tokenBurnInfo?: TokenBurnInfo;
  tokenReceiveInfoA?: TokenReceiveInfo;
  tokenReceiveInfoB?: TokenReceiveInfo;
}

interface CPMMWithdrawLiquiditySDKResponse {
  transaction: VersionedTransaction | Transaction;
  poolMint?: string;
  poolAccount?: string;
  burnAmount?: BN;
  receiveAmountA?: BN;
  receiveAmountB?: BN;
}

async function createRemoveLiquidityTransaction(
  raydium: Raydium,
  ammPoolInfo: any,
  poolInfo: any,
  poolKeys: any,
  lpAmount: BN,
  computeBudgetConfig: { units: number; microLamports: number },
): Promise<VersionedTransaction | Transaction> {
  if (ammPoolInfo.poolType === 'amm') {
    // Use a small slippage for minimum amounts (1%)
    // const slippage = 0.01;
    const baseAmountMin = new BN(0); // We'll accept any amount due to slippage
    const quoteAmountMin = new BN(0); // We'll accept any amount due to slippage

    const response: AMMRemoveLiquiditySDKResponse = await raydium.raydiumSDK.liquidity.removeLiquidity({
      poolInfo: poolInfo as ApiV3PoolInfoStandardItem,
      poolKeys: poolKeys as AmmV4Keys,
      lpAmount: lpAmount,
      baseAmountMin,
      quoteAmountMin,
      txVersion: raydium.txVersion,
      computeBudgetConfig,
    });
    return response.transaction;
  } else if (ammPoolInfo.poolType === 'cpmm') {
    // Use default slippage from config
    const slippage = new Percent(Math.floor(RaydiumConfig.config.slippagePct * 100), 10000);

    const response: CPMMWithdrawLiquiditySDKResponse = await raydium.raydiumSDK.cpmm.withdrawLiquidity({
      poolInfo: poolInfo as ApiV3PoolInfoStandardItemCpmm,
      poolKeys: poolKeys as CpmmKeys,
      lpAmount: lpAmount,
      txVersion: raydium.txVersion,
      slippage,
      computeBudgetConfig,
    });
    return response.transaction;
  }
  throw new Error(`Unsupported pool type: ${ammPoolInfo.poolType}`);
}

/**
 * Calculate the LP token amount to remove based on percentage
 */
async function calculateLpAmountToRemove(
  solana: Solana,
  wallet: any,
  _ammPoolInfo: any,
  poolInfo: any,
  poolAddress: string,
  percentageToRemove: number,
  walletAddress: string,
  isHardwareWallet: boolean,
): Promise<BN> {
  let lpMint: string;

  // Get LP mint from poolInfo instead of poolKeys
  if (poolInfo.lpMint && poolInfo.lpMint.address) {
    lpMint = poolInfo.lpMint.address;
  } else {
    throw new Error(`Could not find LP mint for pool ${poolAddress}`);
  }

  // Get user's LP token account
  const walletPublicKey = isHardwareWallet ? await solana.getPublicKey(walletAddress) : (wallet as any).publicKey;
  const lpTokenAccounts = await solana.connection.getTokenAccountsByOwner(walletPublicKey, {
    mint: new PublicKey(lpMint),
  });

  if (lpTokenAccounts.value.length === 0) {
    throw new Error(`No LP token account found for pool ${poolAddress}`);
  }

  // Get LP token balance
  const lpTokenAccount = lpTokenAccounts.value[0].pubkey;
  const accountInfo = await solana.connection.getTokenAccountBalance(lpTokenAccount);
  const lpBalance = new BN(new Decimal(accountInfo.value.uiAmount).mul(10 ** accountInfo.value.decimals).toFixed(0));

  if (lpBalance.isZero()) {
    throw new Error('LP token balance is zero - nothing to remove');
  }

  // Calculate LP amount to remove based on percentage
  return new BN(new Decimal(lpBalance.toString()).mul(percentageToRemove / 100).toFixed(0));
}

async function removeLiquidity(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  poolAddress: string,
  percentageToRemove: number,
): Promise<RemoveLiquidityResponseType> {
  const solana = await Solana.getInstance(network);
  const raydium = await Raydium.getInstance(network);

  // Prepare wallet and check if it's hardware
  const { wallet, isHardwareWallet } = await raydium.prepareWallet(walletAddress);

  const ammPoolInfo = await raydium.getAmmPoolInfo(poolAddress);
  const [poolInfo, poolKeys] = await raydium.getPoolfromAPI(poolAddress);

  if (percentageToRemove <= 0 || percentageToRemove > 100) {
    throw new Error('Invalid percentageToRemove - must be between 0 and 100');
  }

  // Calculate LP amount to remove
  const lpAmountToRemove = await calculateLpAmountToRemove(
    solana,
    wallet,
    ammPoolInfo,
    poolInfo,
    poolAddress,
    percentageToRemove,
    walletAddress,
    isHardwareWallet,
  );

  logger.info(`Removing ${percentageToRemove.toFixed(4)}% liquidity from pool ${poolAddress}...`);
  // Use hardcoded compute units for AMM remove liquidity
  const COMPUTE_UNITS = 600000;

  // Get priority fee from solana (returns lamports/CU)
  const priorityFeeInLamports = await solana.estimateGasPrice();
  // Convert lamports to microLamports (1 lamport = 1,000,000 microLamports)
  const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

  const transaction = await createRemoveLiquidityTransaction(
    raydium,
    ammPoolInfo,
    poolInfo,
    poolKeys,
    lpAmountToRemove,
    {
      units: COMPUTE_UNITS,
      microLamports: priorityFeePerCU,
    },
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
      tokenAInfo.address,
      tokenBInfo.address,
    ]);

    const baseTokenBalanceChange = balanceChanges[0];
    const quoteTokenBalanceChange = balanceChanges[1];

    logger.info(
      `Liquidity removed from pool ${poolAddress}: ${Math.abs(baseTokenBalanceChange).toFixed(4)} ${poolInfo.mintA.symbol}, ${Math.abs(quoteTokenBalanceChange).toFixed(4)} ${poolInfo.mintB.symbol}`,
    );

    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        fee: txData.meta.fee / 1e9,
        baseTokenAmountRemoved: Math.abs(baseTokenBalanceChange),
        quoteTokenAmountRemoved: Math.abs(quoteTokenBalanceChange),
      },
    };
  } else {
    return {
      signature,
      status: 0, // PENDING
    };
  }
}

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  // const walletAddressExample = await Solana.getWalletAddressExample();

  fastify.post<{
    Body: Static<typeof RaydiumAmmRemoveLiquidityRequest>;
    Reply: RemoveLiquidityResponseType;
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from a Raydium AMM/CPMM pool',
        tags: ['/connector/raydium'],
        body: RaydiumAmmRemoveLiquidityRequest,
        response: {
          200: RemoveLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, poolAddress, percentageToRemove } = request.body;

        return await removeLiquidity(fastify, network, walletAddress, poolAddress, percentageToRemove);
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default removeLiquidityRoute;
