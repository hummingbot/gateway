import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey, SystemProgram } from '@solana/web3.js';

import { getTokenProgramForMint } from '../../../src/connectors/pancakeswap-sol/pancakeswap-sol.parser';

const MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

const solanaReturning = (getAccountInfo: jest.Mock): any => ({ connection: { getAccountInfo } });

describe('pancakeswap-sol getTokenProgramForMint', () => {
  it('returns the classic token program for a mint it owns', async () => {
    const solana = solanaReturning(jest.fn().mockResolvedValue({ owner: TOKEN_PROGRAM_ID }));
    await expect(getTokenProgramForMint(solana, MINT)).resolves.toEqual(TOKEN_PROGRAM_ID);
  });

  it('returns Token-2022 for a mint it owns', async () => {
    const solana = solanaReturning(jest.fn().mockResolvedValue({ owner: TOKEN_2022_PROGRAM_ID }));
    await expect(getTokenProgramForMint(solana, MINT)).resolves.toEqual(TOKEN_2022_PROGRAM_ID);
  });

  it('throws when the mint read fails', async () => {
    const solana = solanaReturning(jest.fn().mockRejectedValue(new Error('429 Too Many Requests')));
    await expect(getTokenProgramForMint(solana, MINT)).rejects.toThrow(
      `could not read mint ${MINT.toBase58()}: 429 Too Many Requests`,
    );
  });

  it('throws when the mint account does not exist', async () => {
    const solana = solanaReturning(jest.fn().mockResolvedValue(null));
    await expect(getTokenProgramForMint(solana, MINT)).rejects.toThrow(`mint ${MINT.toBase58()} does not exist`);
  });

  it('throws when neither token program owns the account', async () => {
    const solana = solanaReturning(jest.fn().mockResolvedValue({ owner: SystemProgram.programId }));
    await expect(getTokenProgramForMint(solana, MINT)).rejects.toThrow(
      `${MINT.toBase58()} is not a token mint: owned by ${SystemProgram.programId.toBase58()}`,
    );
  });
});
