import { BorshCoder, Idl } from '@coral-xyz/anchor';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  createCloseAccountInstruction,
} from '@solana/spl-token';
import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  ComputeBudgetProgram,
  TransactionMessage,
  VersionedTransaction,
  Keypair,
} from '@solana/web3.js';
import BN from 'bn.js';

import { Solana } from '../../chains/solana/solana';

import { PANCAKESWAP_CLMM_PROGRAM_ID } from './pancakeswap-sol';

const clmmIdl = require('./idl/clmm.json') as Idl;

// Memo program
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

// Price limit constants for CLMM swaps
// These represent the min/max sqrt(price) * 2^64 based on tick bounds
export const MIN_SQRT_PRICE_X64 = new BN('4295048016'); // Minimum sqrt price
export const MAX_SQRT_PRICE_X64 = new BN('79226673515401279992447579055'); // Maximum sqrt price

/**
 * Helper to detect which token program a mint uses
 */
async function getTokenProgramForMint(solana: Solana, mint: PublicKey): Promise<PublicKey> {
  // Try Token2022 first
  try {
    const accountInfo = await solana.connection.getAccountInfo(mint);
    if (accountInfo && accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
      return TOKEN_2022_PROGRAM_ID;
    }
  } catch (e) {
    // Fall through to TOKEN_PROGRAM_ID
  }
  return TOKEN_PROGRAM_ID;
}

/**
 * Build a swap_v2 instruction for PancakeSwap Solana CLMM
 */
export async function buildSwapV2Instruction(
  solana: Solana,
  poolAddress: string,
  walletPubkey: PublicKey,
  inputMint: PublicKey,
  outputMint: PublicKey,
  amount: BN,
  otherAmountThreshold: BN,
  sqrtPriceLimitX64: BN,
  isBaseInput: boolean,
): Promise<TransactionInstruction> {
  // Get pool account data to find config and observation state
  const poolPubkey = new PublicKey(poolAddress);
  const poolAccountInfo = await solana.connection.getAccountInfo(poolPubkey);

  if (!poolAccountInfo) {
    throw new Error(`Pool account not found: ${poolAddress}`);
  }

  // Decode pool data to get amm_config, vaults, observation_state, and tick info
  const data = poolAccountInfo.data;

  // Based on PoolState struct layout from IDL:
  // discriminator (8) + bump (1) = 9 bytes
  let offset = 9;

  // amm_config (32) + owner (32) = 64 bytes
  const ammConfig = new PublicKey(data.slice(offset, offset + 32));
  offset += 64; // Skip both amm_config and owner

  // token_mint_0 (32) and token_mint_1 (32)
  const tokenMint0 = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const tokenMint1 = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  // token_vault_0 (32) and token_vault_1 (32)
  const tokenVault0 = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const tokenVault1 = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  // observation_key (32)
  const observationState = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  // mint_decimals (2 bytes) - skip
  offset += 2;

  // tick_spacing (2 bytes, u16)
  const tickSpacing = data.readUInt16LE(offset);
  offset += 2;

  // liquidity (16 bytes, u128) - skip
  offset += 16;

  // sqrt_price_x64 (16 bytes, u128) - skip
  offset += 16;

  // tick_current (4 bytes, i32)
  const tickCurrent = data.readInt32LE(offset);

  // Calculate tick array for current tick
  const tickArrayStartIndex = getTickArrayStartIndexFromTick(tickCurrent, tickSpacing);
  const tickArrayAddress = getTickArrayAddress(poolPubkey, tickArrayStartIndex);

  // Determine which vault is input/output based on mints
  const inputVault = inputMint.equals(tokenMint0) ? tokenVault0 : tokenVault1;
  const outputVault = outputMint.equals(tokenMint0) ? tokenVault0 : tokenVault1;

  // Debug logging
  const { logger } = await import('../../services/logger');
  logger.info(`Pool tokens: mint0=${tokenMint0.toString()}, mint1=${tokenMint1.toString()}`);
  logger.info(`Swap tokens: input=${inputMint.toString()}, output=${outputMint.toString()}`);
  logger.info(`Vaults: input=${inputVault.toString()}, output=${outputVault.toString()}`);
  logger.info(`isBaseInput=${isBaseInput}`);

  // Detect token programs for input/output mints
  const [inputTokenProgram, outputTokenProgram] = await Promise.all([
    getTokenProgramForMint(solana, inputMint),
    getTokenProgramForMint(solana, outputMint),
  ]);

  // Get user token accounts with correct token programs
  const inputTokenAccount = getAssociatedTokenAddressSync(inputMint, walletPubkey, false, inputTokenProgram);
  const outputTokenAccount = getAssociatedTokenAddressSync(outputMint, walletPubkey, false, outputTokenProgram);

  logger.info(`Token accounts: input=${inputTokenAccount.toString()}, output=${outputTokenAccount.toString()}`);
  logger.info(`Token programs: input=${inputTokenProgram.toString()}, output=${outputTokenProgram.toString()}`);

  // Create instruction using Anchor coder
  const coder = new BorshCoder(clmmIdl);

  const instructionData = coder.instruction.encode('swap_v2', {
    amount,
    other_amount_threshold: otherAmountThreshold,
    sqrt_price_limit_x64: sqrtPriceLimitX64,
    is_base_input: isBaseInput,
  });

  // TODO: Implement proper tick array discovery
  // For now, only include tick array if it exists on-chain
  const tickArrayInfo = await solana.connection.getAccountInfo(tickArrayAddress);

  const accounts = [
    { pubkey: walletPubkey, isSigner: true, isWritable: true }, // payer
    { pubkey: ammConfig, isSigner: false, isWritable: false }, // amm_config
    { pubkey: poolPubkey, isSigner: false, isWritable: true }, // pool_state
    { pubkey: inputTokenAccount, isSigner: false, isWritable: true }, // input_token_account
    { pubkey: outputTokenAccount, isSigner: false, isWritable: true }, // output_token_account
    { pubkey: inputVault, isSigner: false, isWritable: true }, // input_vault
    { pubkey: outputVault, isSigner: false, isWritable: true }, // output_vault
    { pubkey: observationState, isSigner: false, isWritable: true }, // observation_state
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program_2022
    { pubkey: MEMO_PROGRAM_ID, isSigner: false, isWritable: false }, // memo_program
    { pubkey: inputMint, isSigner: false, isWritable: false }, // input_vault_mint
    { pubkey: outputMint, isSigner: false, isWritable: false }, // output_vault_mint
  ];

  // Add tick array as remaining account only if it exists
  if (tickArrayInfo) {
    accounts.push({ pubkey: tickArrayAddress, isSigner: false, isWritable: true });
    logger.info(`Including tick array: ${tickArrayAddress.toString()}`);
  } else {
    logger.warn(`Tick array not initialized: ${tickArrayAddress.toString()}, skipping`);
  }

  const instruction = new TransactionInstruction({
    programId: PANCAKESWAP_CLMM_PROGRAM_ID,
    keys: accounts,
    data: instructionData,
  });

  logger.info(`SwapV2 Instruction Details:
    Program: ${PANCAKESWAP_CLMM_PROGRAM_ID.toString()}
    Accounts: ${instruction.keys.length}
    Tick Current: ${tickCurrent}
    Tick Spacing: ${tickSpacing}
    Tick Array Start: ${tickArrayStartIndex}
    Tick Array Address: ${tickArrayAddress.toString()}
    Instruction Data (hex): ${instructionData.toString('hex')}
    amount: ${amount.toString()}
    otherAmountThreshold: ${otherAmountThreshold.toString()}
    sqrtPriceLimitX64: ${sqrtPriceLimitX64.toString()}
    isBaseInput: ${isBaseInput}`);

  return instruction;
}

/**
 * Build a complete swap transaction with compute budget and token account setup
 */
export async function buildSwapTransaction(
  solana: Solana,
  poolAddress: string,
  walletPubkey: PublicKey,
  inputMint: PublicKey,
  outputMint: PublicKey,
  amount: BN,
  otherAmountThreshold: BN,
  sqrtPriceLimitX64: BN,
  isBaseInput: boolean,
  computeUnits: number = 600000,
  priorityFeePerCU?: number,
): Promise<VersionedTransaction> {
  const instructions: TransactionInstruction[] = [];

  // Add compute budget instructions
  instructions.push(ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }));

  if (priorityFeePerCU !== undefined && priorityFeePerCU > 0) {
    instructions.push(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFeePerCU,
      }),
    );
  }

  // Detect token programs for input/output mints
  const [inputTokenProgram, outputTokenProgram] = await Promise.all([
    getTokenProgramForMint(solana, inputMint),
    getTokenProgramForMint(solana, outputMint),
  ]);

  // Get token accounts with correct token programs
  const inputTokenAccount = getAssociatedTokenAddressSync(inputMint, walletPubkey, false, inputTokenProgram);
  const outputTokenAccount = getAssociatedTokenAddressSync(outputMint, walletPubkey, false, outputTokenProgram);

  // Check if token accounts exist
  const [inputAccountInfo, outputAccountInfo] = await Promise.all([
    solana.connection.getAccountInfo(inputTokenAccount),
    solana.connection.getAccountInfo(outputTokenAccount),
  ]);

  // Track if we're using WSOL (to close it after swap)
  const isInputSOL = inputMint.equals(NATIVE_MINT);

  // Create input token account if needed
  if (!inputAccountInfo) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        walletPubkey, // payer
        inputTokenAccount, // ata
        walletPubkey, // owner
        inputMint, // mint
        inputTokenProgram, // token program
      ),
    );
  }

  // If input is native SOL, wrap it (regardless of whether account exists)
  if (isInputSOL) {
    // Transfer SOL to WSOL account to wrap it
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: walletPubkey,
        toPubkey: inputTokenAccount,
        lamports: amount.toNumber(),
      }),
    );
    // Sync native (wraps SOL to WSOL)
    instructions.push(createSyncNativeInstruction(inputTokenAccount, inputTokenProgram));
  }

  // Create output token account if needed
  if (!outputAccountInfo) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        walletPubkey, // payer
        outputTokenAccount, // ata
        walletPubkey, // owner
        outputMint, // mint
        outputTokenProgram, // token program
      ),
    );
  }

  // Build and add swap instruction
  const swapIx = await buildSwapV2Instruction(
    solana,
    poolAddress,
    walletPubkey,
    inputMint,
    outputMint,
    amount,
    otherAmountThreshold,
    sqrtPriceLimitX64,
    isBaseInput,
  );
  instructions.push(swapIx);

  // Get recent blockhash
  const { blockhash } = await solana.connection.getLatestBlockhash('confirmed');

  // Build message
  const messageV0 = new TransactionMessage({
    payerKey: walletPubkey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  return new VersionedTransaction(messageV0);
}

/**
 * Build a close_position instruction for PancakeSwap Solana CLMM
 */
export async function buildClosePositionInstruction(
  solana: Solana,
  positionNftMint: PublicKey,
  walletPubkey: PublicKey,
): Promise<TransactionInstruction> {
  // Derive personal_position PDA: ["position", position_nft_mint]
  const [personalPosition] = PublicKey.findProgramAddressSync(
    [Buffer.from('position'), positionNftMint.toBuffer()],
    PANCAKESWAP_CLMM_PROGRAM_ID,
  );

  // Get the position NFT account (try both SPL Token and Token2022)
  // First check Token2022 since PancakeSwap uses it for position NFTs
  let positionNftAccount = getAssociatedTokenAddressSync(positionNftMint, walletPubkey, false, TOKEN_2022_PROGRAM_ID);
  let accountInfo = await solana.connection.getAccountInfo(positionNftAccount);

  // If not found in Token2022, try SPL Token
  if (!accountInfo) {
    positionNftAccount = getAssociatedTokenAddressSync(positionNftMint, walletPubkey, false, TOKEN_PROGRAM_ID);
    accountInfo = await solana.connection.getAccountInfo(positionNftAccount);

    if (!accountInfo) {
      throw new Error(`Position NFT account not found for mint: ${positionNftMint.toString()}`);
    }
  }

  // Create instruction using Anchor coder
  const coder = new BorshCoder(clmmIdl);
  const instructionData = coder.instruction.encode('close_position', {});

  return new TransactionInstruction({
    programId: PANCAKESWAP_CLMM_PROGRAM_ID,
    keys: [
      { pubkey: walletPubkey, isSigner: true, isWritable: true }, // nft_owner
      { pubkey: positionNftMint, isSigner: false, isWritable: true }, // position_nft_mint
      { pubkey: positionNftAccount, isSigner: false, isWritable: true }, // position_nft_account
      { pubkey: personalPosition, isSigner: false, isWritable: true }, // personal_position
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
    ],
    data: instructionData,
  });
}

/**
 * Build a complete close position transaction with compute budget
 */
export async function buildClosePositionTransaction(
  solana: Solana,
  positionNftMint: PublicKey,
  walletPubkey: PublicKey,
  computeUnits: number = 400000,
  priorityFeePerCU?: number,
): Promise<VersionedTransaction> {
  const closePositionIx = await buildClosePositionInstruction(solana, positionNftMint, walletPubkey);

  const instructions: TransactionInstruction[] = [];

  // Add compute budget instructions
  instructions.push(ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }));

  if (priorityFeePerCU !== undefined && priorityFeePerCU > 0) {
    instructions.push(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFeePerCU,
      }),
    );
  }

  // Add close position instruction
  instructions.push(closePositionIx);

  // Get recent blockhash
  const { blockhash } = await solana.connection.getLatestBlockhash('confirmed');

  // Build message
  const messageV0 = new TransactionMessage({
    payerKey: walletPubkey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  return new VersionedTransaction(messageV0);
}

/**
 * Calculate tick array start index from tick and tick spacing
 */
function getTickArrayStartIndexFromTick(tick: number, tickSpacing: number): number {
  const ticksPerArray = tickSpacing * 60; // CLMM uses 60 ticks per array
  return Math.floor(tick / ticksPerArray) * ticksPerArray;
}

/**
 * Convert price to tick index
 * tick = log(price) / log(1.0001)
 */
export function priceToTick(price: number, decimalDiff: number): number {
  const adjustedPrice = price / Math.pow(10, decimalDiff);
  const tick = Math.log(adjustedPrice) / Math.log(1.0001);
  return Math.round(tick);
}

/**
 * Round tick to nearest valid tick based on tick spacing
 */
export function roundTickToSpacing(tick: number, tickSpacing: number): number {
  return Math.round(tick / tickSpacing) * tickSpacing;
}

/**
 * Derive tick array address from pool and start index
 */
function getTickArrayAddress(poolAddress: PublicKey, startIndex: number): PublicKey {
  // Note: PDA seeds use big-endian encoding for i32 values
  const startIndexBuffer = Buffer.alloc(4);
  startIndexBuffer.writeInt32BE(startIndex, 0);

  const [tickArrayAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from('tick_array'), poolAddress.toBuffer(), startIndexBuffer],
    PANCAKESWAP_CLMM_PROGRAM_ID,
  );

  return tickArrayAddress;
}

/**
 * Parse position account data to extract key fields
 */
export function parsePositionData(data: Buffer): {
  poolId: PublicKey;
  tickLowerIndex: number;
  tickUpperIndex: number;
  liquidity: BN;
} {
  // Based on PersonalPositionState struct:
  // discriminator (8) + bump (1) + nft_mint (32) = 41 bytes
  let offset = 41;

  // pool_id (32 bytes)
  const poolId = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  // tick_lower_index (i32 = 4 bytes)
  const tickLowerIndex = data.readInt32LE(offset);
  offset += 4;

  // tick_upper_index (i32 = 4 bytes)
  const tickUpperIndex = data.readInt32LE(offset);
  offset += 4;

  // liquidity (u128 = 16 bytes)
  const liquidityBytes = data.slice(offset, offset + 16);
  const liquidity = new BN(liquidityBytes, 'le');

  return { poolId, tickLowerIndex, tickUpperIndex, liquidity };
}

/**
 * Parse pool account data to extract tick spacing
 */
export function parsePoolTickSpacing(data: Buffer): number {
  // Skip discriminator (8) + bump (1) + amm_config (32) + owner (32) = 73 bytes
  // Skip token_mint_0 (32) + token_mint_1 (32) = 64 bytes
  // Skip token_vault_0 (32) + token_vault_1 (32) = 64 bytes
  // Skip observation_key (32) = 32 bytes
  // Skip mint_decimals_0 (1) + mint_decimals_1 (1) = 2 bytes
  // Total offset = 73 + 64 + 64 + 32 + 2 = 235
  const offset = 235;

  // tick_spacing is u16 (2 bytes)
  const tickSpacing = data.readUInt16LE(offset);
  return tickSpacing;
}

/**
 * Build a decrease_liquidity_v2 instruction for PancakeSwap Solana CLMM
 */
export async function buildDecreaseLiquidityV2Instruction(
  solana: Solana,
  positionNftMint: PublicKey,
  walletPubkey: PublicKey,
  liquidityToRemove: BN,
  amount0Min: BN,
  amount1Min: BN,
): Promise<TransactionInstruction> {
  // Get position account to extract pool and ticks
  const [personalPosition] = PublicKey.findProgramAddressSync(
    [Buffer.from('position'), positionNftMint.toBuffer()],
    PANCAKESWAP_CLMM_PROGRAM_ID,
  );

  const positionAccountInfo = await solana.connection.getAccountInfo(personalPosition);
  if (!positionAccountInfo) {
    throw new Error(`Position account not found: ${personalPosition.toString()}`);
  }

  const { poolId, tickLowerIndex, tickUpperIndex } = parsePositionData(positionAccountInfo.data);

  // Get pool account to extract vaults and tick spacing
  const poolAccountInfo = await solana.connection.getAccountInfo(poolId);
  if (!poolAccountInfo) {
    throw new Error(`Pool account not found: ${poolId.toString()}`);
  }

  const poolData = poolAccountInfo.data;

  // Parse pool data (same as swap)
  let offset = 9; // Skip discriminator + bump
  offset += 64; // Skip amm_config + owner
  const tokenMint0 = new PublicKey(poolData.slice(offset, offset + 32));
  offset += 32;
  const tokenMint1 = new PublicKey(poolData.slice(offset, offset + 32));
  offset += 32;
  const tokenVault0 = new PublicKey(poolData.slice(offset, offset + 32));
  offset += 32;
  const tokenVault1 = new PublicKey(poolData.slice(offset, offset + 32));

  const tickSpacing = parsePoolTickSpacing(poolData);

  // Parse active reward infos from pool state
  // reward_infos array is at offset 397 in the pool state (after status + padding)
  // Each RewardInfo structure:
  //   - reward_state (u8, offset 0)
  //   - ... other fields ...
  //   - token_mint (pubkey, offset 57)
  //   - token_vault (pubkey, offset 89)
  // Total size: 169 bytes
  const rewardInfosOffset = 397;
  const rewardInfoSize = 169;
  const rewardStateOffset = 0;
  const tokenMintOffsetInRewardInfo = 57;
  const tokenVaultOffsetInRewardInfo = 89;

  // Collect active rewards (reward_state != 0)
  interface ActiveReward {
    vault: PublicKey;
    mint: PublicKey;
    userAta: PublicKey;
  }
  const activeRewards: ActiveReward[] = [];

  for (let i = 0; i < 3; i++) {
    const rewardOffset = rewardInfosOffset + i * rewardInfoSize;
    const rewardState = poolData.readUInt8(rewardOffset + rewardStateOffset);

    if (rewardState !== 0) {
      // Reward is active
      const mintOffset = rewardOffset + tokenMintOffsetInRewardInfo;
      const vaultOffset = rewardOffset + tokenVaultOffsetInRewardInfo;

      const rewardMint = new PublicKey(poolData.slice(mintOffset, mintOffset + 32));
      const rewardVault = new PublicKey(poolData.slice(vaultOffset, vaultOffset + 32));

      // Get token program for reward mint
      const rewardTokenProgram = await getTokenProgramForMint(solana, rewardMint);

      // Get user's ATA for reward token
      const userRewardAta = getAssociatedTokenAddressSync(rewardMint, walletPubkey, false, rewardTokenProgram);

      activeRewards.push({
        vault: rewardVault,
        mint: rewardMint,
        userAta: userRewardAta,
      });
    }
  }

  // Calculate tick array addresses
  const tickArrayLowerStartIndex = getTickArrayStartIndexFromTick(tickLowerIndex, tickSpacing);
  const tickArrayUpperStartIndex = getTickArrayStartIndexFromTick(tickUpperIndex, tickSpacing);
  const tickArrayLower = getTickArrayAddress(poolId, tickArrayLowerStartIndex);
  const tickArrayUpper = getTickArrayAddress(poolId, tickArrayUpperStartIndex);

  // Derive protocol_position PDA
  // Note: PDA seeds use big-endian encoding for i32 values
  const tickLowerBuffer = Buffer.alloc(4);
  tickLowerBuffer.writeInt32BE(tickLowerIndex, 0);
  const tickUpperBuffer = Buffer.alloc(4);
  tickUpperBuffer.writeInt32BE(tickUpperIndex, 0);

  const [protocolPosition] = PublicKey.findProgramAddressSync(
    [Buffer.from('position'), poolId.toBuffer(), tickLowerBuffer, tickUpperBuffer],
    PANCAKESWAP_CLMM_PROGRAM_ID,
  );

  // Get NFT account (try Token2022 first)
  let nftAccount = getAssociatedTokenAddressSync(positionNftMint, walletPubkey, false, TOKEN_2022_PROGRAM_ID);
  const accountInfo = await solana.connection.getAccountInfo(nftAccount);

  if (!accountInfo) {
    nftAccount = getAssociatedTokenAddressSync(positionNftMint, walletPubkey, false, TOKEN_PROGRAM_ID);
  }

  // Detect token programs for pool mints
  const [tokenProgram0, tokenProgram1] = await Promise.all([
    getTokenProgramForMint(solana, tokenMint0),
    getTokenProgramForMint(solana, tokenMint1),
  ]);

  // Get recipient token accounts with correct token programs
  const recipientTokenAccount0 = getAssociatedTokenAddressSync(tokenMint0, walletPubkey, false, tokenProgram0);
  const recipientTokenAccount1 = getAssociatedTokenAddressSync(tokenMint1, walletPubkey, false, tokenProgram1);

  // Create instruction using Anchor coder
  const coder = new BorshCoder(clmmIdl);
  const instructionData = coder.instruction.encode('decrease_liquidity_v2', {
    liquidity: liquidityToRemove,
    amount_0_min: amount0Min,
    amount_1_min: amount1Min,
  });

  // Build base accounts
  const keys = [
    { pubkey: walletPubkey, isSigner: true, isWritable: false }, // nft_owner
    { pubkey: nftAccount, isSigner: false, isWritable: false }, // nft_account
    { pubkey: personalPosition, isSigner: false, isWritable: true }, // personal_position
    { pubkey: poolId, isSigner: false, isWritable: true }, // pool_state
    { pubkey: protocolPosition, isSigner: false, isWritable: true }, // protocol_position
    { pubkey: tokenVault0, isSigner: false, isWritable: true }, // token_vault_0
    { pubkey: tokenVault1, isSigner: false, isWritable: true }, // token_vault_1
    { pubkey: tickArrayLower, isSigner: false, isWritable: true }, // tick_array_lower
    { pubkey: tickArrayUpper, isSigner: false, isWritable: true }, // tick_array_upper
    { pubkey: recipientTokenAccount0, isSigner: false, isWritable: true }, // recipient_token_account_0
    { pubkey: recipientTokenAccount1, isSigner: false, isWritable: true }, // recipient_token_account_1
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program_2022
    { pubkey: MEMO_PROGRAM_ID, isSigner: false, isWritable: false }, // memo_program
    { pubkey: tokenMint0, isSigner: false, isWritable: false }, // vault_0_mint
    { pubkey: tokenMint1, isSigner: false, isWritable: false }, // vault_1_mint
  ];

  // Add reward accounts for active rewards (remaining accounts)
  // For each active reward, add: reward_vault, user_reward_ata, reward_mint
  for (const reward of activeRewards) {
    keys.push({ pubkey: reward.vault, isSigner: false, isWritable: true }); // reward_vault
    keys.push({ pubkey: reward.userAta, isSigner: false, isWritable: true }); // user_reward_ata
    keys.push({ pubkey: reward.mint, isSigner: false, isWritable: false }); // reward_mint
  }

  return new TransactionInstruction({
    programId: PANCAKESWAP_CLMM_PROGRAM_ID,
    keys,
    data: instructionData,
  });
}

/**
 * Build a complete remove liquidity transaction with compute budget
 */
export async function buildRemoveLiquidityTransaction(
  solana: Solana,
  positionNftMint: PublicKey,
  walletPubkey: PublicKey,
  liquidityToRemove: BN,
  amount0Min: BN,
  amount1Min: BN,
  computeUnits: number = 600000,
  priorityFeePerCU?: number,
): Promise<VersionedTransaction> {
  const removeLiqIx = await buildDecreaseLiquidityV2Instruction(
    solana,
    positionNftMint,
    walletPubkey,
    liquidityToRemove,
    amount0Min,
    amount1Min,
  );

  const instructions: TransactionInstruction[] = [];

  // Add compute budget instructions
  instructions.push(ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }));

  if (priorityFeePerCU !== undefined && priorityFeePerCU > 0) {
    instructions.push(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFeePerCU,
      }),
    );
  }

  // Add remove liquidity instruction
  instructions.push(removeLiqIx);

  // Get recent blockhash
  const { blockhash } = await solana.connection.getLatestBlockhash('confirmed');

  // Build message
  const messageV0 = new TransactionMessage({
    payerKey: walletPubkey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  return new VersionedTransaction(messageV0);
}

/**
 * Build an increase_liquidity_v2 instruction for PancakeSwap Solana CLMM
 * Simplified version: takes token amounts, lets program calculate liquidity
 */
export async function buildIncreaseLiquidityV2Instruction(
  solana: Solana,
  positionNftMint: PublicKey,
  walletPubkey: PublicKey,
  amount0Max: BN,
  amount1Max: BN,
  baseFlag: boolean, // true = base amount_0, false = base amount_1
): Promise<TransactionInstruction> {
  // Get position account to extract pool and ticks
  const [personalPosition] = PublicKey.findProgramAddressSync(
    [Buffer.from('position'), positionNftMint.toBuffer()],
    PANCAKESWAP_CLMM_PROGRAM_ID,
  );

  const positionAccountInfo = await solana.connection.getAccountInfo(personalPosition);
  if (!positionAccountInfo) {
    throw new Error(`Position account not found: ${personalPosition.toString()}`);
  }

  const { poolId, tickLowerIndex, tickUpperIndex } = parsePositionData(positionAccountInfo.data);

  // Get pool account
  const poolAccountInfo = await solana.connection.getAccountInfo(poolId);
  if (!poolAccountInfo) {
    throw new Error(`Pool account not found: ${poolId.toString()}`);
  }

  const poolData = poolAccountInfo.data;

  // Parse pool data
  let offset = 9;
  offset += 64;
  const tokenMint0 = new PublicKey(poolData.slice(offset, offset + 32));
  offset += 32;
  const tokenMint1 = new PublicKey(poolData.slice(offset, offset + 32));
  offset += 32;
  const tokenVault0 = new PublicKey(poolData.slice(offset, offset + 32));
  offset += 32;
  const tokenVault1 = new PublicKey(poolData.slice(offset, offset + 32));

  const tickSpacing = parsePoolTickSpacing(poolData);

  // Calculate tick array addresses
  const tickArrayLowerStartIndex = getTickArrayStartIndexFromTick(tickLowerIndex, tickSpacing);
  const tickArrayUpperStartIndex = getTickArrayStartIndexFromTick(tickUpperIndex, tickSpacing);
  const tickArrayLower = getTickArrayAddress(poolId, tickArrayLowerStartIndex);
  const tickArrayUpper = getTickArrayAddress(poolId, tickArrayUpperStartIndex);

  // Derive protocol_position PDA
  // Note: PDA seeds use big-endian encoding for i32 values
  const tickLowerBuffer = Buffer.alloc(4);
  tickLowerBuffer.writeInt32BE(tickLowerIndex, 0);
  const tickUpperBuffer = Buffer.alloc(4);
  tickUpperBuffer.writeInt32BE(tickUpperIndex, 0);

  const [protocolPosition] = PublicKey.findProgramAddressSync(
    [Buffer.from('position'), poolId.toBuffer(), tickLowerBuffer, tickUpperBuffer],
    PANCAKESWAP_CLMM_PROGRAM_ID,
  );

  // Get NFT account
  let nftAccount = getAssociatedTokenAddressSync(positionNftMint, walletPubkey, false, TOKEN_2022_PROGRAM_ID);
  const accountInfo = await solana.connection.getAccountInfo(nftAccount);

  if (!accountInfo) {
    nftAccount = getAssociatedTokenAddressSync(positionNftMint, walletPubkey, false, TOKEN_PROGRAM_ID);
  }

  // Detect token programs for pool mints
  const [tokenProgram0, tokenProgram1] = await Promise.all([
    getTokenProgramForMint(solana, tokenMint0),
    getTokenProgramForMint(solana, tokenMint1),
  ]);

  // Get user token accounts with correct token programs
  const tokenAccount0 = getAssociatedTokenAddressSync(tokenMint0, walletPubkey, false, tokenProgram0);
  const tokenAccount1 = getAssociatedTokenAddressSync(tokenMint1, walletPubkey, false, tokenProgram1);

  // Create instruction - use liquidity=0 to let program calculate from amounts
  const coder = new BorshCoder(clmmIdl);
  const instructionData = coder.instruction.encode('increase_liquidity_v2', {
    liquidity: new BN(0), // Let program calculate
    amount_0_max: amount0Max,
    amount_1_max: amount1Max,
    base_flag: baseFlag ? { some: true } : { some: false }, // Option<bool> encoding
  });

  return new TransactionInstruction({
    programId: PANCAKESWAP_CLMM_PROGRAM_ID,
    keys: [
      { pubkey: walletPubkey, isSigner: true, isWritable: false }, // nft_owner
      { pubkey: nftAccount, isSigner: false, isWritable: false }, // nft_account
      { pubkey: poolId, isSigner: false, isWritable: true }, // pool_state
      { pubkey: protocolPosition, isSigner: false, isWritable: true }, // protocol_position
      { pubkey: personalPosition, isSigner: false, isWritable: true }, // personal_position
      { pubkey: tickArrayLower, isSigner: false, isWritable: true }, // tick_array_lower
      { pubkey: tickArrayUpper, isSigner: false, isWritable: true }, // tick_array_upper
      { pubkey: tokenAccount0, isSigner: false, isWritable: true }, // token_account_0
      { pubkey: tokenAccount1, isSigner: false, isWritable: true }, // token_account_1
      { pubkey: tokenVault0, isSigner: false, isWritable: true }, // token_vault_0
      { pubkey: tokenVault1, isSigner: false, isWritable: true }, // token_vault_1
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program_2022
      { pubkey: tokenMint0, isSigner: false, isWritable: false }, // vault_0_mint
      { pubkey: tokenMint1, isSigner: false, isWritable: false }, // vault_1_mint
    ],
    data: instructionData,
  });
}

/**
 * Build a complete add liquidity transaction with compute budget
 */
export async function buildAddLiquidityTransaction(
  solana: Solana,
  positionNftMint: PublicKey,
  walletPubkey: PublicKey,
  amount0Max: BN,
  amount1Max: BN,
  baseFlag: boolean,
  computeUnits: number = 600000,
  priorityFeePerCU?: number,
): Promise<VersionedTransaction> {
  const addLiqIx = await buildIncreaseLiquidityV2Instruction(
    solana,
    positionNftMint,
    walletPubkey,
    amount0Max,
    amount1Max,
    baseFlag,
  );

  const instructions: TransactionInstruction[] = [];

  instructions.push(ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }));

  if (priorityFeePerCU !== undefined && priorityFeePerCU > 0) {
    instructions.push(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFeePerCU,
      }),
    );
  }

  instructions.push(addLiqIx);

  const { blockhash } = await solana.connection.getLatestBlockhash('confirmed');

  const messageV0 = new TransactionMessage({
    payerKey: walletPubkey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  return new VersionedTransaction(messageV0);
}

/**
 * Build open_position_with_token22_nft instruction
 * Creates a new position with Token2022 NFT and optional metadata
 */
export async function buildOpenPositionWithToken22NftInstruction(
  solana: Solana,
  poolAddress: PublicKey,
  walletPubkey: PublicKey,
  positionNftMint: Keypair, // New keypair for NFT mint
  tickLowerIndex: number,
  tickUpperIndex: number,
  amount0Max: BN,
  amount1Max: BN,
  withMetadata: boolean,
  baseFlag: boolean,
): Promise<TransactionInstruction> {
  // Get pool data
  const poolAccountInfo = await solana.connection.getAccountInfo(poolAddress);
  if (!poolAccountInfo) {
    throw new Error(`Pool not found: ${poolAddress.toString()}`);
  }

  const poolData = poolAccountInfo.data;

  // Parse pool data
  let offset = 9;
  offset += 64; // Skip amm_config + owner
  const tokenMint0 = new PublicKey(poolData.slice(offset, offset + 32));
  offset += 32;
  const tokenMint1 = new PublicKey(poolData.slice(offset, offset + 32));
  offset += 32;
  const tokenVault0 = new PublicKey(poolData.slice(offset, offset + 32));
  offset += 32;
  const tokenVault1 = new PublicKey(poolData.slice(offset, offset + 32));

  const tickSpacing = parsePoolTickSpacing(poolData);

  // Calculate tick array start indices
  const tickArrayLowerStartIndex = getTickArrayStartIndexFromTick(tickLowerIndex, tickSpacing);
  const tickArrayUpperStartIndex = getTickArrayStartIndexFromTick(tickUpperIndex, tickSpacing);

  // Derive PDAs
  // Note: PDA seeds use big-endian encoding for i32 values
  const tickLowerBuffer = Buffer.alloc(4);
  tickLowerBuffer.writeInt32BE(tickLowerIndex, 0);
  const tickUpperBuffer = Buffer.alloc(4);
  tickUpperBuffer.writeInt32BE(tickUpperIndex, 0);

  const [protocolPosition] = PublicKey.findProgramAddressSync(
    [Buffer.from('position'), poolAddress.toBuffer(), tickLowerBuffer, tickUpperBuffer],
    PANCAKESWAP_CLMM_PROGRAM_ID,
  );

  const tickArrayLower = getTickArrayAddress(poolAddress, tickArrayLowerStartIndex);
  const tickArrayUpper = getTickArrayAddress(poolAddress, tickArrayUpperStartIndex);

  const [personalPosition] = PublicKey.findProgramAddressSync(
    [Buffer.from('position'), positionNftMint.publicKey.toBuffer()],
    PANCAKESWAP_CLMM_PROGRAM_ID,
  );

  // Get position NFT account (ATA with Token2022)
  const positionNftAccount = getAssociatedTokenAddressSync(
    positionNftMint.publicKey,
    walletPubkey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  // Detect token programs for pool mints (like we do for swap)
  const [tokenProgram0, tokenProgram1] = await Promise.all([
    getTokenProgramForMint(solana, tokenMint0),
    getTokenProgramForMint(solana, tokenMint1),
  ]);

  // Get user token accounts with correct token programs
  const tokenAccount0 = getAssociatedTokenAddressSync(tokenMint0, walletPubkey, false, tokenProgram0);
  const tokenAccount1 = getAssociatedTokenAddressSync(tokenMint1, walletPubkey, false, tokenProgram1);

  // Log all instruction parameters
  const { logger } = await import('../../services/logger');
  logger.info(`=== OpenPosition Instruction Parameters ===`);
  logger.info(`Pool: ${poolAddress.toString()}`);
  logger.info(`Pool tokens: mint0=${tokenMint0.toString()}, mint1=${tokenMint1.toString()}`);
  logger.info(`Token programs: token0=${tokenProgram0.toString()}, token1=${tokenProgram1.toString()}`);
  logger.info(`Token accounts: token0=${tokenAccount0.toString()}, token1=${tokenAccount1.toString()}`);
  logger.info(`NFT Mint: ${positionNftMint.publicKey.toString()}`);
  logger.info(`NFT Account: ${positionNftAccount.toString()}`);
  logger.info(`Tick Lower: ${tickLowerIndex}, Tick Upper: ${tickUpperIndex}`);
  logger.info(`Tick Spacing: ${tickSpacing}`);
  logger.info(`Tick Array Lower Start: ${tickArrayLowerStartIndex}`);
  logger.info(`Tick Array Upper Start: ${tickArrayUpperStartIndex}`);
  logger.info(`Tick Array Lower: ${tickArrayLower.toString()}`);
  logger.info(`Tick Array Upper: ${tickArrayUpper.toString()}`);
  logger.info(`Protocol Position: ${protocolPosition.toString()}`);
  logger.info(`Personal Position: ${personalPosition.toString()}`);
  logger.info(`Amount0 Max: ${amount0Max.toString()}`);
  logger.info(`Amount1 Max: ${amount1Max.toString()}`);
  logger.info(`Base Flag: ${baseFlag}`);
  logger.info(`With Metadata: ${withMetadata}`);

  // Create instruction
  const coder = new BorshCoder(clmmIdl);
  const instructionData = coder.instruction.encode('open_position_with_token22_nft', {
    tick_lower_index: tickLowerIndex,
    tick_upper_index: tickUpperIndex,
    tick_array_lower_start_index: tickArrayLowerStartIndex,
    tick_array_upper_start_index: tickArrayUpperStartIndex,
    liquidity: new BN(0), // Let program calculate from amounts
    amount_0_max: amount0Max,
    amount_1_max: amount1Max,
    with_metadata: withMetadata,
    base_flag: baseFlag ? { some: true } : { some: false },
  });

  logger.info(`Instruction Data (hex): ${instructionData.toString('hex')}`);

  return new TransactionInstruction({
    programId: PANCAKESWAP_CLMM_PROGRAM_ID,
    keys: [
      { pubkey: walletPubkey, isSigner: true, isWritable: true }, // payer
      { pubkey: walletPubkey, isSigner: false, isWritable: false }, // position_nft_owner
      { pubkey: positionNftMint.publicKey, isSigner: true, isWritable: true }, // position_nft_mint
      { pubkey: positionNftAccount, isSigner: false, isWritable: true }, // position_nft_account
      { pubkey: poolAddress, isSigner: false, isWritable: true }, // pool_state
      { pubkey: protocolPosition, isSigner: false, isWritable: true }, // protocol_position
      { pubkey: tickArrayLower, isSigner: false, isWritable: true }, // tick_array_lower
      { pubkey: tickArrayUpper, isSigner: false, isWritable: true }, // tick_array_upper
      { pubkey: personalPosition, isSigner: false, isWritable: true }, // personal_position
      { pubkey: tokenAccount0, isSigner: false, isWritable: true }, // token_account_0
      { pubkey: tokenAccount1, isSigner: false, isWritable: true }, // token_account_1
      { pubkey: tokenVault0, isSigner: false, isWritable: true }, // token_vault_0
      { pubkey: tokenVault1, isSigner: false, isWritable: true }, // token_vault_1
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }, // rent
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // associated_token_program
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program_2022
      { pubkey: tokenMint0, isSigner: false, isWritable: false }, // vault_0_mint
      { pubkey: tokenMint1, isSigner: false, isWritable: false }, // vault_1_mint
    ],
    data: instructionData,
  });
}

/**
 * Build complete open position transaction
 * Returns both the transaction and the position NFT mint keypair
 */
export async function buildOpenPositionTransaction(
  solana: Solana,
  poolAddress: PublicKey,
  walletPubkey: PublicKey,
  tickLowerIndex: number,
  tickUpperIndex: number,
  amount0Max: BN,
  amount1Max: BN,
  withMetadata: boolean,
  baseFlag: boolean,
  computeUnits: number = 800000,
  priorityFeePerCU?: number,
): Promise<{ transaction: VersionedTransaction; positionNftMint: Keypair }> {
  // Generate new keypair for NFT mint
  const positionNftMint = Keypair.generate();

  const openPositionIx = await buildOpenPositionWithToken22NftInstruction(
    solana,
    poolAddress,
    walletPubkey,
    positionNftMint,
    tickLowerIndex,
    tickUpperIndex,
    amount0Max,
    amount1Max,
    withMetadata,
    baseFlag,
  );

  const instructions: TransactionInstruction[] = [];

  instructions.push(ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }));

  if (priorityFeePerCU !== undefined && priorityFeePerCU > 0) {
    instructions.push(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFeePerCU,
      }),
    );
  }

  instructions.push(openPositionIx);

  const { blockhash } = await solana.connection.getLatestBlockhash('confirmed');

  const messageV0 = new TransactionMessage({
    payerKey: walletPubkey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  const transaction = new VersionedTransaction(messageV0);

  return { transaction, positionNftMint };
}
