import { BorshCoder, Idl } from '@coral-xyz/anchor';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { PublicKey, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import BN from 'bn.js';

import { Solana } from '../../chains/solana/solana';

import pumpswapIdl from './idl.json';
import { PUMPSWAP_PROGRAM_ID } from './pumpswap';

const idl = pumpswapIdl as Idl;

/**
 * Derive global config PDA
 */
export function getGlobalConfigPDA(): PublicKey {
  const [globalConfig] = PublicKey.findProgramAddressSync([Buffer.from('global_config')], PUMPSWAP_PROGRAM_ID);
  return globalConfig;
}

/**
 * Derive event authority PDA
 */
export function getEventAuthorityPDA(): PublicKey {
  const [eventAuthority] = PublicKey.findProgramAddressSync([Buffer.from('__event_authority')], PUMPSWAP_PROGRAM_ID);
  return eventAuthority;
}

/**
 * Derive coin creator vault authority PDA
 */
export function getCoinCreatorVaultAuthorityPDA(coinCreator: PublicKey): PublicKey {
  const [vaultAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from('creator_vault'), coinCreator.toBuffer()],
    PUMPSWAP_PROGRAM_ID,
  );
  return vaultAuthority;
}

/**
 * Derive coin creator vault ATA
 */
export function getCoinCreatorVaultATA(coinCreator: PublicKey, quoteMint: PublicKey): PublicKey {
  const vaultAuthority = getCoinCreatorVaultAuthorityPDA(coinCreator);
  return getAssociatedTokenAddressSync(quoteMint, vaultAuthority, true);
}

/**
 * Derive protocol fee recipient token account
 */
export function getProtocolFeeRecipientTokenAccount(protocolFeeRecipient: PublicKey, quoteMint: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(quoteMint, protocolFeeRecipient, true);
}

/**
 * Derive fee config PDA
 */
export function getFeeConfigPDA(): PublicKey {
  const feeProgramId = new PublicKey('pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ');
  const feeConfigSeed = Buffer.from([
    12, 20, 222, 252, 130, 94, 198, 118, 148, 37, 8, 24, 187, 101, 64, 101, 244, 41, 141, 49, 86, 213, 113, 180, 212,
    248, 9, 12, 24, 233, 168, 99,
  ]);
  const [feeConfig] = PublicKey.findProgramAddressSync([Buffer.from('fee_config'), feeConfigSeed], feeProgramId);
  return feeConfig;
}

/**
 * Get token program for a mint (detect Token vs Token2022)
 */
export async function getTokenProgramForMint(solana: Solana, mint: PublicKey): Promise<PublicKey> {
  const mintInfo = await solana.connection.getAccountInfo(mint);
  if (!mintInfo) {
    throw new Error(`Mint not found: ${mint.toString()}`);
  }
  // Check if it's Token2022 by checking the owner
  if (mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    return TOKEN_2022_PROGRAM_ID;
  }
  return TOKEN_PROGRAM_ID;
}

/**
 * Build buy instruction (exact output)
 */
export async function buildBuyInstruction(
  solana: Solana,
  poolAddress: PublicKey,
  walletPubkey: PublicKey,
  baseAmountOut: BN,
  maxQuoteAmountIn: BN,
  trackVolume: boolean = true,
): Promise<TransactionInstruction> {
  // Get pool account data
  const poolAccountInfo = await solana.connection.getAccountInfo(poolAddress);
  if (!poolAccountInfo) {
    throw new Error(`Pool not found: ${poolAddress.toString()}`);
  }

  const poolData = poolAccountInfo.data;

  // Decode Pool struct
  // Offset 0-7: discriminator (8 bytes)
  // Offset 8: pool_bump (1 byte)
  // Offset 9-10: index (2 bytes, u16)
  // Offset 11-42: creator (32 bytes)
  // Offset 43-74: base_mint (32 bytes)
  // Offset 75-106: quote_mint (32 bytes)
  // Offset 107-138: lp_mint (32 bytes)
  // Offset 139-170: pool_base_token_account (32 bytes)
  // Offset 171-202: pool_quote_token_account (32 bytes)
  // Offset 203-210: lp_supply (8 bytes, u64)
  // Offset 211-242: coin_creator (32 bytes)

  let offset = 11; // Skip discriminator + bump + index
  const creator = new PublicKey(poolData.slice(offset, offset + 32));
  offset += 32;
  const baseMint = new PublicKey(poolData.slice(offset, offset + 32));
  offset += 32;
  const quoteMint = new PublicKey(poolData.slice(offset, offset + 32));
  offset += 32;
  offset += 32; // Skip lp_mint
  const poolBaseTokenAccount = new PublicKey(poolData.slice(offset, offset + 32));
  offset += 32;
  const poolQuoteTokenAccount = new PublicKey(poolData.slice(offset, offset + 32));
  offset += 32;
  offset += 8; // Skip lp_supply
  const coinCreator = new PublicKey(poolData.slice(offset, offset + 32));

  // Get global config
  const globalConfig = getGlobalConfigPDA();

  // Get token programs
  const baseTokenProgram = await getTokenProgramForMint(solana, baseMint);
  const quoteTokenProgram = await getTokenProgramForMint(solana, quoteMint);

  // Get user token accounts
  const userBaseTokenAccount = getAssociatedTokenAddressSync(baseMint, walletPubkey, false, baseTokenProgram);
  const userQuoteTokenAccount = getAssociatedTokenAddressSync(quoteMint, walletPubkey, false, quoteTokenProgram);

  // Get protocol fee recipient (first one from global config)
  // For now, we'll need to fetch global config to get the recipient
  // This is a simplified version - you may need to fetch global config
  const globalConfigAccount = await solana.connection.getAccountInfo(globalConfig);
  let protocolFeeRecipient = PublicKey.default;
  if (globalConfigAccount) {
    // protocol_fee_recipients is at offset 33 (after admin + fees)
    // It's an array of 8 pubkeys
    protocolFeeRecipient = new PublicKey(globalConfigAccount.data.slice(33, 65));
  }

  const protocolFeeRecipientTokenAccount = getProtocolFeeRecipientTokenAccount(protocolFeeRecipient, quoteMint);
  const coinCreatorVaultAuthority = getCoinCreatorVaultAuthorityPDA(coinCreator);
  const coinCreatorVaultATA = getCoinCreatorVaultATA(coinCreator, quoteMint);
  const eventAuthority = getEventAuthorityPDA();
  const feeConfig = getFeeConfigPDA();
  const feeProgram = new PublicKey('pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ');

  // Derive global volume accumulator
  const [globalVolumeAccumulator] = PublicKey.findProgramAddressSync(
    [Buffer.from('global_volume_accumulator')],
    PUMPSWAP_PROGRAM_ID,
  );

  // Derive user volume accumulator
  const [userVolumeAccumulator] = PublicKey.findProgramAddressSync(
    [Buffer.from('user_volume_accumulator'), walletPubkey.toBuffer()],
    PUMPSWAP_PROGRAM_ID,
  );

  // Encode instruction
  const coder = new BorshCoder(idl);
  // OptionBool encoding: { some: true } for true, { some: false } for false
  const trackVolumeOption = trackVolume ? { some: true } : { some: false };
  const instructionData = coder.instruction.encode('buy', {
    base_amount_out: baseAmountOut,
    max_quote_amount_in: maxQuoteAmountIn,
    track_volume: trackVolumeOption,
  });

  return new TransactionInstruction({
    programId: PUMPSWAP_PROGRAM_ID,
    keys: [
      { pubkey: poolAddress, isSigner: false, isWritable: false }, // pool
      { pubkey: walletPubkey, isSigner: true, isWritable: true }, // user
      { pubkey: globalConfig, isSigner: false, isWritable: false }, // global_config
      { pubkey: baseMint, isSigner: false, isWritable: false }, // base_mint
      { pubkey: quoteMint, isSigner: false, isWritable: false }, // quote_mint
      { pubkey: userBaseTokenAccount, isSigner: false, isWritable: true }, // user_base_token_account
      { pubkey: userQuoteTokenAccount, isSigner: false, isWritable: true }, // user_quote_token_account
      { pubkey: poolBaseTokenAccount, isSigner: false, isWritable: true }, // pool_base_token_account
      { pubkey: poolQuoteTokenAccount, isSigner: false, isWritable: true }, // pool_quote_token_account
      { pubkey: protocolFeeRecipient, isSigner: false, isWritable: false }, // protocol_fee_recipient
      { pubkey: protocolFeeRecipientTokenAccount, isSigner: false, isWritable: true }, // protocol_fee_recipient_token_account
      { pubkey: baseTokenProgram, isSigner: false, isWritable: false }, // base_token_program
      { pubkey: quoteTokenProgram, isSigner: false, isWritable: false }, // quote_token_program
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // associated_token_program
      { pubkey: eventAuthority, isSigner: false, isWritable: false }, // event_authority
      { pubkey: coinCreatorVaultATA, isSigner: false, isWritable: true }, // coin_creator_vault_ata
      { pubkey: coinCreatorVaultAuthority, isSigner: false, isWritable: false }, // coin_creator_vault_authority
      { pubkey: globalVolumeAccumulator, isSigner: false, isWritable: true }, // global_volume_accumulator
      { pubkey: userVolumeAccumulator, isSigner: false, isWritable: true }, // user_volume_accumulator
      { pubkey: feeConfig, isSigner: false, isWritable: false }, // fee_config
      { pubkey: feeProgram, isSigner: false, isWritable: false }, // fee_program
    ],
    data: instructionData,
  });
}

/**
 * Build sell instruction (exact input)
 */
export async function buildSellInstruction(
  solana: Solana,
  poolAddress: PublicKey,
  walletPubkey: PublicKey,
  baseAmountIn: BN,
  minQuoteAmountOut: BN,
): Promise<TransactionInstruction> {
  // Get pool account data (same as buy)
  const poolAccountInfo = await solana.connection.getAccountInfo(poolAddress);
  if (!poolAccountInfo) {
    throw new Error(`Pool not found: ${poolAddress.toString()}`);
  }

  const poolData = poolAccountInfo.data;

  let offset = 11;
  offset += 32; // Skip creator
  const baseMint = new PublicKey(poolData.slice(offset, offset + 32));
  offset += 32;
  const quoteMint = new PublicKey(poolData.slice(offset, offset + 32));
  offset += 32;
  offset += 32; // Skip lp_mint
  const poolBaseTokenAccount = new PublicKey(poolData.slice(offset, offset + 32));
  offset += 32;
  const poolQuoteTokenAccount = new PublicKey(poolData.slice(offset, offset + 32));
  offset += 32;
  offset += 8; // Skip lp_supply
  const coinCreator = new PublicKey(poolData.slice(offset, offset + 32));

  const globalConfig = getGlobalConfigPDA();
  const baseTokenProgram = await getTokenProgramForMint(solana, baseMint);
  const quoteTokenProgram = await getTokenProgramForMint(solana, quoteMint);

  const userBaseTokenAccount = getAssociatedTokenAddressSync(baseMint, walletPubkey, false, baseTokenProgram);
  const userQuoteTokenAccount = getAssociatedTokenAddressSync(quoteMint, walletPubkey, false, quoteTokenProgram);

  const globalConfigAccount = await solana.connection.getAccountInfo(globalConfig);
  let protocolFeeRecipient = PublicKey.default;
  if (globalConfigAccount) {
    protocolFeeRecipient = new PublicKey(globalConfigAccount.data.slice(33, 65));
  }

  const protocolFeeRecipientTokenAccount = getProtocolFeeRecipientTokenAccount(protocolFeeRecipient, quoteMint);
  const coinCreatorVaultAuthority = getCoinCreatorVaultAuthorityPDA(coinCreator);
  const coinCreatorVaultATA = getCoinCreatorVaultATA(coinCreator, quoteMint);
  const eventAuthority = getEventAuthorityPDA();
  const feeConfig = getFeeConfigPDA();
  const feeProgram = new PublicKey('pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ');

  const coder = new BorshCoder(idl);
  const instructionData = coder.instruction.encode('sell', {
    base_amount_in: baseAmountIn,
    min_quote_amount_out: minQuoteAmountOut,
  });

  return new TransactionInstruction({
    programId: PUMPSWAP_PROGRAM_ID,
    keys: [
      { pubkey: poolAddress, isSigner: false, isWritable: false }, // pool
      { pubkey: walletPubkey, isSigner: true, isWritable: true }, // user
      { pubkey: globalConfig, isSigner: false, isWritable: false }, // global_config
      { pubkey: baseMint, isSigner: false, isWritable: false }, // base_mint
      { pubkey: quoteMint, isSigner: false, isWritable: false }, // quote_mint
      { pubkey: userBaseTokenAccount, isSigner: false, isWritable: true }, // user_base_token_account
      { pubkey: userQuoteTokenAccount, isSigner: false, isWritable: true }, // user_quote_token_account
      { pubkey: poolBaseTokenAccount, isSigner: false, isWritable: true }, // pool_base_token_account
      { pubkey: poolQuoteTokenAccount, isSigner: false, isWritable: true }, // pool_quote_token_account
      { pubkey: protocolFeeRecipient, isSigner: false, isWritable: false }, // protocol_fee_recipient
      { pubkey: protocolFeeRecipientTokenAccount, isSigner: false, isWritable: true }, // protocol_fee_recipient_token_account
      { pubkey: baseTokenProgram, isSigner: false, isWritable: false }, // base_token_program
      { pubkey: quoteTokenProgram, isSigner: false, isWritable: false }, // quote_token_program
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // associated_token_program
      { pubkey: eventAuthority, isSigner: false, isWritable: false }, // event_authority
      { pubkey: coinCreatorVaultATA, isSigner: false, isWritable: true }, // coin_creator_vault_ata
      { pubkey: coinCreatorVaultAuthority, isSigner: false, isWritable: false }, // coin_creator_vault_authority
      { pubkey: feeConfig, isSigner: false, isWritable: false }, // fee_config
      { pubkey: feeProgram, isSigner: false, isWritable: false }, // fee_program
    ],
    data: instructionData,
  });
}

/**
 * Build deposit (add liquidity) instruction
 */
export async function buildDepositInstruction(
  solana: Solana,
  poolAddress: PublicKey,
  walletPubkey: PublicKey,
  lpTokenAmountOut: BN,
  maxBaseAmountIn: BN,
  maxQuoteAmountIn: BN,
): Promise<TransactionInstruction> {
  const poolAccountInfo = await solana.connection.getAccountInfo(poolAddress);
  if (!poolAccountInfo) {
    throw new Error(`Pool not found: ${poolAddress.toString()}`);
  }

  const poolData = poolAccountInfo.data;

  let offset = 11;
  offset += 32; // Skip creator
  const baseMint = new PublicKey(poolData.slice(offset, offset + 32));
  offset += 32;
  const quoteMint = new PublicKey(poolData.slice(offset, offset + 32));
  offset += 32;
  const lpMint = new PublicKey(poolData.slice(offset, offset + 32));
  offset += 32;
  const poolBaseTokenAccount = new PublicKey(poolData.slice(offset, offset + 32));
  offset += 32;
  const poolQuoteTokenAccount = new PublicKey(poolData.slice(offset, offset + 32));

  const globalConfig = getGlobalConfigPDA();
  const tokenProgram = await getTokenProgramForMint(solana, lpMint);

  const userBaseTokenAccount = getAssociatedTokenAddressSync(baseMint, walletPubkey, false, TOKEN_PROGRAM_ID);
  const userQuoteTokenAccount = getAssociatedTokenAddressSync(quoteMint, walletPubkey, false, TOKEN_PROGRAM_ID);
  const userPoolTokenAccount = getAssociatedTokenAddressSync(lpMint, walletPubkey, false, tokenProgram);

  const eventAuthority = getEventAuthorityPDA();

  const coder = new BorshCoder(idl);
  const instructionData = coder.instruction.encode('deposit', {
    lp_token_amount_out: lpTokenAmountOut,
    max_base_amount_in: maxBaseAmountIn,
    max_quote_amount_in: maxQuoteAmountIn,
  });

  return new TransactionInstruction({
    programId: PUMPSWAP_PROGRAM_ID,
    keys: [
      { pubkey: poolAddress, isSigner: false, isWritable: true }, // pool
      { pubkey: globalConfig, isSigner: false, isWritable: false }, // global_config
      { pubkey: walletPubkey, isSigner: true, isWritable: false }, // user
      { pubkey: baseMint, isSigner: false, isWritable: false }, // base_mint
      { pubkey: quoteMint, isSigner: false, isWritable: false }, // quote_mint
      { pubkey: lpMint, isSigner: false, isWritable: true }, // lp_mint
      { pubkey: userBaseTokenAccount, isSigner: false, isWritable: true }, // user_base_token_account
      { pubkey: userQuoteTokenAccount, isSigner: false, isWritable: true }, // user_quote_token_account
      { pubkey: userPoolTokenAccount, isSigner: false, isWritable: true }, // user_pool_token_account
      { pubkey: poolBaseTokenAccount, isSigner: false, isWritable: true }, // pool_base_token_account
      { pubkey: poolQuoteTokenAccount, isSigner: false, isWritable: true }, // pool_quote_token_account
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false }, // token_2022_program
      { pubkey: eventAuthority, isSigner: false, isWritable: false }, // event_authority
    ],
    data: instructionData,
  });
}

/**
 * Build withdraw (remove liquidity) instruction
 */
export async function buildWithdrawInstruction(
  solana: Solana,
  poolAddress: PublicKey,
  walletPubkey: PublicKey,
  lpTokenAmountIn: BN,
  minBaseAmountOut: BN,
  minQuoteAmountOut: BN,
): Promise<TransactionInstruction> {
  const poolAccountInfo = await solana.connection.getAccountInfo(poolAddress);
  if (!poolAccountInfo) {
    throw new Error(`Pool not found: ${poolAddress.toString()}`);
  }

  const poolData = poolAccountInfo.data;

  let offset = 11;
  offset += 32; // Skip creator
  const baseMint = new PublicKey(poolData.slice(offset, offset + 32));
  offset += 32;
  const quoteMint = new PublicKey(poolData.slice(offset, offset + 32));
  offset += 32;
  const lpMint = new PublicKey(poolData.slice(offset, offset + 32));
  offset += 32;
  const poolBaseTokenAccount = new PublicKey(poolData.slice(offset, offset + 32));
  offset += 32;
  const poolQuoteTokenAccount = new PublicKey(poolData.slice(offset, offset + 32));

  const globalConfig = getGlobalConfigPDA();
  const tokenProgram = await getTokenProgramForMint(solana, lpMint);

  const userBaseTokenAccount = getAssociatedTokenAddressSync(baseMint, walletPubkey, false, TOKEN_PROGRAM_ID);
  const userQuoteTokenAccount = getAssociatedTokenAddressSync(quoteMint, walletPubkey, false, TOKEN_PROGRAM_ID);
  const userPoolTokenAccount = getAssociatedTokenAddressSync(lpMint, walletPubkey, false, tokenProgram);

  const eventAuthority = getEventAuthorityPDA();

  const coder = new BorshCoder(idl);
  const instructionData = coder.instruction.encode('withdraw', {
    lp_token_amount_in: lpTokenAmountIn,
    min_base_amount_out: minBaseAmountOut,
    min_quote_amount_out: minQuoteAmountOut,
  });

  return new TransactionInstruction({
    programId: PUMPSWAP_PROGRAM_ID,
    keys: [
      { pubkey: poolAddress, isSigner: false, isWritable: true }, // pool
      { pubkey: globalConfig, isSigner: false, isWritable: false }, // global_config
      { pubkey: walletPubkey, isSigner: true, isWritable: false }, // user
      { pubkey: baseMint, isSigner: false, isWritable: false }, // base_mint
      { pubkey: quoteMint, isSigner: false, isWritable: false }, // quote_mint
      { pubkey: lpMint, isSigner: false, isWritable: true }, // lp_mint
      { pubkey: userBaseTokenAccount, isSigner: false, isWritable: true }, // user_base_token_account
      { pubkey: userQuoteTokenAccount, isSigner: false, isWritable: true }, // user_quote_token_account
      { pubkey: userPoolTokenAccount, isSigner: false, isWritable: true }, // user_pool_token_account
      { pubkey: poolBaseTokenAccount, isSigner: false, isWritable: true }, // pool_base_token_account
      { pubkey: poolQuoteTokenAccount, isSigner: false, isWritable: true }, // pool_quote_token_account
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false }, // token_2022_program
      { pubkey: eventAuthority, isSigner: false, isWritable: false }, // event_authority
    ],
    data: instructionData,
  });
}
