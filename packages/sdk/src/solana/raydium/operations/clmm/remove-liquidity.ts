/**
 * Raydium CLMM Remove Liquidity Operation
 *
 * Implements the OperationBuilder pattern for removing liquidity from concentrated liquidity positions.
 * Extracted from Gateway's route handlers to provide pure SDK functionality.
 */

import { TxVersion } from '@raydium-io/raydium-sdk-v2';
import { VersionedTransaction } from '@solana/web3.js';
import BN from 'bn.js';
import Decimal from 'decimal.js';

import {
  OperationBuilder,
  Transaction as SDKTransaction,
  ValidationResult,
  SimulationResult,
} from '../../../../../../core/src/types/protocol';
import { RemoveLiquidityParams, RemoveLiquidityResult } from '../../types/clmm';

/**
 * Remove Liquidity Operation
 *
 * Implements OperationBuilder for removing liquidity from CLMM positions.
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

    if (!params.walletAddress || params.walletAddress.length === 0) {
      errors.push('Wallet address is required');
    }

    if (!params.positionAddress || params.positionAddress.length === 0) {
      errors.push('Position address is required');
    }

    if (params.percentageToRemove <= 0 || params.percentageToRemove > 100) {
      errors.push('Percentage to remove must be between 0 and 100');
    }

    try {
      const position = await this.raydium.getClmmPosition(params.positionAddress);
      if (!position) {
        errors.push(`Position not found: ${params.positionAddress}`);
      } else if (position.liquidity.isZero()) {
        errors.push('Position has zero liquidity - nothing to remove');
      }
    } catch (error: any) {
      errors.push(`Failed to fetch position: ${error.message}`);
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Simulate transaction
   */
  async simulate(params: RemoveLiquidityParams): Promise<SimulationResult> {
    try {
      const priorityFeeInLamports = await this.solana.estimateGasPrice();
      const COMPUTE_UNITS = 600000;
      const estimatedFee = (priorityFeeInLamports * COMPUTE_UNITS) / 1e9;

      return {
        success: true,
        changes: {
          balanceChanges: [
            {
              token: 'BASE',
              amount: 'TBD',
              direction: 'in',
            },
            {
              token: 'QUOTE',
              amount: 'TBD',
              direction: 'in',
            },
          ],
        },
        estimatedFee: {
          amount: estimatedFee.toString(),
          token: 'SOL',
        },
        metadata: {
          percentageToRemove: params.percentageToRemove,
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
    const positionInfo = await this.raydium.getClmmPosition(params.positionAddress);
    const [poolInfo, poolKeys] = await this.raydium.getClmmPoolfromAPI(positionInfo.poolId.toBase58());

    const liquidityToRemove = new BN(
      new Decimal(positionInfo.liquidity.toString()).mul(params.percentageToRemove / 100).toFixed(0),
    );

    const COMPUTE_UNITS = 600000;
    const priorityFeeInLamports = await this.solana.estimateGasPrice();
    const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

    const { transaction } = await this.raydium.raydiumSDK.clmm.decreaseLiquidity({
      poolInfo,
      poolKeys,
      ownerPosition: positionInfo,
      ownerInfo: {
        useSOLBalance: true,
        closePosition: false,
      },
      liquidity: liquidityToRemove,
      amountMinA: new BN(0),
      amountMinB: new BN(0),
      txVersion: TxVersion.V0,
      computeBudgetConfig: {
        units: COMPUTE_UNITS,
        microLamports: priorityFeePerCU,
      },
    });

    const estimatedFee = (priorityFeeInLamports * COMPUTE_UNITS) / 1e9;

    return {
      raw: transaction,
      description: `Remove ${params.percentageToRemove}% liquidity from CLMM position`,
      estimatedFee: {
        amount: estimatedFee.toString(),
        token: 'SOL',
      },
    };
  }

  /**
   * Execute transaction
   */
  async execute(params: RemoveLiquidityParams): Promise<RemoveLiquidityResult> {
    const tx = await this.build(params);
    const { wallet, isHardwareWallet } = await this.raydium.prepareWallet(params.walletAddress);

    const transaction = (await this.raydium.signTransaction(
      tx.raw,
      params.walletAddress,
      isHardwareWallet,
      wallet,
    )) as VersionedTransaction;

    await this.solana.simulateWithErrorHandling(transaction, null);
    const { confirmed, signature, txData } = await this.solana.sendAndConfirmRawTransaction(transaction);

    if (confirmed && txData) {
      const positionInfo = await this.raydium.getClmmPosition(params.positionAddress);
      const [poolInfo] = await this.raydium.getClmmPoolfromAPI(positionInfo.poolId.toBase58());

      const tokenAInfo = await this.solana.getToken(poolInfo.mintA.address);
      const tokenBInfo = await this.solana.getToken(poolInfo.mintB.address);

      const { balanceChanges } = await this.solana.extractBalanceChangesAndFee(signature, params.walletAddress, [
        tokenAInfo.address,
        tokenBInfo.address,
      ]);

      return {
        signature,
        status: 1,
        data: {
          fee: txData.meta.fee / 1e9,
          baseTokenAmountRemoved: Math.abs(balanceChanges[0]),
          quoteTokenAmountRemoved: Math.abs(balanceChanges[1]),
        },
      };
    } else {
      return {
        signature,
        status: 0,
      };
    }
  }
}
