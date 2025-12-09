import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import BN from 'bn.js';

import { Solana } from '../../chains/solana/solana';
import { SolanaLedger } from '../../chains/solana/solana-ledger';
import { PoolInfo as ClmmPoolInfo, PositionInfo } from '../../schemas/clmm-schema';
import { httpErrors } from '../../services/error-handler';
import { logger } from '../../services/logger';

import clmmIdl from './idl/clmm.json';
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

  /** Gets Anchor program instance for PancakeSwap CLMM */
  private getAnchorProgram(): Program {
    const provider = new AnchorProvider(
      this.solana.connection,
      new Wallet(Keypair.generate()), // Dummy wallet for read-only operations
      { commitment: 'confirmed' },
    );
    return new Program(clmmIdl as any, provider);
  }

  /** Get CLMM pool info from RPC using manual decoding */
  async getClmmPoolInfo(poolAddress: string): Promise<ClmmPoolInfo> {
    try {
      const poolPubkey = new PublicKey(poolAddress);

      // Fetch account data with confirmed commitment to avoid stale cache
      const accountInfo = await this.solana.connection.getAccountInfo(poolPubkey, 'confirmed');
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
      // Need to read as 16 bytes, not 8! Use slice and create BigInt from buffer
      const sqrtPriceX64Bytes = data.slice(offset, offset + 16);
      // Convert little-endian bytes to BigInt
      let sqrtPriceX64Value = BigInt(0);
      for (let i = 0; i < 16; i++) {
        sqrtPriceX64Value += BigInt(sqrtPriceX64Bytes[i]) << BigInt(i * 8);
      }
      const sqrtPriceX64 = sqrtPriceX64Value;
      offset += 16;

      // Read tick_current (4 bytes, i32)
      const tickCurrent = data.readInt32LE(offset);
      offset += 4;

      // Read fee_growth_global_0_x64 (16 bytes, u128)
      const feeGrowthGlobal0Bytes = data.slice(offset, offset + 16);
      let feeGrowthGlobal0 = BigInt(0);
      for (let i = 0; i < 16; i++) {
        feeGrowthGlobal0 += BigInt(feeGrowthGlobal0Bytes[i]) << BigInt(i * 8);
      }
      offset += 16;

      // Read fee_growth_global_1_x64 (16 bytes, u128)
      const feeGrowthGlobal1Bytes = data.slice(offset, offset + 16);
      let feeGrowthGlobal1 = BigInt(0);
      for (let i = 0; i < 16; i++) {
        feeGrowthGlobal1 += BigInt(feeGrowthGlobal1Bytes[i]) << BigInt(i * 8);
      }
      offset += 16;

      // Skip to reward_infos in PoolState
      // After fee_growth_global_1_x64, we have:
      // - protocol_fees_token_0 (u64, 8 bytes)
      // - protocol_fees_token_1 (u64, 8 bytes)
      // - swap_in_amount_token_0 (u128, 16 bytes)
      // - swap_out_amount_token_1 (u128, 16 bytes)
      // - swap_in_amount_token_1 (u128, 16 bytes)
      // - swap_out_amount_token_0 (u128, 16 bytes)
      // - status (u8, 1 byte)
      // - padding (7 bytes)
      offset += 8 + 8 + 16 + 16 + 16 + 16 + 1 + 7; // = 88 bytes

      // Parse pool reward_infos (3 RewardInfo structs, each 169 bytes)
      // RewardInfo struct:
      // - reward_state (u8, 1 byte)
      // - open_time (u64, 8 bytes)
      // - end_time (u64, 8 bytes)
      // - last_update_time (u64, 8 bytes)
      // - emissions_per_second_x64 (u128, 16 bytes)
      // - reward_total_emissioned (u64, 8 bytes)
      // - reward_claimed (u64, 8 bytes)
      // - token_mint (pubkey, 32 bytes)
      // - token_vault (pubkey, 32 bytes)
      // - authority (pubkey, 32 bytes)
      // - reward_growth_global_x64 (u128, 16 bytes)
      // Total: 169 bytes per RewardInfo
      const rewardGrowthGlobalX64: bigint[] = [];
      for (let i = 0; i < 3; i++) {
        // Skip to reward_growth_global_x64 (last field in RewardInfo, 16 bytes before end)
        const rewardInfoOffset = offset + i * 169 + 153; // 153 = all fields before reward_growth_global_x64
        const rewardGrowthBytes = data.slice(rewardInfoOffset, rewardInfoOffset + 16);
        let rewardGrowth = BigInt(0);
        for (let j = 0; j < 16; j++) {
          rewardGrowth += BigInt(rewardGrowthBytes[j]) << BigInt(j * 8);
        }
        rewardGrowthGlobalX64.push(rewardGrowth);
      }

      // Get vault balances
      const vaultABalance = (await this.solana.connection.getTokenAccountBalance(tokenVault0)).value.uiAmount;
      const vaultBBalance = (await this.solana.connection.getTokenAccountBalance(tokenVault1)).value.uiAmount;

      // Fetch AMM config for fee with confirmed commitment
      const configAccountInfo = await this.solana.connection.getAccountInfo(ammConfig, 'confirmed');
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
      // sqrtPriceX64 represents sqrt(token1/token0) in raw units (standard CLMM)
      // After squaring: token1/token0 in raw units
      // To convert to human-readable units: price * 10^(decimals0 - decimals1)
      // This gives us token1/token0 in human units (quote/base)
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

      // Store fee and reward growth values separately (PancakeSwap-specific, not in PoolInfo schema)
      (poolInfo as any)._feeGrowthGlobal0 = feeGrowthGlobal0;
      (poolInfo as any)._feeGrowthGlobal1 = feeGrowthGlobal1;
      (poolInfo as any)._rewardGrowthGlobalX64 = rewardGrowthGlobalX64;

      return poolInfo;
    } catch (error) {
      logger.debug(`Could not decode ${poolAddress} as PancakeSwap CLMM pool: ${error}`);
      return null;
    }
  }

  /** Get position info from position NFT */
  async getPositionInfo(positionAddress: string): Promise<PositionInfo> {
    // Validate position address
    let positionNftMint: PublicKey;
    try {
      positionNftMint = new PublicKey(positionAddress);
    } catch {
      throw httpErrors.badRequest(`Invalid position address: ${positionAddress}`);
    }

    // Get position PDA
    const [positionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), positionNftMint.toBuffer()],
      PANCAKESWAP_CLMM_PROGRAM_ID,
    );

    // Fetch position account data
    const accountInfo = await this.solana.connection.getAccountInfo(positionPda, 'confirmed');
    if (!accountInfo) {
      throw httpErrors.notFound(`Position not found: ${positionAddress}`);
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
    const manualPoolId = new PublicKey(data.slice(offset, offset + 32));
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

    // Read fee_growth_inside_0_last (16 bytes, u128)
    const feeGrowthInside0LastBytes = data.slice(offset, offset + 16);
    let feeGrowthInside0Last = BigInt(0);
    for (let i = 0; i < 16; i++) {
      feeGrowthInside0Last += BigInt(feeGrowthInside0LastBytes[i]) << BigInt(i * 8);
    }
    offset += 16;

    // Read fee_growth_inside_1_last (16 bytes, u128)
    const feeGrowthInside1LastBytes = data.slice(offset, offset + 16);
    let feeGrowthInside1Last = BigInt(0);
    for (let i = 0; i < 16; i++) {
      feeGrowthInside1Last += BigInt(feeGrowthInside1LastBytes[i]) << BigInt(i * 8);
    }
    offset += 16;

    // Read token_fees_owed_0 (8 bytes, u64)
    const tokenFeesOwed0 = data.readBigUInt64LE(offset);
    offset += 8;

    // Read token_fees_owed_1 (8 bytes, u64)
    const tokenFeesOwed1 = data.readBigUInt64LE(offset);
    offset += 8;

    // Read reward_infos (3 PositionRewardInfo structs, each 24 bytes)
    // PositionRewardInfo struct (from IDL):
    // - growth_inside_last_x64 (u128, 16 bytes)
    // - reward_amount_owed (u64, 8 bytes)
    const positionRewardInfo: Array<{ growthInsideLastX64: bigint; rewardAmountOwed: bigint }> = [];
    for (let i = 0; i < 3; i++) {
      // Read growth_inside_last_x64 (16 bytes, u128)
      const growthInsideLastBytes = data.slice(offset, offset + 16);
      let growthInsideLast = BigInt(0);
      for (let j = 0; j < 16; j++) {
        growthInsideLast += BigInt(growthInsideLastBytes[j]) << BigInt(j * 8);
      }
      offset += 16;

      // Read reward_amount_owed (8 bytes, u64)
      const rewardAmountOwed = data.readBigUInt64LE(offset);
      offset += 8;

      positionRewardInfo.push({ growthInsideLastX64: growthInsideLast, rewardAmountOwed });
    }

    const poolInfo = await this.getClmmPoolInfo(manualPoolId.toString());

    // Extract pool-level global growth values
    const poolFeeGrowthGlobal0 = (poolInfo as any)._feeGrowthGlobal0 as bigint;
    const poolFeeGrowthGlobal1 = (poolInfo as any)._feeGrowthGlobal1 as bigint;
    const poolRewardGrowthGlobalX64 = (poolInfo as any)._rewardGrowthGlobalX64 as bigint[];

    // Also fetch ProtocolPositionState PDA for this position's tick range
    // This aggregates position data at the tick level and might have updated fee/reward info
    const [protocolPositionPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('position'),
        manualPoolId.toBuffer(),
        Buffer.from(new Int32Array([tickLowerIndex]).buffer),
        Buffer.from(new Int32Array([tickUpperIndex]).buffer),
      ],
      PANCAKESWAP_CLMM_PROGRAM_ID,
    );

    const protocolPositionAccount = await this.solana.connection.getAccountInfo(protocolPositionPda, 'confirmed');

    // Log all position and pool data for analysis
    logger.debug(`Position ${positionAddress} - PersonalPositionState data from chain:`);
    logger.debug(`  - poolId: ${manualPoolId.toString()}`);
    logger.debug(`  - tickLowerIndex: ${tickLowerIndex}`);
    logger.debug(`  - tickUpperIndex: ${tickUpperIndex}`);
    logger.debug(`  - liquidity: ${liquidity.toString()}`);
    logger.debug(`  - feeGrowthInside0Last: ${feeGrowthInside0Last.toString()}`);
    logger.debug(`  - feeGrowthInside1Last: ${feeGrowthInside1Last.toString()}`);
    logger.debug(`  - tokenFeesOwed0 (raw): ${tokenFeesOwed0.toString()}`);
    logger.debug(`  - tokenFeesOwed1 (raw): ${tokenFeesOwed1.toString()}`);
    logger.debug(`  - rewardInfos[0].growthInsideLastX64: ${positionRewardInfo[0].growthInsideLastX64.toString()}`);
    logger.debug(`  - rewardInfos[0].rewardAmountOwed (raw): ${positionRewardInfo[0].rewardAmountOwed.toString()}`);

    logger.debug(`Pool ${manualPoolId.toString()} - Global growth values from PoolState:`);
    logger.debug(`  - feeGrowthGlobal0X64: ${poolFeeGrowthGlobal0.toString()}`);
    logger.debug(`  - feeGrowthGlobal1X64: ${poolFeeGrowthGlobal1.toString()}`);
    logger.debug(`  - rewardGrowthGlobalX64[0]: ${poolRewardGrowthGlobalX64[0].toString()}`);
    logger.debug(`  - rewardGrowthGlobalX64[1]: ${poolRewardGrowthGlobalX64[1].toString()}`);
    logger.debug(`  - rewardGrowthGlobalX64[2]: ${poolRewardGrowthGlobalX64[2].toString()}`);

    if (protocolPositionAccount) {
      // Parse ProtocolPositionState to see what additional data is available
      // ProtocolPositionState struct layout:
      // Offset | Size | Field                      | Type
      // -------|------|----------------------------|------
      // 0      | 8    | discriminator              | [u8; 8]
      // 8      | 1    | bump                       | u8
      // 9      | 32   | pool_id                    | Pubkey
      // 41     | 4    | tick_lower_index           | i32
      // 45     | 4    | tick_upper_index           | i32
      // 49     | 16   | liquidity                  | u128
      // 65     | 16   | fee_growth_inside_0_last   | u128
      // 81     | 16   | fee_growth_inside_1_last   | u128
      // 97     | 8    | token_fees_owed_0          | u64
      // 105    | 8    | token_fees_owed_1          | u64
      // 113    | 48   | reward_growth_inside       | [u128; 3]
      // 161    | 8    | recent_epoch               | u64
      // 169    | ...  | padding                    | ...

      const ppsData = protocolPositionAccount.data;
      let ppsOffset = 9; // Skip discriminator + bump

      ppsOffset += 32; // pool_id
      ppsOffset += 4; // tick_lower_index
      ppsOffset += 4; // tick_upper_index

      // Read liquidity
      const ppsLiquidityBytes = ppsData.slice(ppsOffset, ppsOffset + 16);
      const ppsLiquidity = new BN(ppsLiquidityBytes, 'le');
      ppsOffset += 16;

      // Read fee_growth_inside_0_last
      const ppsFeeGrowth0Bytes = ppsData.slice(ppsOffset, ppsOffset + 16);
      let ppsFeeGrowth0 = BigInt(0);
      for (let i = 0; i < 16; i++) {
        ppsFeeGrowth0 += BigInt(ppsFeeGrowth0Bytes[i]) << BigInt(i * 8);
      }
      ppsOffset += 16;

      // Read fee_growth_inside_1_last
      const ppsFeeGrowth1Bytes = ppsData.slice(ppsOffset, ppsOffset + 16);
      let ppsFeeGrowth1 = BigInt(0);
      for (let i = 0; i < 16; i++) {
        ppsFeeGrowth1 += BigInt(ppsFeeGrowth1Bytes[i]) << BigInt(i * 8);
      }
      ppsOffset += 16;

      // Read token_fees_owed_0
      const ppsTokenFeesOwed0 = ppsData.readBigUInt64LE(ppsOffset);
      ppsOffset += 8;

      // Read token_fees_owed_1
      const ppsTokenFeesOwed1 = ppsData.readBigUInt64LE(ppsOffset);
      ppsOffset += 8;

      // Read reward_growth_inside (3 u128 values)
      const ppsRewardGrowth: bigint[] = [];
      for (let i = 0; i < 3; i++) {
        const rewardGrowthBytes = ppsData.slice(ppsOffset, ppsOffset + 16);
        let rewardGrowth = BigInt(0);
        for (let j = 0; j < 16; j++) {
          rewardGrowth += BigInt(rewardGrowthBytes[j]) << BigInt(j * 8);
        }
        ppsOffset += 16;
        ppsRewardGrowth.push(rewardGrowth);
      }

      logger.debug(`Position ${positionAddress} - ProtocolPositionState data from chain:`);
      logger.debug(`  - PDA: ${protocolPositionPda.toString()}`);
      logger.debug(`  - liquidity: ${ppsLiquidity.toString()}`);
      logger.debug(`  - feeGrowthInside0Last: ${ppsFeeGrowth0.toString()}`);
      logger.debug(`  - feeGrowthInside1Last: ${ppsFeeGrowth1.toString()}`);
      logger.debug(`  - tokenFeesOwed0 (raw): ${ppsTokenFeesOwed0.toString()}`);
      logger.debug(`  - tokenFeesOwed1 (raw): ${ppsTokenFeesOwed1.toString()}`);
      logger.debug(`  - rewardGrowthInside[0]: ${ppsRewardGrowth[0].toString()}`);
      logger.debug(`  - rewardGrowthInside[1]: ${ppsRewardGrowth[1].toString()}`);
      logger.debug(`  - rewardGrowthInside[2]: ${ppsRewardGrowth[2].toString()}`);
    } else {
      logger.debug(`Position ${positionAddress} - ProtocolPositionState PDA not found`);
    }

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

    // TODO: Fix fee and reward calculations for PancakeSwap-Sol
    // Setting to 0 for now to avoid showing incorrect information
    const baseFeeAmount = 0;
    const quoteFeeAmount = 0;
    const cakeRewardAmount = 0;

    return {
      address: positionAddress,
      poolAddress: manualPoolId.toString(),
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
      // TODO: Enable once reward calculation is fixed
      // rewardTokenAddress: cakeRewardAmount > 0 ? CAKE_ADDRESS : undefined,
      // rewardAmount: cakeRewardAmount > 0 ? cakeRewardAmount : undefined,
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
