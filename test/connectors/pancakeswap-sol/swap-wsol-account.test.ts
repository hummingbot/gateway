import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { Keypair, PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import BN from 'bn.js';

import { buildSwapTransaction } from '../../../src/connectors/pancakeswap-sol/pancakeswap-sol.transactions';

jest.mock('../../../src/connectors/pancakeswap-sol/pancakeswap-sol.instructions', () => ({
  ...jest.requireActual('../../../src/connectors/pancakeswap-sol/pancakeswap-sol.instructions'),
  buildSwapV2Instruction: jest.fn(
    async () => new TransactionInstruction({ programId: SystemProgram.programId, keys: [], data: Buffer.from([9]) }),
  ),
}));
jest.mock('../../../src/connectors/pancakeswap-sol/pancakeswap-sol.parser', () => ({
  ...jest.requireActual('../../../src/connectors/pancakeswap-sol/pancakeswap-sol.parser'),
  getTokenProgramForMint: jest.fn(async () => TOKEN_PROGRAM_ID),
}));

const wallet = Keypair.generate().publicKey;
const usdc = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const wsolAccount = getAssociatedTokenAddressSync(NATIVE_MINT, wallet, true, TOKEN_PROGRAM_ID);

describe('pancakeswap-sol swap from native SOL', () => {
  it('creates the wSOL account once, through the wrap, when the wallet has none', async () => {
    const solana: any = {
      connection: {
        getAccountInfo: jest.fn(async () => null),
        getLatestBlockhash: jest.fn(async () => ({ blockhash: Keypair.generate().publicKey.toBase58() })),
      },
      // As Solana.wrapSOL builds it for a wallet with no wSOL account.
      wrapSOL: jest.fn(async () => [
        createAssociatedTokenAccountIdempotentInstruction(wallet, wsolAccount, wallet, NATIVE_MINT),
        SystemProgram.transfer({ fromPubkey: wallet, toPubkey: wsolAccount, lamports: 1 }),
      ]),
      unwrapSOL: jest.fn(),
    };
    const tx = await buildSwapTransaction(
      solana,
      '4QU2NpRaqmKMvPSwVKQDeW4V6JFEKJdkzbzdauumD9qN',
      wallet,
      NATIVE_MINT,
      usdc,
      new BN(1_000_000),
      new BN(0),
      new BN(0),
      true,
    );
    const keys = tx.message.staticAccountKeys;
    const creates = tx.message.compiledInstructions.filter((ix) =>
      keys[ix.programIdIndex].equals(ASSOCIATED_TOKEN_PROGRAM_ID),
    );
    const createdAccounts = creates.map((ix) => keys[ix.accountKeyIndexes[1]].toBase58());
    expect(createdAccounts.filter((a) => a === wsolAccount.toBase58())).toHaveLength(1);
  });
});
