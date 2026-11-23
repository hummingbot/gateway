/**
 * Converting lamports to SOL must not leak floating-point noise.
 *
 * 1 SOL = 1,000,000,000 lamports. Multiplying by 1e-9 is inexact in binary floating point
 * (230919729 * 1e-9 = 0.23091972900000002), whereas dividing by 1e9 returns the closest
 * double to the true decimal value (0.230919729).
 */
import { Keypair } from '@solana/web3.js';

import { Solana } from '../../../src/chains/solana/solana';

// Lamport amounts with the SOL value a wallet explorer shows for each. Most picked up
// noise under `lamports * (1 / 1e9)`; 1, 5000 (BASE_FEE) and 1e9 are clean edge cases.
const CASES: Array<[number, number]> = [
  [230919729, 0.230919729], // the amount reported in issue #752
  [123456789, 0.123456789],
  [987654321, 0.987654321],
  [1999999999, 1.999999999],
  [777777777, 0.777777777],
  [1, 0.000000001],
  [5000, 0.000005], // BASE_FEE
  [1000000000, 1],
];

// Only the connection is stood in for; the conversion code is the real code.
const solanaWith = (lamports: number): Solana => {
  const instance = Object.create(Solana.prototype);
  instance.connection = { getBalance: jest.fn().mockResolvedValue(lamports) };
  return instance;
};

describe('lamports to SOL conversion', () => {
  describe.each(CASES)('%i lamports', (lamports, sol) => {
    it('getSolBalance (used by the balances route) returns exactly the decimal value', async () => {
      const result = await (solanaWith(lamports) as any).getSolBalance(Keypair.generate().publicKey);

      expect(result).toBe(sol);
    });

    it('getFee (transaction fee in SOL) returns exactly the decimal value', () => {
      const result = (solanaWith(lamports) as any).getFee({ meta: { fee: lamports } });

      expect(result).toBe(sol);
    });

    it('extractBalanceChangesAndFee reports the owner SOL balance change as the exact decimal value', async () => {
      const owner = Keypair.generate().publicKey;
      const instance = solanaWith(lamports) as any;
      instance._fetchTransactionWithRetry = jest.fn().mockResolvedValue({
        meta: { fee: 0, preBalances: [0, 0], postBalances: [0, lamports], preTokenBalances: [], postTokenBalances: [] },
        transaction: { message: { accountKeys: [{ pubkey: Keypair.generate().publicKey }, { pubkey: owner }] } },
      });

      const { balanceChanges } = await instance.extractBalanceChangesAndFee('sig', owner.toBase58(), [
        'So11111111111111111111111111111111111111112',
      ]);

      expect(balanceChanges[0]).toBe(sol);
    });
  });

  // When the owner is the fee payer (account 0) the fee is added back to the lamport change.
  // That has to happen before the division: adding two separately divided SOL values brings the
  // noise back (-100005000 / 1e9 + 5000 / 1e9 = -0.09999999999999999).
  describe.each([
    [-100005000, 5000, -0.1],
    [-230924729, 5000, -0.230919729],
    [-1000010000, 10000, -1],
  ])('fee payer with a %i lamport change and a %i lamport fee', (lamportChange, fee, sol) => {
    it('extractBalanceChangesAndFee returns the exact decimal SOL value', async () => {
      const owner = Keypair.generate().publicKey;
      const instance = solanaWith(0) as any;
      instance._fetchTransactionWithRetry = jest.fn().mockResolvedValue({
        meta: { fee, preBalances: [2000000000], postBalances: [2000000000 + lamportChange], preTokenBalances: [] },
        transaction: { message: { accountKeys: [{ pubkey: owner }] } },
      });

      const { balanceChanges } = await instance.extractBalanceChangesAndFee('sig', owner.toBase58(), [
        'So11111111111111111111111111111111111111112',
      ]);

      expect(balanceChanges[0]).toBe(sol);
    });
  });

  // estimateGas is base fee (5000 lamports) plus the priority fee, so it needs at least 5000.
  describe.each(CASES.filter(([lamports]) => lamports >= 5000))('%i lamports of gas', (lamports, sol) => {
    it('estimateGas returns exactly the decimal SOL value', async () => {
      const instance = solanaWith(lamports) as any;
      instance.estimateGasPrice = jest.fn().mockResolvedValue(lamports - 5000);

      expect(await instance.estimateGas(1)).toBe(sol);
    });
  });
});
