/**
 * Claiming creator fees collects each vault only when it holds something.
 *
 * PumpSwap's collect opens a wrapped-SOL account at the creator's cost. On mainnet a
 * first claim of 0.002424 SOL, all of it from the curve vault, paid 0.00148844 SOL of
 * that rent for a PumpSwap step that logged "No coin creator fee to collect".
 */
import { Keypair, Transaction, TransactionInstruction } from '@solana/web3.js';
import BN from 'bn.js';

const sdk = {
  getCreatorVaultBalance: jest.fn(),
  collectCoinCreatorFeeInstructions: jest.fn(),
};
jest.mock('@pump-fun/pump-sdk', () => ({
  ...jest.requireActual('@pump-fun/pump-sdk'),
  OnlinePumpSdk: jest.fn(() => sdk),
}));
jest.mock('../../../src/connectors/pump/pump', () => ({ Pump: { getInstance: jest.fn() } }));

import { claimCreatorFees } from '../../../src/connectors/pump/launch-routes/creatorFees';
import { Pump } from '../../../src/connectors/pump/pump';

const WALLET = Keypair.generate().publicKey;
const ix = () =>
  new TransactionInstruction({ programId: Keypair.generate().publicKey, keys: [], data: Buffer.alloc(0) });
const CURVE_COLLECT = ix();
const SWAP_COLLECT = [ix(), ix()]; // the wrapped-SOL account, then PumpSwap's collect

const claimWith = async (curveLamports: number, swapLamports: number) => {
  const send = jest.fn().mockResolvedValue({ signature: 'sig' });
  (Pump.getInstance as jest.Mock).mockResolvedValue({
    solana: {
      connection: {},
      sendAndConfirmTransactionForWallet: send,
      getConfirmedTransactionData: jest.fn().mockResolvedValue({ meta: { fee: 5000 } }),
    },
    onlineAmm: { getCoinCreatorVaultBalance: jest.fn().mockResolvedValue(new BN(swapLamports)) },
  });
  sdk.getCreatorVaultBalance.mockResolvedValue(new BN(curveLamports));
  sdk.collectCoinCreatorFeeInstructions.mockResolvedValue([CURVE_COLLECT, ...SWAP_COLLECT]);
  const result = await claimCreatorFees('mainnet-beta', WALLET.toBase58());
  return { result, sent: (send.mock.calls[0][0] as Transaction).instructions };
};

describe('pump claimCreatorFees', () => {
  it('leaves PumpSwap out when only the curve vault holds fees', async () => {
    const { result, sent } = await claimWith(2_424_000, 0);

    expect(sent).toEqual([CURVE_COLLECT]);
    expect(result.claimed).toBe(0.002424);
  });

  it('leaves the curve out when only the PumpSwap vault holds fees', async () => {
    const { sent } = await claimWith(0, 1_000_000);

    expect(sent).toEqual(SWAP_COLLECT);
  });

  it('collects both and reports their sum', async () => {
    const { result, sent } = await claimWith(2_000_000, 1_000_000);

    expect(sent).toEqual([CURVE_COLLECT, ...SWAP_COLLECT]);
    expect(result.claimed).toBe(0.003);
  });

  it('refuses when neither vault holds anything', async () => {
    await expect(claimWith(0, 0)).rejects.toThrow(/No pump creator fees to claim/);
    const pump = await (Pump.getInstance as jest.Mock).mock.results.at(-1)!.value;
    expect(pump.solana.sendAndConfirmTransactionForWallet).not.toHaveBeenCalled();
  });
});
