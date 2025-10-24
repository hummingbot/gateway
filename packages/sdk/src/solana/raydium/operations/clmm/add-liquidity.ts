/**
 * Raydium CLMM Add Liquidity Operation
 *
 * Implements the OperationBuilder pattern for adding liquidity to existing concentrated liquidity positions.
 * Extracted from Gateway's route handlers to provide pure SDK functionality.
 */

import { TxVersion } from '@raydium-io/raydium-sdk-v2';
import { VersionedTransaction } from '@solana/web3.js';
import BN from 'bn.js';

import {
  OperationBuilder,
  Transaction as SDKTransaction,
  ValidationResult,
  SimulationResult,
} from '../../../../../core/src/types/protocol';
import { AddLiquidityParams, AddLiquidityResult } from '../../types/clmm';

/**
 * Add Liquidity Operation
 *
 * Implements OperationBuilder for adding liquidity to existing CLMM positions.
 */
export class AddLiquidityOperation
  implements OperationBuilder<AddLiquidityParams, AddLiquidityResult>
{
  constructor(
    private raydium: any, // Will be typed properly with RaydiumConnector
    private solana: any, // Solana chain instance
  ) {}

  /**
   * Validate parameters
   */
  async validate(params: AddLiquidityParams): Promise<ValidationResult> {
    const errors: string[] = [];

    if (!params.walletAddress || params.walletAddress.length === 0) {
      errors.push('Wallet address is required');
    }

    if (!params.positionAddress || params.positionAddress.length === 0) {
      errors.push('Position address is required');
    }

    if (!params.baseTokenAmount && !params.quoteTokenAmount) {
      errors.push('At least one of baseTokenAmount or quoteTokenAmount must be provided');
    }

    if (params.baseTokenAmount !== undefined && params.baseTokenAmount <= 0) {
      errors.push('Base token amount must be positive');
    }

    if (params.quoteTokenAmount !== undefined && params.quoteTokenAmount <= 0) {
      errors.push('Quote token amount must be positive');
    }

    try {
      const position = await this.raydium.getClmmPosition(params.positionAddress);
      if (!position) {
        errors.push(`Position not found: ${params.positionAddress}`);
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
  async simulate(params: AddLiquidityParams): Promise<SimulationResult> {
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
              amount: (params.baseTokenAmount || 0).toString(),
              direction: 'out',
            },
            {
              token: 'QUOTE',
              amount: (params.quoteTokenAmount || 0).toString(),
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
  async build(params: AddLiquidityParams): Promise<SDKTransaction> {
    const positionInfo = await this.raydium.getPositionInfo(params.positionAddress);
    const position = await this.raydium.getClmmPosition(params.positionAddress);
    const [poolInfo, poolKeys] = await this.raydium.getClmmPoolfromAPI(positionInfo.poolAddress);

    const baseToken = await this.solana.getToken(poolInfo.mintA.address);
    const quoteToken = await this.solana.getToken(poolInfo.mintB.address);

    // Get quote
    const { quotePosition } = await import(
      '../../../../../../src/connectors/raydium/clmm-routes/quotePosition'
    );
    const quotePositionResponse = await quotePosition(
      null,
      params.network,
      positionInfo.lowerPrice,
      positionInfo.upperPrice,
      positionInfo.poolAddress,
      params.baseTokenAmount,
      params.quoteTokenAmount,
      params.slippagePct,
    );

    const COMPUTE_UNITS = 600000;
    const priorityFeeInLamports = await this.solana.estimateGasPrice();
    const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

    const { transaction } = await this.raydium.raydiumSDK.clmm.increasePositionFromBase({
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

    const estimatedFee = (priorityFeeInLamports * COMPUTE_UNITS) / 1e9;

    return {
      raw: transaction,
      description: `Add liquidity to CLMM position ${params.positionAddress}`,
      estimatedFee: {
        amount: estimatedFee.toString(),
        token: 'SOL',
      },
    };
  }

  /**
   * Execute transaction
   */
  async execute(params: AddLiquidityParams): Promise<AddLiquidityResult> {
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
      const positionInfo = await this.raydium.getPositionInfo(params.positionAddress);
      const [poolInfo] = await this.raydium.getClmmPoolfromAPI(positionInfo.poolAddress);

      const baseToken = await this.solana.getToken(poolInfo.mintA.address);
      const quoteToken = await this.solana.getToken(poolInfo.mintB.address);

      const tokenAddresses = ['So11111111111111111111111111111111111111112'];
      if (baseToken.address !== 'So11111111111111111111111111111111111111112') {
        tokenAddresses.push(baseToken.address);
      }
      if (quoteToken.address !== 'So11111111111111111111111111111111111111112') {
        tokenAddresses.push(quoteToken.address);
      }

      const { balanceChanges } = await this.solana.extractBalanceChangesAndFee(signature, params.walletAddress, tokenAddresses);

      const isBaseSol = baseToken.address === 'So11111111111111111111111111111111111111112';
      const isQuoteSol = quoteToken.address === 'So11111111111111111111111111111111111111112';

      const baseChangeIndex = isBaseSol ? 0 : 1;
      const quoteChangeIndex = isQuoteSol ? 0 : isBaseSol ? 1 : 2;

      return {
        signature,
        status: 1,
        data: {
          fee: txData.meta.fee / 1e9,
          baseTokenAmountAdded: balanceChanges[baseChangeIndex],
          quoteTokenAmountAdded: balanceChanges[quoteChangeIndex],
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
