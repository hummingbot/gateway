/**
 * Meteora Open Position Operation
 *
 * Opens a new position in a Meteora DLMM pool.
 * Implements the OperationBuilder pattern for transaction operations.
 */

import { DecimalUtil } from '@orca-so/common-sdk';
import { Keypair, PublicKey } from '@solana/web3.js';
import { BN } from 'bn.js';
import { Decimal } from 'decimal.js';

import {
  OperationBuilder,
  Transaction as SDKTransaction,
  ValidationResult,
  SimulationResult,
} from '../../../../../../core/src/types/protocol';
import { OpenPositionParams, OpenPositionResult } from '../../types';

const SOL_POSITION_RENT = 0.05; // SOL amount required for position rent
const SOL_TRANSACTION_BUFFER = 0.01; // Additional SOL buffer for transaction costs

/**
 * Open Position Operation
 *
 * Creates a new liquidity position in a Meteora DLMM pool with specified price range.
 */
export class OpenPositionOperation implements OperationBuilder<OpenPositionParams, OpenPositionResult> {
  constructor(
    private meteora: any, // Meteora connector
    private solana: any,  // Solana chain
    private config: any,  // Meteora config for default strategy type
  ) {}

  /**
   * Validate parameters
   */
  async validate(params: OpenPositionParams): Promise<ValidationResult> {
    const errors: string[] = [];

    // Required parameters
    if (!params.walletAddress) errors.push('Wallet address is required');
    if (!params.poolAddress) errors.push('Pool address is required');
    if (params.lowerPrice === undefined) errors.push('Lower price is required');
    if (params.upperPrice === undefined) errors.push('Upper price is required');

    // Validate price range
    if (params.lowerPrice !== undefined && params.upperPrice !== undefined && params.lowerPrice >= params.upperPrice) {
      errors.push('Lower price must be less than upper price');
    }

    // At least one amount must be provided
    if (!params.baseTokenAmount && !params.quoteTokenAmount) {
      errors.push('At least one of baseTokenAmount or quoteTokenAmount must be provided');
    }

    // Validate addresses
    try {
      if (params.poolAddress) new PublicKey(params.poolAddress);
    } catch {
      errors.push(`Invalid pool address: ${params.poolAddress}`);
    }

    try {
      if (params.walletAddress) new PublicKey(params.walletAddress);
    } catch {
      errors.push(`Invalid wallet address: ${params.walletAddress}`);
    }

    // Check pool exists
    if (params.poolAddress) {
      try {
        const dlmmPool = await this.meteora.getDlmmPool(params.poolAddress);
        if (!dlmmPool) {
          errors.push(`Pool not found: ${params.poolAddress}`);
        }
      } catch (error: any) {
        if (error.message && error.message.includes('Invalid account discriminator')) {
          errors.push(`Pool not found: ${params.poolAddress}`);
        } else {
          errors.push(`Error fetching pool: ${error.message}`);
        }
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
  async simulate(params: OpenPositionParams): Promise<SimulationResult> {
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
  async build(params: OpenPositionParams): Promise<SDKTransaction> {
    const {
      walletAddress,
      poolAddress,
      lowerPrice,
      upperPrice,
      baseTokenAmount,
      quoteTokenAmount,
      slippagePct,
      strategyType,
    } = params;

    const wallet = await this.solana.getWallet(walletAddress);
    const dlmmPool = await this.meteora.getDlmmPool(poolAddress);

    if (!dlmmPool) {
      throw new Error(`Pool not found: ${poolAddress}`);
    }

    // Create new position keypair
    const newPosition = new Keypair();

    // Convert prices to bin IDs
    const lowerPricePerLamport = dlmmPool.toPricePerLamport(lowerPrice);
    const upperPricePerLamport = dlmmPool.toPricePerLamport(upperPrice);
    const minBinId = dlmmPool.getBinIdFromPrice(Number(lowerPricePerLamport), true);
    const maxBinId = dlmmPool.getBinIdFromPrice(Number(upperPricePerLamport), false);

    // Convert amounts to BN
    const totalXAmount = new BN(
      DecimalUtil.toBN(new Decimal(baseTokenAmount || 0), dlmmPool.tokenX.decimal),
    );
    const totalYAmount = new BN(
      DecimalUtil.toBN(new Decimal(quoteTokenAmount || 0), dlmmPool.tokenY.decimal),
    );

    // Convert slippage to basis points
    const slippageBps = slippagePct ? slippagePct * 100 : undefined;

    // Create position transaction
    const createPositionTx = await dlmmPool.initializePositionAndAddLiquidityByStrategy({
      positionPubKey: newPosition.publicKey,
      user: wallet.publicKey,
      totalXAmount,
      totalYAmount,
      strategy: {
        maxBinId,
        minBinId,
        strategyType: strategyType ?? this.config.strategyType,
      },
      ...(slippageBps ? { slippage: slippageBps } : {}),
    });

    // Store position keypair for later use in execute
    (createPositionTx as any).__positionKeypair = newPosition;

    return {
      raw: createPositionTx,
      description: `Open position in Meteora pool ${poolAddress} with price range ${lowerPrice} - ${upperPrice}`,
    };
  }

  /**
   * Execute transaction
   */
  async execute(params: OpenPositionParams): Promise<OpenPositionResult> {
    const { walletAddress, poolAddress, lowerPrice, upperPrice, baseTokenAmount, quoteTokenAmount, slippagePct } = params;

    const wallet = await this.solana.getWallet(walletAddress);
    const dlmmPool = await this.meteora.getDlmmPool(poolAddress);

    if (!dlmmPool) {
      throw new Error(`Pool not found: ${poolAddress}`);
    }

    // Get token info
    const tokenX = await this.solana.getToken(dlmmPool.tokenX.publicKey.toBase58());
    const tokenY = await this.solana.getToken(dlmmPool.tokenY.publicKey.toBase58());

    if (!tokenX || !tokenY) {
      throw new Error('Token not found');
    }

    const tokenXSymbol = tokenX.symbol || 'UNKNOWN';
    const tokenYSymbol = tokenY.symbol || 'UNKNOWN';

    // Validate amounts provided
    if (!baseTokenAmount && !quoteTokenAmount) {
      throw new Error('At least one of baseTokenAmount or quoteTokenAmount must be provided');
    }

    // Check balances with SOL buffer
    const balances = await this.solana.getBalance(wallet, [tokenXSymbol, tokenYSymbol, 'SOL']);
    const requiredBaseAmount =
      (baseTokenAmount || 0) + (tokenXSymbol === 'SOL' ? SOL_POSITION_RENT + SOL_TRANSACTION_BUFFER : 0);
    const requiredQuoteAmount =
      (quoteTokenAmount || 0) + (tokenYSymbol === 'SOL' ? SOL_POSITION_RENT + SOL_TRANSACTION_BUFFER : 0);

    if (balances[tokenXSymbol] < requiredBaseAmount) {
      throw new Error(
        `Insufficient ${tokenXSymbol} balance. Required: ${requiredBaseAmount}, Available: ${balances[tokenXSymbol]}`,
      );
    }

    if (balances[tokenYSymbol] < requiredQuoteAmount) {
      throw new Error(
        `Insufficient ${tokenYSymbol} balance. Required: ${requiredQuoteAmount}, Available: ${balances[tokenYSymbol]}`,
      );
    }

    // Get current pool price from active bin
    const activeBin = await dlmmPool.getActiveBin();
    const currentPrice = Number(activeBin.pricePerToken);

    // Validate price position requirements
    if (currentPrice < lowerPrice) {
      if (!baseTokenAmount || baseTokenAmount <= 0 || (quoteTokenAmount !== undefined && quoteTokenAmount !== 0)) {
        throw new Error(
          `Current price ${currentPrice.toFixed(4)} is below lower price ${lowerPrice.toFixed(4)}. ` +
            `Requires positive ${tokenXSymbol} amount and zero ${tokenYSymbol} amount.`,
        );
      }
    } else if (currentPrice > upperPrice) {
      if (!quoteTokenAmount || quoteTokenAmount <= 0 || (baseTokenAmount !== undefined && baseTokenAmount !== 0)) {
        throw new Error(
          `Current price ${currentPrice.toFixed(4)} is above upper price ${upperPrice.toFixed(4)}. ` +
            `Requires positive ${tokenYSymbol} amount and zero ${tokenXSymbol} amount.`,
        );
      }
    }

    // Build transaction
    const transaction = await this.build(params);
    const positionKeypair = (transaction.raw as any).__positionKeypair as Keypair;

    if (!positionKeypair) {
      throw new Error('Position keypair not found in transaction');
    }

    // Set fee payer for simulation
    transaction.raw.feePayer = wallet.publicKey;

    // Send and confirm
    const { signature, fee } = await this.solana.sendAndConfirmTransaction(
      transaction.raw,
      [wallet, positionKeypair],
    );

    // Get transaction data
    const txData = await this.solana.connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    const confirmed = txData !== null;

    if (confirmed && txData) {
      // Extract balance changes
      const { balanceChanges } = await this.solana.extractBalanceChangesAndFee(
        signature,
        wallet.publicKey.toBase58(),
        [tokenX.address, tokenY.address],
      );

      const baseTokenBalanceChange = balanceChanges[0];
      const quoteTokenBalanceChange = balanceChanges[1];

      // Calculate sentSOL based on which token is SOL
      const sentSOL =
        tokenXSymbol === 'SOL'
          ? Math.abs(baseTokenBalanceChange - fee)
          : tokenYSymbol === 'SOL'
            ? Math.abs(quoteTokenBalanceChange - fee)
            : fee;

      return {
        signature,
        status: 1, // CONFIRMED
        data: {
          fee,
          positionAddress: positionKeypair.publicKey.toBase58(),
          positionRent: sentSOL,
          baseTokenAmountAdded: baseTokenBalanceChange,
          quoteTokenAmountAdded: quoteTokenBalanceChange,
        },
      };
    }

    return {
      signature,
      status: 0, // PENDING
    };
  }
}
