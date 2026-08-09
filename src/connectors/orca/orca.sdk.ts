import { WhirlpoolDeployment } from '@orca-so/whirlpools';
import { address, createNoopSigner, type Instruction, type TransactionSigner } from '@solana/kit';
import { PublicKey, Transaction } from '@solana/web3.js';

import { kitInstructionToWeb3 } from '../../chains/solana/kit-instructions';

export const getOrcaDeployment = (network: string): WhirlpoolDeployment =>
  network === 'mainnet-beta' ? WhirlpoolDeployment.mainnet : WhirlpoolDeployment.devnet;

export const createOrcaAuthority = (walletAddress: string): TransactionSigner<string> =>
  createNoopSigner(address(walletAddress));

/**
 * Convert Orca's Kit instructions into the Web3.js transaction shape accepted
 * by Solana.sendAndConfirmTransactionForWallet. Wallet signing remains entirely
 * in the Solana layer.
 */
export const buildOrcaTransaction = (instructions: readonly Instruction[], walletAddress: string): Transaction => {
  const transaction = new Transaction();
  transaction.add(...instructions.map(kitInstructionToWeb3));
  transaction.feePayer = new PublicKey(walletAddress);
  return transaction;
};

/**
 * Replace account addresses in Kit instructions without changing their roles or
 * encoded instruction data. Orca's high-level open builder generates a position
 * signer internally but returns only its address; Gateway instead needs the
 * matching Web3.js Keypair so the existing Solana layer can co-sign.
 */
export const replaceOrcaInstructionAccounts = (
  instructions: readonly Instruction[],
  replacements: ReadonlyMap<string, string>,
): Instruction[] =>
  instructions.map((instruction) => ({
    ...instruction,
    accounts: instruction.accounts?.map((account) => {
      const replacement = replacements.get(account.address);
      return replacement ? { ...account, address: address(replacement) } : account;
    }),
  }));
