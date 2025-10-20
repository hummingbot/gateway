import { BorshCoder, Idl } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  ComputeBudgetProgram,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import BN from 'bn.js';

import { Solana } from '../../chains/solana/solana';

import { PANCAKESWAP_CLMM_PROGRAM_ID } from './pancakeswap-sol';

const clmmIdl = require('./idl/clmm.json') as Idl;

// Memo program
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

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

  // Decode pool data to get amm_config, vaults, and observation_state addresses
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

  // Determine which vault is input/output based on mints
  const inputVault = inputMint.equals(tokenMint0) ? tokenVault0 : tokenVault1;
  const outputVault = outputMint.equals(tokenMint0) ? tokenVault0 : tokenVault1;

  // Get user token accounts (try both SPL Token and Token2022)
  // For now, assume SPL Token - can be enhanced to check token program
  const inputTokenAccount = getAssociatedTokenAddressSync(inputMint, walletPubkey, false, TOKEN_PROGRAM_ID);
  const outputTokenAccount = getAssociatedTokenAddressSync(outputMint, walletPubkey, false, TOKEN_PROGRAM_ID);

  // Create instruction using Anchor coder
  const coder = new BorshCoder(clmmIdl);

  const instructionData = coder.instruction.encode('swap_v2', {
    amount,
    otherAmountThreshold,
    sqrtPriceLimitX64,
    isBaseInput,
  });

  return new TransactionInstruction({
    programId: PANCAKESWAP_CLMM_PROGRAM_ID,
    keys: [
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
    ],
    data: instructionData,
  });
}

/**
 * Build a complete swap transaction with compute budget
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

  // Add swap instruction
  instructions.push(swapIx);

  // Get recent blockhash
  const { blockhash, lastValidBlockHeight } = await solana.connection.getLatestBlockhash('confirmed');

  // Build message
  const messageV0 = new TransactionMessage({
    payerKey: walletPubkey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  return new VersionedTransaction(messageV0);
}
