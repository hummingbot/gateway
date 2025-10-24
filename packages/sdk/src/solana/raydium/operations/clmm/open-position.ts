/**
 * Raydium CLMM Open Position Operation
 *
 * Implements the OperationBuilder pattern for opening concentrated liquidity positions.
 * Handles price range selection, tick calculation, and liquidity provisioning.
 * Extracted from Gateway's route handlers to provide pure SDK functionality.
 */

import { TxVersion, TickUtils } from '@raydium-io/raydium-sdk-v2';
import { VersionedTransaction } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';

import {
  OperationBuilder,
  Transaction as SDKTransaction,
  ValidationResult,
  SimulationResult,
} from '../../../../../../core/src/types/protocol';
import { OpenPositionParams, OpenPositionResult } from '../../types/clmm';
import { quotePosition } from './quote-position';

/**
 * Open Position Operation
 *
 * Implements OperationBuilder for opening CLMM positions with price ranges.
 */
export class OpenPositionOperation
  implements OperationBuilder<OpenPositionParams, OpenPositionResult>
{
  constructor(
    private raydium: any, // Will be typed properly with RaydiumConnector
    private solana: any, // Solana chain instance
  ) {}

  /**
   * Validate parameters
   */
  async validate(params: OpenPositionParams): Promise<ValidationResult> {
    const errors: string[] = [];

    // Validate wallet address
    if (!params.walletAddress || params.walletAddress.length === 0) {
      errors.push('Wallet address is required');
    }

    // Validate pool address or token pair
    if (!params.poolAddress) {
      if (!params.baseTokenSymbol || !params.quoteTokenSymbol) {
        errors.push('Either poolAddress or both baseTokenSymbol and quoteTokenSymbol must be provided');
      }
    }

    // Validate price range
    if (params.lowerPrice >= params.upperPrice) {
      errors.push('Lower price must be less than upper price');
    }

    if (params.lowerPrice <= 0 || params.upperPrice <= 0) {
      errors.push('Prices must be positive');
    }

    // Validate amounts (need at least one)
    if (!params.baseTokenAmount && !params.quoteTokenAmount) {
      errors.push('At least one of baseTokenAmount or quoteTokenAmount must be provided');
    }

    if (params.baseTokenAmount !== undefined && params.baseTokenAmount <= 0) {
      errors.push('Base token amount must be positive');
    }

    if (params.quoteTokenAmount !== undefined && params.quoteTokenAmount <= 0) {
      errors.push('Quote token amount must be positive');
    }

    // Validate slippage
    if (params.slippagePct !== undefined) {
      if (params.slippagePct < 0 || params.slippagePct > 100) {
        errors.push('Slippage must be between 0 and 100');
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Simulate transaction
   *
   * Returns expected liquidity amounts and position info
   */
  async simulate(params: OpenPositionParams): Promise<SimulationResult> {
    try {
      // Get pool address
      const poolAddress = await this.resolvePoolAddress(params);

      // Get quote for position
      const quote = await quotePosition(this.raydium, this.solana, {
        network: params.network,
        poolAddress,
        lowerPrice: params.lowerPrice,
        upperPrice: params.upperPrice,
        baseTokenAmount: params.baseTokenAmount,
        quoteTokenAmount: params.quoteTokenAmount,
        slippagePct: params.slippagePct,
      });

      // Get priority fee estimate
      const priorityFeeInLamports = await this.solana.estimateGasPrice();
      const COMPUTE_UNITS = 500000;
      const estimatedFee = (priorityFeeInLamports * COMPUTE_UNITS) / 1e9;

      // Estimate position rent (approx 0.02 SOL for NFT + accounts)
      const positionRent = 0.02;

      return {
        success: true,
        changes: {
          balanceChanges: [
            {
              token: 'BASE',
              amount: quote.baseTokenAmount.toString(),
              direction: 'out',
            },
            {
              token: 'QUOTE',
              amount: quote.quoteTokenAmount.toString(),
              direction: 'out',
            },
            {
              token: 'SOL',
              amount: positionRent.toString(),
              direction: 'out',
              note: 'Position rent (refundable on close)',
            },
          ],
        },
        estimatedFee: {
          amount: estimatedFee.toString(),
          token: 'SOL',
        },
        metadata: {
          priceRange: {
            lower: params.lowerPrice,
            upper: params.upperPrice,
          },
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
  async build(params: OpenPositionParams): Promise<SDKTransaction> {
    // Get pool address
    const poolAddress = await this.resolvePoolAddress(params);

    // Get pool info
    const poolResponse = await this.raydium.getClmmPoolfromAPI(poolAddress);
    if (!poolResponse) {
      throw new Error(`Pool not found for address: ${poolAddress}`);
    }
    const [poolInfo, poolKeys] = poolResponse;
    const rpcData = await this.raydium.getClmmPoolfromRPC(poolAddress);
    poolInfo.price = rpcData.currentPrice;

    // Get token info
    const baseTokenInfo = await this.solana.getToken(poolInfo.mintA.address);
    const quoteTokenInfo = await this.solana.getToken(poolInfo.mintB.address);

    // Calculate ticks from prices
    const { tick: lowerTick } = TickUtils.getPriceAndTick({
      poolInfo,
      price: new Decimal(params.lowerPrice),
      baseIn: true,
    });
    const { tick: upperTick } = TickUtils.getPriceAndTick({
      poolInfo,
      price: new Decimal(params.upperPrice),
      baseIn: true,
    });

    // Get quote for position
    const quotePositionResponse = await quotePosition(this.raydium, this.solana, {
      network: params.network,
      poolAddress,
      lowerPrice: params.lowerPrice,
      upperPrice: params.upperPrice,
      baseTokenAmount: params.baseTokenAmount,
      quoteTokenAmount: params.quoteTokenAmount,
      slippagePct: params.slippagePct,
    });

    // Get priority fee
    const COMPUTE_UNITS = 500000;
    const priorityFeeInLamports = await this.solana.estimateGasPrice();
    const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

    // Build transaction
    const { transaction: txn } = await this.raydium.raydiumSDK.clmm.openPositionFromBase({
      poolInfo,
      poolKeys,
      tickUpper: Math.max(lowerTick, upperTick),
      tickLower: Math.min(lowerTick, upperTick),
      base: quotePositionResponse.baseLimited ? 'MintA' : 'MintB',
      ownerInfo: { useSOLBalance: true },
      baseAmount: quotePositionResponse.baseLimited
        ? new BN(quotePositionResponse.baseTokenAmount * 10 ** baseTokenInfo.decimals)
        : new BN(quotePositionResponse.quoteTokenAmount * 10 ** quoteTokenInfo.decimals),
      otherAmountMax: quotePositionResponse.baseLimited
        ? new BN(quotePositionResponse.quoteTokenAmountMax * 10 ** quoteTokenInfo.decimals)
        : new BN(quotePositionResponse.baseTokenAmountMax * 10 ** baseTokenInfo.decimals),
      txVersion: TxVersion.V0,
      computeBudgetConfig: {
        units: COMPUTE_UNITS,
        microLamports: priorityFeePerCU,
      },
    });

    // Calculate estimated fee
    const estimatedFee = (priorityFeeInLamports * COMPUTE_UNITS) / 1e9;

    return {
      raw: txn,
      description: `Open CLMM position: ${params.lowerPrice}-${params.upperPrice} price range`,
      estimatedFee: {
        amount: estimatedFee.toString(),
        token: 'SOL',
      },
    };
  }

  /**
   * Execute transaction (signs and submits)
   */
  async execute(params: OpenPositionParams): Promise<OpenPositionResult> {
    // Build transaction
    const tx = await this.build(params);

    // Get extInfo for position address (need to rebuild to get extInfo)
    const poolAddress = await this.resolvePoolAddress(params);
    const poolResponse = await this.raydium.getClmmPoolfromAPI(poolAddress);
    const [poolInfo, poolKeys] = poolResponse;
    const rpcData = await this.raydium.getClmmPoolfromRPC(poolAddress);
    poolInfo.price = rpcData.currentPrice;

    const baseTokenInfo = await this.solana.getToken(poolInfo.mintA.address);
    const quoteTokenInfo = await this.solana.getToken(poolInfo.mintB.address);

    const { tick: lowerTick } = TickUtils.getPriceAndTick({
      poolInfo,
      price: new Decimal(params.lowerPrice),
      baseIn: true,
    });
    const { tick: upperTick } = TickUtils.getPriceAndTick({
      poolInfo,
      price: new Decimal(params.upperPrice),
      baseIn: true,
    });

    const quotePositionResponse = await quotePosition(this.raydium, this.solana, {
      network: params.network,
      poolAddress,
      lowerPrice: params.lowerPrice,
      upperPrice: params.upperPrice,
      baseTokenAmount: params.baseTokenAmount,
      quoteTokenAmount: params.quoteTokenAmount,
      slippagePct: params.slippagePct,
    });

    const COMPUTE_UNITS = 500000;
    const priorityFeeInLamports = await this.solana.estimateGasPrice();
    const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

    const { transaction: txn, extInfo } = await this.raydium.raydiumSDK.clmm.openPositionFromBase({
      poolInfo,
      poolKeys,
      tickUpper: Math.max(lowerTick, upperTick),
      tickLower: Math.min(lowerTick, upperTick),
      base: quotePositionResponse.baseLimited ? 'MintA' : 'MintB',
      ownerInfo: { useSOLBalance: true },
      baseAmount: quotePositionResponse.baseLimited
        ? new BN(quotePositionResponse.baseTokenAmount * 10 ** baseTokenInfo.decimals)
        : new BN(quotePositionResponse.quoteTokenAmount * 10 ** quoteTokenInfo.decimals),
      otherAmountMax: quotePositionResponse.baseLimited
        ? new BN(quotePositionResponse.quoteTokenAmountMax * 10 ** quoteTokenInfo.decimals)
        : new BN(quotePositionResponse.baseTokenAmountMax * 10 ** baseTokenInfo.decimals),
      txVersion: TxVersion.V0,
      computeBudgetConfig: {
        units: COMPUTE_UNITS,
        microLamports: priorityFeePerCU,
      },
    });

    // Prepare wallet
    const { wallet, isHardwareWallet } = await this.raydium.prepareWallet(params.walletAddress);

    // Sign transaction
    const transaction = (await this.raydium.signTransaction(
      txn,
      params.walletAddress,
      isHardwareWallet,
      wallet,
    )) as VersionedTransaction;

    // Simulate before sending
    await this.solana.simulateWithErrorHandling(transaction, null);

    // Send and confirm
    const { confirmed, signature, txData } = await this.solana.sendAndConfirmRawTransaction(
      transaction,
    );

    if (confirmed && txData) {
      const totalFee = txData.meta.fee;

      // Extract balance changes
      const { baseTokenChange, quoteTokenChange, rent } =
        await this.solana.extractClmmBalanceChanges(
          signature,
          params.walletAddress,
          baseTokenInfo,
          quoteTokenInfo,
          totalFee,
        );

      return {
        signature,
        status: 1, // CONFIRMED
        data: {
          fee: totalFee / 1e9,
          positionAddress: extInfo.nftMint.toBase58(),
          positionRent: rent,
          baseTokenAmountAdded: baseTokenChange,
          quoteTokenAmountAdded: quoteTokenChange,
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
   * Resolve pool address from params (use provided or lookup by token pair)
   */
  private async resolvePoolAddress(params: OpenPositionParams): Promise<string> {
    if (params.poolAddress) {
      return params.poolAddress;
    }

    if (!params.baseTokenSymbol || !params.quoteTokenSymbol) {
      throw new Error('Either poolAddress or both baseTokenSymbol and quoteTokenSymbol must be provided');
    }

    const poolAddress = await this.raydium.findDefaultPool(
      params.baseTokenSymbol,
      params.quoteTokenSymbol,
      'clmm',
    );

    if (!poolAddress) {
      throw new Error(
        `No CLMM pool found for pair ${params.baseTokenSymbol}-${params.quoteTokenSymbol}`,
      );
    }

    return poolAddress;
  }
}
