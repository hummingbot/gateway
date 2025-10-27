/**
 * Meteora Add Liquidity Operation
 *
 * Adds liquidity to an existing Meteora DLMM position.
 * Implements the OperationBuilder pattern for transaction operations.
 */

import { DecimalUtil } from '@orca-so/common-sdk';
import { PublicKey } from '@solana/web3.js';
import { BN } from 'bn.js';
import { Decimal } from 'decimal.js';

import {
  OperationBuilder,
  Transaction as SDKTransaction,
  ValidationResult,
  SimulationResult,
} from '../../../../../../core/src/types/protocol';
import { AddLiquidityParams, AddLiquidityResult } from '../../types';

const SOL_TRANSACTION_BUFFER = 0.01; // SOL buffer for transaction costs

/**
 * Add Liquidity Operation
 *
 * Increases liquidity in an existing position within the same bin range.
 */
export class AddLiquidityOperation implements OperationBuilder<AddLiquidityParams, AddLiquidityResult> {
  constructor(
    private meteora: any, // Meteora connector
    private solana: any,  // Solana chain
    private config: any,  // Meteora config for defaults
  ) {}

  /**
   * Validate parameters
   */
  async validate(params: AddLiquidityParams): Promise<ValidationResult> {
    const errors: string[] = [];

    // Required parameters
    if (!params.walletAddress) errors.push('Wallet address is required');
    if (!params.positionAddress) errors.push('Position address is required');
    if (!params.baseTokenAmount && !params.quoteTokenAmount) {
      errors.push('At least one of baseTokenAmount or quoteTokenAmount must be provided');
    }

    // Validate amounts
    if (params.baseTokenAmount !== undefined && params.baseTokenAmount <= 0) {
      errors.push('Base token amount must be greater than 0');
    }
    if (params.quoteTokenAmount !== undefined && params.quoteTokenAmount <= 0) {
      errors.push('Quote token amount must be greater than 0');
    }

    // Validate addresses
    try {
      if (params.positionAddress) new PublicKey(params.positionAddress);
    } catch {
      errors.push(`Invalid position address: ${params.positionAddress}`);
    }

    try {
      if (params.walletAddress) new PublicKey(params.walletAddress);
    } catch {
      errors.push(`Invalid wallet address: ${params.walletAddress}`);
    }

    // Check position exists
    if (params.positionAddress && params.walletAddress) {
      try {
        const wallet = await this.solana.getWallet(params.walletAddress);
        const positionResult = await this.meteora.getRawPosition(params.positionAddress, wallet.publicKey);
        if (!positionResult || !positionResult.position) {
          errors.push(`Position not found: ${params.positionAddress}`);
        }
      } catch (error: any) {
        errors.push(`Error fetching position: ${error.message}`);
      }
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
      const transaction = await this.build(params);

      // Simulate on-chain
      await this.solana.connection.simulateTransaction(transaction.raw);

      return {
        success: true,
        changes: {
          balanceChanges: [
            { token: 'base', amount: (params.baseTokenAmount || 0).toString(), direction: 'out' },
            { token: 'quote', amount: (params.quoteTokenAmount || 0).toString(), direction: 'out' },
          ],
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
   * Build transaction
   */
  async build(params: AddLiquidityParams): Promise<SDKTransaction> {
    const {
      walletAddress,
      positionAddress,
      baseTokenAmount,
      quoteTokenAmount,
      slippagePct,
    } = params;

    const wallet = await this.solana.getWallet(walletAddress);
    const positionResult = await this.meteora.getRawPosition(positionAddress, wallet.publicKey);

    if (!positionResult || !positionResult.position) {
      throw new Error(`Position not found: ${positionAddress}`);
    }

    const { position, info } = positionResult;
    const dlmmPool = await this.meteora.getDlmmPool(info.publicKey.toBase58());

    if (!dlmmPool) {
      throw new Error(`Pool not found for position: ${positionAddress}`);
    }

    const maxBinId = position.positionData.upperBinId;
    const minBinId = position.positionData.lowerBinId;

    const totalXAmount = new BN(
      DecimalUtil.toBN(new Decimal(baseTokenAmount || 0), dlmmPool.tokenX.decimal),
    );
    const totalYAmount = new BN(
      DecimalUtil.toBN(new Decimal(quoteTokenAmount || 0), dlmmPool.tokenY.decimal),
    );

    const addLiquidityTx = await dlmmPool.addLiquidityByStrategy({
      positionPubKey: new PublicKey(position.publicKey),
      user: wallet.publicKey,
      totalXAmount,
      totalYAmount,
      strategy: {
        maxBinId,
        minBinId,
        strategyType: this.config.strategyType,
      },
      slippage: slippagePct ?? this.config.slippagePct,
    });

    return {
      raw: addLiquidityTx,
      description: `Add liquidity to position ${positionAddress}`,
    };
  }

  /**
   * Execute transaction
   */
  async execute(params: AddLiquidityParams): Promise<AddLiquidityResult> {
    const {
      walletAddress,
      positionAddress,
      baseTokenAmount,
      quoteTokenAmount,
    } = params;

    const wallet = await this.solana.getWallet(walletAddress);
    const positionResult = await this.meteora.getRawPosition(positionAddress, wallet.publicKey);

    if (!positionResult || !positionResult.position) {
      throw new Error(`Position not found: ${positionAddress}`);
    }

    const { position, info } = positionResult;
    const dlmmPool = await this.meteora.getDlmmPool(info.publicKey.toBase58());

    if (!dlmmPool) {
      throw new Error(`Pool not found for position: ${positionAddress}`);
    }

    // Get token info
    const tokenX = await this.solana.getToken(dlmmPool.tokenX.publicKey.toBase58());
    const tokenY = await this.solana.getToken(dlmmPool.tokenY.publicKey.toBase58());

    if (!tokenX || !tokenY) {
      throw new Error('Token not found');
    }

    const tokenXSymbol = tokenX.symbol || 'UNKNOWN';
    const tokenYSymbol = tokenY.symbol || 'UNKNOWN';

    // Check balances with transaction buffer
    const balances = await this.solana.getBalance(wallet, [tokenXSymbol, tokenYSymbol, 'SOL']);
    const requiredBase = (baseTokenAmount || 0) + (tokenXSymbol === 'SOL' ? SOL_TRANSACTION_BUFFER : 0);
    const requiredQuote = (quoteTokenAmount || 0) + (tokenYSymbol === 'SOL' ? SOL_TRANSACTION_BUFFER : 0);

    if (balances[tokenXSymbol] < requiredBase) {
      throw new Error(
        `Insufficient ${tokenXSymbol} balance. Required: ${requiredBase}, Available: ${balances[tokenXSymbol]}`,
      );
    }

    if (balances[tokenYSymbol] < requiredQuote) {
      throw new Error(
        `Insufficient ${tokenYSymbol} balance. Required: ${requiredQuote}, Available: ${balances[tokenYSymbol]}`,
      );
    }

    // Build transaction
    const transaction = await this.build(params);
    transaction.raw.feePayer = wallet.publicKey;

    // Send and confirm
    const { signature, fee } = await this.solana.sendAndConfirmTransaction(
      transaction.raw,
      [wallet],
    );

    // Get transaction data for confirmation
    const txData = await this.solana.connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    const confirmed = txData !== null;

    if (confirmed && txData) {
      // Extract balance changes
      const { balanceChanges } = await this.solana.extractBalanceChangesAndFee(
        signature,
        dlmmPool.pubkey.toBase58(),
        [dlmmPool.tokenX.publicKey.toBase58(), dlmmPool.tokenY.publicKey.toBase58()],
      );

      const baseTokenAmountAdded = Math.abs(balanceChanges[0]);
      const quoteTokenAmountAdded = Math.abs(balanceChanges[1]);

      return {
        signature,
        status: 1, // CONFIRMED
        data: {
          fee,
          baseTokenAmountAdded,
          quoteTokenAmountAdded,
        },
      };
    }

    return {
      signature,
      status: 0, // PENDING
    };
  }
}
