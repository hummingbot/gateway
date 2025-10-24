/**
 * Raydium AMM Remove Liquidity Operation
 *
 * Implements the OperationBuilder pattern for removing liquidity from Raydium AMM/CPMM pools.
 * Extracted from Gateway's route handlers to provide pure SDK functionality.
 */

import {
  AmmV4Keys,
  CpmmKeys,
  ApiV3PoolInfoStandardItem,
  ApiV3PoolInfoStandardItemCpmm,
  Percent,
} from '@raydium-io/raydium-sdk-v2';
import { VersionedTransaction, Transaction, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';

import {
  OperationBuilder,
  Transaction as SDKTransaction,
  ValidationResult,
  SimulationResult,
} from '../../../../../../core/src/types/protocol';
import { RemoveLiquidityParams, RemoveLiquidityResult } from '../../types/amm';

/**
 * Remove Liquidity Operation
 *
 * Implements OperationBuilder for removing liquidity from Raydium pools.
 */
export class RemoveLiquidityOperation
  implements OperationBuilder<RemoveLiquidityParams, RemoveLiquidityResult>
{
  constructor(
    private raydium: any, // Will be typed properly with RaydiumConnector
    private solana: any, // Solana chain instance
  ) {}

  /**
   * Validate parameters
   */
  async validate(params: RemoveLiquidityParams): Promise<ValidationResult> {
    const errors: string[] = [];

    // Validate pool address
    if (!params.poolAddress || params.poolAddress.length === 0) {
      errors.push('Pool address is required');
    }

    // Validate wallet address
    if (!params.walletAddress || params.walletAddress.length === 0) {
      errors.push('Wallet address is required');
    }

    // Validate percentage to remove
    if (params.percentageToRemove <= 0 || params.percentageToRemove > 100) {
      errors.push('Percentage to remove must be between 0 and 100');
    }

    // Check if pool exists
    try {
      const ammPoolInfo = await this.raydium.getAmmPoolInfo(params.poolAddress);
      if (!ammPoolInfo) {
        errors.push(`Pool not found for address: ${params.poolAddress}`);
      }
    } catch (error: any) {
      errors.push(`Failed to fetch pool info: ${error.message}`);
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Simulate transaction
   *
   * Returns estimated token amounts to be withdrawn
   */
  async simulate(params: RemoveLiquidityParams): Promise<SimulationResult> {
    try {
      // Get pool info
      const [poolInfo] = await this.raydium.getPoolfromAPI(params.poolAddress);

      // Get priority fee estimate
      const priorityFeeInLamports = await this.solana.estimateGasPrice();
      const COMPUTE_UNITS = 600000;
      const estimatedFee = (priorityFeeInLamports * COMPUTE_UNITS) / 1e9;

      return {
        success: true,
        changes: {
          balanceChanges: [
            {
              token: poolInfo.mintA.symbol,
              amount: 'TBD', // Calculated based on LP amount
              direction: 'in',
            },
            {
              token: poolInfo.mintB.symbol,
              amount: 'TBD', // Calculated based on LP amount
              direction: 'in',
            },
            {
              token: 'LP_TOKEN',
              amount: `${params.percentageToRemove}%`,
              direction: 'out',
            },
          ],
        },
        estimatedFee: {
          amount: estimatedFee.toString(),
          token: 'SOL',
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Simulation failed: ${error.message}`,
      };
    }
  }

  /**
   * Build unsigned transaction
   */
  async build(params: RemoveLiquidityParams): Promise<SDKTransaction> {
    const ammPoolInfo = await this.raydium.getAmmPoolInfo(params.poolAddress);
    const [poolInfo, poolKeys] = await this.raydium.getPoolfromAPI(params.poolAddress);

    // Prepare wallet
    const { wallet, isHardwareWallet } = await this.raydium.prepareWallet(params.walletAddress);

    // Calculate LP amount to remove
    const lpAmountToRemove = await this.calculateLpAmountToRemove(
      wallet,
      ammPoolInfo,
      poolInfo,
      params.poolAddress,
      params.percentageToRemove,
      params.walletAddress,
      isHardwareWallet,
    );

    // Get priority fee
    const COMPUTE_UNITS = 600000;
    const priorityFeeInLamports = await this.solana.estimateGasPrice();
    const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

    // Create transaction
    const transaction = await this.createTransaction(
      ammPoolInfo,
      poolInfo,
      poolKeys,
      lpAmountToRemove,
      {
        units: COMPUTE_UNITS,
        microLamports: priorityFeePerCU,
      },
    );

    // Calculate estimated fee
    const estimatedFee = (priorityFeeInLamports * COMPUTE_UNITS) / 1e9;

    return {
      raw: transaction,
      description: `Remove ${params.percentageToRemove}% liquidity from pool`,
      estimatedFee: {
        amount: estimatedFee.toString(),
        token: 'SOL',
      },
    };
  }

  /**
   * Execute transaction (signs and submits)
   */
  async execute(params: RemoveLiquidityParams): Promise<RemoveLiquidityResult> {
    // Build transaction
    const tx = await this.build(params);
    const transaction = tx.raw as VersionedTransaction | Transaction;

    // Prepare wallet
    const { wallet, isHardwareWallet } = await this.raydium.prepareWallet(params.walletAddress);

    // Get pool info for token addresses
    const [poolInfo] = await this.raydium.getPoolfromAPI(params.poolAddress);

    // Sign transaction
    let signedTransaction: VersionedTransaction | Transaction;
    if (transaction instanceof VersionedTransaction) {
      signedTransaction = (await this.raydium.signTransaction(
        transaction,
        params.walletAddress,
        isHardwareWallet,
        wallet,
      )) as VersionedTransaction;
    } else {
      const txAsTransaction = transaction as Transaction;
      const { blockhash, lastValidBlockHeight } =
        await this.solana.connection.getLatestBlockhash();
      txAsTransaction.recentBlockhash = blockhash;
      txAsTransaction.lastValidBlockHeight = lastValidBlockHeight;
      txAsTransaction.feePayer = isHardwareWallet
        ? await this.solana.getPublicKey(params.walletAddress)
        : (wallet as any).publicKey;
      signedTransaction = (await this.raydium.signTransaction(
        txAsTransaction,
        params.walletAddress,
        isHardwareWallet,
        wallet,
      )) as Transaction;
    }

    // Simulate before sending
    await this.solana.simulateWithErrorHandling(signedTransaction, null);

    // Send and confirm
    const { confirmed, signature, txData } = await this.solana.sendAndConfirmRawTransaction(
      signedTransaction,
    );

    if (confirmed && txData) {
      const tokenAInfo = await this.solana.getToken(poolInfo.mintA.address);
      const tokenBInfo = await this.solana.getToken(poolInfo.mintB.address);

      const { balanceChanges } = await this.solana.extractBalanceChangesAndFee(
        signature,
        params.walletAddress,
        [tokenAInfo.address, tokenBInfo.address],
      );

      const baseTokenBalanceChange = balanceChanges[0];
      const quoteTokenBalanceChange = balanceChanges[1];

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

  /**
   * Create the remove liquidity transaction
   * (Private helper method - extracted from original implementation)
   */
  private async createTransaction(
    ammPoolInfo: any,
    poolInfo: any,
    poolKeys: any,
    lpAmount: BN,
    computeBudgetConfig: { units: number; microLamports: number },
  ): Promise<VersionedTransaction | Transaction> {
    if (ammPoolInfo.poolType === 'amm') {
      // Use zero minimum amounts for maximum flexibility
      const baseAmountMin = new BN(0);
      const quoteAmountMin = new BN(0);

      const response = await this.raydium.raydiumSDK.liquidity.removeLiquidity({
        poolInfo: poolInfo as ApiV3PoolInfoStandardItem,
        poolKeys: poolKeys as AmmV4Keys,
        lpAmount: lpAmount,
        baseAmountMin,
        quoteAmountMin,
        txVersion: this.raydium.txVersion,
        computeBudgetConfig,
      });
      return response.transaction;
    } else if (ammPoolInfo.poolType === 'cpmm') {
      // Use default slippage from config
      const slippage = new Percent(1 * 100, 10000); // 1% slippage

      const response = await this.raydium.raydiumSDK.cpmm.withdrawLiquidity({
        poolInfo: poolInfo as ApiV3PoolInfoStandardItemCpmm,
        poolKeys: poolKeys as CpmmKeys,
        lpAmount: lpAmount,
        txVersion: this.raydium.txVersion,
        slippage,
        computeBudgetConfig,
      });
      return response.transaction;
    }
    throw new Error(`Unsupported pool type: ${ammPoolInfo.poolType}`);
  }

  /**
   * Calculate the LP token amount to remove based on percentage
   * (Private helper method - extracted from original implementation)
   */
  private async calculateLpAmountToRemove(
    wallet: any,
    _ammPoolInfo: any,
    poolInfo: any,
    poolAddress: string,
    percentageToRemove: number,
    walletAddress: string,
    isHardwareWallet: boolean,
  ): Promise<BN> {
    let lpMint: string;

    // Get LP mint from poolInfo
    if (poolInfo.lpMint && poolInfo.lpMint.address) {
      lpMint = poolInfo.lpMint.address;
    } else {
      throw new Error(`Could not find LP mint for pool ${poolAddress}`);
    }

    // Get user's LP token account
    const walletPublicKey = isHardwareWallet
      ? await this.solana.getPublicKey(walletAddress)
      : (wallet as any).publicKey;
    const lpTokenAccounts = await this.solana.connection.getTokenAccountsByOwner(walletPublicKey, {
      mint: new PublicKey(lpMint),
    });

    if (lpTokenAccounts.value.length === 0) {
      throw new Error(`No LP token account found for pool ${poolAddress}`);
    }

    // Get LP token balance
    const lpTokenAccount = lpTokenAccounts.value[0].pubkey;
    const accountInfo = await this.solana.connection.getTokenAccountBalance(lpTokenAccount);
    const lpBalance = new BN(
      new Decimal(accountInfo.value.uiAmount)
        .mul(10 ** accountInfo.value.decimals)
        .toFixed(0),
    );

    if (lpBalance.isZero()) {
      throw new Error('LP token balance is zero - nothing to remove');
    }

    // Calculate LP amount to remove based on percentage
    return new BN(new Decimal(lpBalance.toString()).mul(percentageToRemove / 100).toFixed(0));
  }
}
