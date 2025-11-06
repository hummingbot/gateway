import { Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import BN from 'bn.js';

import { Solana } from '../../chains/solana/solana';
import { SolanaLedger } from '../../chains/solana/solana-ledger';
import { PoolInfo as ClmmPoolInfo, PositionInfo } from '../../schemas/clmm-schema';
import { logger } from '../../services/logger';

import { PancakeswapSolConfig } from './pancakeswap-sol.config';
import { getAmountsFromLiquidity } from './pancakeswap-sol.math';
import { tickToPrice } from './pancakeswap-sol.parser';

// PancakeSwap CLMM Program ID
export const PANCAKESWAP_CLMM_PROGRAM_ID = new PublicKey('HpNfyc2Saw7RKkQd8nEL4khUcuPhQ7WwY1B2qjx8jxFq');

export class PancakeswapSol {
  private static _instances: { [name: string]: PancakeswapSol };
  public solana: Solana;
  public config: PancakeswapSolConfig.RootConfig;
  private owner?: Keypair;

  private constructor() {
    this.config = PancakeswapSolConfig.config;
    this.solana = null;
  }

  /** Gets singleton instance of PancakeswapSol */
  public static async getInstance(network: string): Promise<PancakeswapSol> {
    if (!PancakeswapSol._instances) {
      PancakeswapSol._instances = {};
    }

    if (!PancakeswapSol._instances[network]) {
      const instance = new PancakeswapSol();
      await instance.init(network);
      PancakeswapSol._instances[network] = instance;
    }

    return PancakeswapSol._instances[network];
  }

  /** Initializes PancakeswapSol instance */
  private async init(network: string) {
    try {
      this.solana = await Solana.getInstance(network);
      logger.info('PancakeSwap Solana initialized');
    } catch (error) {
      logger.error('PancakeSwap Solana initialization failed:', error);
      throw error;
    }
  }

  /** Sets the owner for operations */
  public async setOwner(owner: Keypair | PublicKey): Promise<void> {
    this.owner = owner as Keypair;
    logger.info('PancakeSwap Solana owner set');
  }

  /** Get CLMM pool info from RPC using manual decoding */
  async getClmmPoolInfo(poolAddress: string): Promise<ClmmPoolInfo> {
    try {
      const poolPubkey = new PublicKey(poolAddress);

      // Fetch account data
      const accountInfo = await this.solana.connection.getAccountInfo(poolPubkey);
      if (!accountInfo) {
        throw new Error('Pool account not found');
      }

      // Verify program owner
      if (!accountInfo.owner.equals(PANCAKESWAP_CLMM_PROGRAM_ID)) {
        throw new Error(`Pool is not owned by PancakeSwap CLMM program. Owner: ${accountInfo.owner.toString()}`);
      }

      const data = accountInfo.data;

      /**
       * Manual decoding of PancakeSwap Solana CLMM PoolState struct
       *
       * Struct layout (from PancakeSwap Solana CLMM program):
       * Offset | Size  | Field              | Type    | Description
       * -------|-------|--------------------|---------|---------------------------------
       * 0      | 8     | discriminator      | [u8; 8] | Anchor discriminator
       * 8      | 1     | bump               | u8      | PDA bump seed
       * 9      | 32    | amm_config         | Pubkey  | AMM config account
       * 41     | 32    | owner              | Pubkey  | Pool owner
       * 73     | 32    | token_mint_0       | Pubkey  | First token mint
       * 105    | 32    | token_mint_1       | Pubkey  | Second token mint
       * 137    | 32    | token_vault_0      | Pubkey  | First token vault
       * 169    | 32    | token_vault_1      | Pubkey  | Second token vault
       * 201    | 32    | observation_key    | Pubkey  | Observation account
       * 233    | 1     | mint_decimals_0    | u8      | First token decimals
       * 234    | 1     | mint_decimals_1    | u8      | Second token decimals
       * 235    | 2     | tick_spacing       | u16     | Tick spacing
       * 237    | 16    | liquidity          | u128    | Total liquidity
       * 253    | 16    | sqrt_price_x64     | u128    | Square root price (Q64.64)
       * 269    | 4     | tick_current       | i32     | Current tick
       * ...    | ...   | (remaining fields) | ...     | (not parsed)
       *
       * Total struct size: ~508 bytes
       */
      // Skip discriminator (8 bytes) + bump (1 byte) = 9 bytes
      let offset = 9;

      // Read ammConfig pubkey (32 bytes)
      const ammConfig = new PublicKey(data.slice(offset, offset + 32));
      offset += 64; // Skip ammConfig + owner

      // Read tokenMint0 (32 bytes)
      const tokenMint0 = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;

      // Read tokenMint1 (32 bytes)
      const tokenMint1 = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;

      // Read token vaults (32 bytes each)
      const tokenVault0 = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      const tokenVault1 = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;

      // Skip observation key (32 bytes)
      offset += 32;

      // Read mint decimals (2 bytes)
      const mintDecimals0 = data.readUInt8(offset);
      const mintDecimals1 = data.readUInt8(offset + 1);
      offset += 2;

      // Read tick spacing (2 bytes)
      const tickSpacing = data.readUInt16LE(offset);
      offset += 2;

      // Read liquidity (16 bytes, u128) - not currently used but part of data structure
      // const liquidity = data.readBigUInt64LE(offset);
      offset += 16;

      // Read sqrt_price_x64 (16 bytes, u128)
      const sqrtPriceX64 = data.readBigUInt64LE(offset);
      offset += 16;

      // Read tick_current (4 bytes, i32)
      const tickCurrent = data.readInt32LE(offset);

      // Get vault balances
      const vaultABalance = (await this.solana.connection.getTokenAccountBalance(tokenVault0)).value.uiAmount;
      const vaultBBalance = (await this.solana.connection.getTokenAccountBalance(tokenVault1)).value.uiAmount;

      // Fetch AMM config for fee
      const configAccountInfo = await this.solana.connection.getAccountInfo(ammConfig);
      let feePct = 0.25; // Default fallback
      if (configAccountInfo) {
        // tradeFeeRate is at offset 47 in AMM config (u32, little endian)
        const tradeFeeRate = configAccountInfo.data.readUInt32LE(47);
        feePct = tradeFeeRate / 10000;
      }

      // Calculate price from sqrtPriceX64
      // Price = (sqrtPriceX64 / 2^64) ^ 2
      const sqrtPrice = Number(sqrtPriceX64) / Math.pow(2, 64);
      const price = Math.pow(sqrtPrice, 2);

      // Adjust price for decimal difference
      const decimalDiff = mintDecimals0 - mintDecimals1;
      const adjustedPrice = price * Math.pow(10, decimalDiff);

      const poolInfo: ClmmPoolInfo = {
        address: poolAddress,
        baseTokenAddress: tokenMint0.toString(),
        quoteTokenAddress: tokenMint1.toString(),
        binStep: tickSpacing,
        feePct,
        price: adjustedPrice,
        baseTokenAmount: Number(vaultABalance),
        quoteTokenAmount: Number(vaultBBalance),
        activeBinId: tickCurrent,
      };

      return poolInfo;
    } catch (error) {
      logger.error(`Error getting CLMM pool info for ${poolAddress}:`, error);
      throw error;
    }
  }

  /** Get position info from position NFT */
  async getPositionInfo(positionAddress: string): Promise<PositionInfo> {
    // Get position PDA
    const positionNftMint = new PublicKey(positionAddress);
    const [positionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), positionNftMint.toBuffer()],
      PANCAKESWAP_CLMM_PROGRAM_ID,
    );

    // Fetch position account data
    const accountInfo = await this.solana.connection.getAccountInfo(positionPda);
    if (!accountInfo) {
      throw new Error('Position account not found');
    }

    const data = accountInfo.data;

    /**
     * Manual decoding of PancakeSwap Solana CLMM PersonalPositionState struct
     *
     * Struct layout (from PancakeSwap Solana CLMM program):
     * Offset | Size  | Field                    | Type    | Description
     * -------|-------|--------------------------|---------|----------------------------------------
     * 0      | 8     | discriminator            | [u8; 8] | Anchor discriminator
     * 8      | 1     | bump                     | u8      | PDA bump seed
     * 9      | 32    | nft_mint                 | Pubkey  | Position NFT mint
     * 41     | 32    | pool_id                  | Pubkey  | Associated pool
     * 73     | 4     | tick_lower_index         | i32     | Lower tick boundary
     * 77     | 4     | tick_upper_index         | i32     | Upper tick boundary
     * 81     | 16    | liquidity                | u128    | Position liquidity
     * 97     | 16    | fee_growth_inside_0_last | u128    | Last fee growth inside (token 0)
     * 113    | 16    | fee_growth_inside_1_last | u128    | Last fee growth inside (token 1)
     * 129    | 8     | token_fees_owed_0        | u64     | Uncollected fees (token 0)
     * 137    | 8     | token_fees_owed_1        | u64     | Uncollected fees (token 1)
     * 145    | ...   | reward_infos             | ...     | Reward tracking info
     *
     * Total struct size: ~285 bytes
     *
     * Note: This manual parsing is used instead of parsePositionData for demonstration.
     * For production use, consider using parsePositionData helper from pancakeswap-sol-utils.
     */
    // Skip discriminator (8 bytes) + bump (1 byte) = 9 bytes
    let offset = 9;

    // Read nft_mint (32 bytes)
    offset += 32;

    // Read pool_id (32 bytes)
    const poolId = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    // Read tick_lower_index (4 bytes, i32)
    const tickLowerIndex = data.readInt32LE(offset);
    offset += 4;

    // Read tick_upper_index (4 bytes, i32)
    const tickUpperIndex = data.readInt32LE(offset);
    offset += 4;

    // Read liquidity (16 bytes, u128) - must read as BN from 16 bytes, not BigUInt64
    const liquidityBytes = data.slice(offset, offset + 16);
    const liquidity = new BN(liquidityBytes, 'le');
    offset += 16;

    // Skip fee_growth fields (32 bytes)
    offset += 32;

    // Read token_fees_owed_0 (8 bytes, u64)
    const tokenFeesOwed0 = data.readBigUInt64LE(offset);
    offset += 8;

    // Read token_fees_owed_1 (8 bytes, u64)
    const tokenFeesOwed1 = data.readBigUInt64LE(offset);

    const poolInfo = await this.getClmmPoolInfo(poolId.toString());

    // Get token info for decimals
    const baseTokenInfo = await this.solana.getToken(poolInfo.baseTokenAddress);
    const quoteTokenInfo = await this.solana.getToken(poolInfo.quoteTokenAddress);

    if (!baseTokenInfo || !quoteTokenInfo) {
      throw new Error(`Token info not found for position ${positionAddress}`);
    }

    // Calculate decimal difference for tick-to-price conversion
    const decimalDiff = baseTokenInfo.decimals - quoteTokenInfo.decimals;

    // Convert ticks to actual prices using tickToPrice
    const lowerPrice = tickToPrice(tickLowerIndex, decimalDiff);
    const upperPrice = tickToPrice(tickUpperIndex, decimalDiff);

    // Calculate position amounts using proper CLMM math
    // This uses the current pool price and the position's tick range
    const amounts = getAmountsFromLiquidity(
      poolInfo.price, // current price
      lowerPrice, // lower tick price
      upperPrice, // upper tick price
      liquidity, // position liquidity
      baseTokenInfo.decimals,
      quoteTokenInfo.decimals,
    );

    const baseTokenAmount = amounts.amount0;
    const quoteTokenAmount = amounts.amount1;

    // Convert fees to decimal amounts
    const baseFeeAmount = Number(tokenFeesOwed0) / Math.pow(10, baseTokenInfo.decimals);
    const quoteFeeAmount = Number(tokenFeesOwed1) / Math.pow(10, quoteTokenInfo.decimals);

    return {
      address: positionAddress,
      poolAddress: poolId.toString(),
      baseTokenAddress: poolInfo.baseTokenAddress,
      quoteTokenAddress: poolInfo.quoteTokenAddress,
      lowerPrice,
      upperPrice,
      price: poolInfo.price,
      baseTokenAmount,
      quoteTokenAmount,
      baseFeeAmount,
      quoteFeeAmount,
      lowerBinId: tickLowerIndex,
      upperBinId: tickUpperIndex,
    };
  }

  /**
   * Helper function to prepare wallet for transaction operations
   */
  public async prepareWallet(walletAddress: string): Promise<{
    wallet: Keypair | PublicKey;
    isHardwareWallet: boolean;
  }> {
    const isHardwareWallet = await this.solana.isHardwareWallet(walletAddress);
    const wallet = isHardwareWallet
      ? await this.solana.getPublicKey(walletAddress)
      : await this.solana.getWallet(walletAddress);

    await this.setOwner(wallet);

    return { wallet, isHardwareWallet };
  }

  /**
   * Helper function to sign transaction with hardware or regular wallet
   */
  public async signTransaction(
    transaction: VersionedTransaction | Transaction,
    walletAddress: string,
    isHardwareWallet: boolean,
    wallet: Keypair | PublicKey,
  ): Promise<VersionedTransaction | Transaction> {
    if (isHardwareWallet) {
      logger.info(`Hardware wallet detected for ${walletAddress}. Signing transaction with Ledger.`);
      const ledger = new SolanaLedger();
      return await ledger.signTransaction(walletAddress, transaction);
    } else {
      // Regular wallet - sign normally
      if (transaction instanceof VersionedTransaction) {
        transaction.sign([wallet as Keypair]);
      } else {
        (transaction as Transaction).sign(wallet as Keypair);
      }
      return transaction;
    }
  }
}
