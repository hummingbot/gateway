import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  NATIVE_MINT,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import {
  PublicKey,
  TransactionInstruction,
  ComputeBudgetProgram,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import BN from 'bn.js';

import { Solana } from '../../chains/solana/solana';

import { buildBuyInstruction, buildSellInstruction } from './pumpswap.instructions';

/**
 * Build swap transaction
 */
export async function buildSwapTransaction(
  solana: Solana,
  poolAddress: string,
  walletPubkey: PublicKey,
  inputMint: PublicKey,
  outputMint: PublicKey,
  amountIn: BN,
  minAmountOut: BN,
  isBaseInput: boolean,
  computeUnits: number = 300000,
  priorityFeePerCU?: number,
): Promise<VersionedTransaction> {
  const poolPubkey = new PublicKey(poolAddress);
  const instructions: TransactionInstruction[] = [];

  // Add compute budget instructions
  if (priorityFeePerCU) {
    instructions.push(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFeePerCU,
      }),
    );
  }
  instructions.push(
    ComputeBudgetProgram.setComputeUnitLimit({
      units: computeUnits,
    }),
  );

  // Get token programs - need to detect Token vs Token2022
  const inputMintInfo = await solana.connection.getAccountInfo(inputMint);
  const outputMintInfo = await solana.connection.getAccountInfo(outputMint);
  const inputTokenProgram = inputMintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID)
    ? TOKEN_2022_PROGRAM_ID
    : TOKEN_PROGRAM_ID;
  const outputTokenProgram = outputMintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID)
    ? TOKEN_2022_PROGRAM_ID
    : TOKEN_PROGRAM_ID;

  // Get token accounts
  const inputTokenAccount = getAssociatedTokenAddressSync(inputMint, walletPubkey, false, inputTokenProgram);
  const outputTokenAccount = getAssociatedTokenAddressSync(outputMint, walletPubkey, false, outputTokenProgram);

  // Check if accounts exist
  const inputAccountInfo = await solana.connection.getAccountInfo(inputTokenAccount);
  const outputAccountInfo = await solana.connection.getAccountInfo(outputTokenAccount);

  // Track if we're using WSOL (to handle wrapping/unwrapping)
  const isInputSOL = inputMint.equals(NATIVE_MINT);
  const isOutputSOL = outputMint.equals(NATIVE_MINT);

  // Handle input token account
  if (isInputSOL) {
    // If input is native SOL, wrap it using Solana's wrapSOL method
    // This also handles ATA creation if needed
    const wrapInstructions = await solana.wrapSOL(walletPubkey, amountIn.toNumber(), inputTokenProgram);
    instructions.push(...wrapInstructions);
  } else if (!inputAccountInfo) {
    // Create input token account if needed (for non-SOL tokens)
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

  // Handle output token account
  if (isOutputSOL) {
    // If output is native SOL, create the WSOL account if needed
    // It will be unwrapped after the swap
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
  } else if (!outputAccountInfo) {
    // Create output token account if needed (for non-SOL tokens)
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

  // Build swap instruction
  if (isBaseInput) {
    // Selling base (SELL) - use sell instruction
    const sellIx = await buildSellInstruction(solana, poolPubkey, walletPubkey, amountIn, minAmountOut);
    instructions.push(sellIx);
  } else {
    // Buying base (BUY) - use buy instruction
    const buyIx = await buildBuyInstruction(solana, poolPubkey, walletPubkey, minAmountOut, amountIn, true);
    instructions.push(buyIx);
  }

  // If output is native SOL, unwrap WSOL back to SOL
  if (isOutputSOL) {
    const unwrapIx = solana.unwrapSOL(walletPubkey, outputTokenProgram);
    instructions.push(unwrapIx);
  }

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
