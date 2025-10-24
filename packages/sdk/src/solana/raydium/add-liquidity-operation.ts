/**
 * Raydium Add Liquidity Operation
 *
 * Implements the OperationBuilder pattern for adding liquidity to Raydium AMM/CPMM pools.
 * Extracted from Gateway's route handlers to provide pure SDK functionality.
 */

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

import {
  OperationBuilder,
  Transaction as SDKTransaction,
  ValidationResult,
  SimulationResult,
} from '../../../../core/src/types/protocol';

/**
 * Add Liquidity Parameters
 */
export interface AddLiquidityParams {
  /** Pool address */
  poolAddress: string;

  /** Wallet address */
  walletAddress: string;

  /** Base token amount to add */
  baseTokenAmount: number;

  /** Quote token amount to add */
  quoteTokenAmount: number;

  /** Slippage percentage (e.g., 1 for 1%) */
  slippagePct?: number;
}

/**
 * Add Liquidity Result
 */
export interface AddLiquidityResult {
  /** Transaction signature */
  signature: string;

  /** Transaction status: 1 = confirmed, 0 = pending */
  status: number;

  /** Transaction data (if confirmed) */
  data?: {
    fee: number;
    baseTokenAmountAdded: number;
    quoteTokenAmountAdded: number;
  };
}

/**
 * Add Liquidity Operation
 *
 * Implements OperationBuilder for adding liquidity to Raydium pools.
 */
export class AddLiquidityOperation implements OperationBuilder<AddLiquidityParams, AddLiquidityResult> {
  constructor(
    private raydium: any, // Will be typed properly with RaydiumConnector
    private solana: any,  // Solana chain instance
  ) {}

  /**
   * Validate parameters
   */
  async validate(params: AddLiquidityParams): Promise<ValidationResult> {
    const errors: string[] = [];

    // Validate pool address
    if (!params.poolAddress || params.poolAddress.length === 0) {
      errors.push('Pool address is required');
    }

    // Validate wallet address
    if (!params.walletAddress || params.walletAddress.length === 0) {
      errors.push('Wallet address is required');
    }

    // Validate token amounts
    if (params.baseTokenAmount <= 0) {
      errors.push('Base token amount must be positive');
    }

    if (params.quoteTokenAmount <= 0) {
      errors.push('Quote token amount must be positive');
    }

    // Validate slippage
    if (params.slippagePct !== undefined) {
      if (params.slippagePct < 0 || params.slippagePct > 100) {
        errors.push('Slippage must be between 0 and 100');
      }
    }

    // Check if pool exists
    try {
      const ammPoolInfo = await this.raydium.getAmmPoolInfo(params.poolAddress);
      if (!ammPoolInfo) {
        errors.push(`Pool not found for address: ${params.poolAddress}`);
      }
    } catch (error) {
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
   * Returns expected LP tokens and balance changes
   */
  async simulate(params: AddLiquidityParams): Promise<SimulationResult> {
    try {
      // Get quote for liquidity addition
      const quoteResponse = await this.getQuote(params);

      const {
        baseLimited,
        baseTokenAmount: quotedBaseAmount,
        quoteTokenAmount: quotedQuoteAmount,
      } = quoteResponse;

      const baseTokenAmountAdded = baseLimited ? params.baseTokenAmount : quotedBaseAmount;
      const quoteTokenAmountAdded = baseLimited ? quotedQuoteAmount : params.quoteTokenAmount;

      // Get priority fee estimate
      const priorityFeeInLamports = await this.solana.estimateGasPrice();
      const COMPUTE_UNITS = 400000;
      const estimatedFee = (priorityFeeInLamports * COMPUTE_UNITS) / 1e9;

      return {
        success: true,
        changes: {
          balanceChanges: [
            {
              token: 'BASE',
              amount: baseTokenAmountAdded.toString(),
              direction: 'out',
            },
            {
              token: 'QUOTE',
              amount: quoteTokenAmountAdded.toString(),
              direction: 'out',
            },
            {
              token: 'LP_TOKEN',
              amount: 'TBD', // Calculated on-chain
              direction: 'in',
            },
          ],
        },
        estimatedFee: {
          amount: estimatedFee.toString(),
          token: 'SOL',
        },
      };
    } catch (error) {
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
    // Get pool info
    const ammPoolInfo = await this.raydium.getAmmPoolInfo(params.poolAddress);
    if (!ammPoolInfo) {
      throw new Error(`Pool not found for address: ${params.poolAddress}`);
    }

    // Get pool info and keys from API
    const poolResponse = await this.raydium.getPoolfromAPI(params.poolAddress);
    if (!poolResponse) {
      throw new Error(`Pool not found for address: ${params.poolAddress}`);
    }
    const [poolInfo, poolKeys] = poolResponse;

    // Get quote
    const quoteResponse = await this.getQuote(params);
    const {
      baseLimited,
      baseTokenAmount: quotedBaseAmount,
      quoteTokenAmount: quotedQuoteAmount,
    } = quoteResponse;

    const baseTokenAmountAdded = baseLimited ? params.baseTokenAmount : quotedBaseAmount;
    const quoteTokenAmountAdded = baseLimited ? quotedQuoteAmount : params.quoteTokenAmount;

    // Calculate slippage
    const slippageValue = params.slippagePct === 0 ? 0 : params.slippagePct || 1;
    const slippage = new Percent(Math.floor(slippageValue * 100), 10000);

    // Get priority fee
    const COMPUTE_UNITS = 400000;
    const priorityFeeInLamports = await this.solana.estimateGasPrice();
    const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

    // Create transaction
    const transaction = await this.createTransaction(
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
      params.baseTokenAmount,
      params.quoteTokenAmount,
    );

    // Calculate estimated fee
    const estimatedFee = (priorityFeeInLamports * COMPUTE_UNITS) / 1e9;

    return {
      raw: transaction,
      description: `Add liquidity: ${baseTokenAmountAdded} base + ${quoteTokenAmountAdded} quote`,
      estimatedFee: {
        amount: estimatedFee.toString(),
        token: 'SOL',
      },
    };
  }

  /**
   * Execute transaction (signs and submits)
   */
  async execute(params: AddLiquidityParams): Promise<AddLiquidityResult> {
    // Build transaction
    const tx = await this.build(params);
    const transaction = tx.raw as VersionedTransaction | Transaction;

    // Prepare wallet
    const { wallet, isHardwareWallet } = await this.raydium.prepareWallet(params.walletAddress);

    // Get pool info for token addresses
    const poolResponse = await this.raydium.getPoolfromAPI(params.poolAddress);
    const [poolInfo] = poolResponse;

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
      const { blockhash, lastValidBlockHeight } = await this.solana.connection.getLatestBlockhash();
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
      signedTransaction
    );

    if (confirmed && txData) {
      const tokenAInfo = await this.solana.getToken(poolInfo.mintA.address);
      const tokenBInfo = await this.solana.getToken(poolInfo.mintB.address);

      const { balanceChanges } = await this.solana.extractBalanceChangesAndFee(
        signature,
        params.walletAddress,
        [tokenAInfo.address, tokenBInfo.address]
      );

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

  /**
   * Create the add liquidity transaction
   * (Private helper method - extracted from original implementation)
   */
  private async createTransaction(
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
      const slippageDecimal = slippage.numerator.toNumber() / slippage.denominator.toNumber();
      const slippageMultiplier = new Decimal(1).minus(slippageDecimal);

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

      const response = await this.raydium.raydiumSDK.liquidity.addLiquidity({
        poolInfo: poolInfo as ApiV3PoolInfoStandardItem,
        poolKeys: poolKeys as AmmV4Keys,
        amountInA,
        amountInB,
        otherAmountMin,
        fixedSide: baseLimited ? 'a' : 'b',
        txVersion: this.raydium.txVersion,
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
      const response = await this.raydium.raydiumSDK.cpmm.addLiquidity({
        poolInfo: poolInfo as ApiV3PoolInfoStandardItemCpmm,
        poolKeys: poolKeys as CpmmKeys,
        inputAmount,
        slippage,
        baseIn,
        txVersion: this.raydium.txVersion,
        computeBudgetConfig,
      });
      return response.transaction;
    }
    throw new Error(`Unsupported pool type: ${ammPoolInfo.poolType}`);
  }

  /**
   * Get liquidity quote
   * (Private helper method - calls quoteLiquidity operation)
   *
   * NOTE: Temporarily imports from existing Gateway code.
   * Will be extracted as proper SDK operation in PR #2.
   */
  private async getQuote(params: AddLiquidityParams): Promise<any> {
    // Import quoteLiquidity from existing Gateway implementation
    // This is temporary - will be extracted as QuoteLiquidityOperation in PR #2
    const { quoteLiquidity } = await import(
      '../../../../../src/connectors/raydium/amm-routes/quoteLiquidity'
    );

    return await quoteLiquidity(
      null, // fastify instance (not needed for business logic)
      this.solana.network,
      params.poolAddress,
      params.baseTokenAmount,
      params.quoteTokenAmount,
      params.slippagePct,
    );
  }
}
