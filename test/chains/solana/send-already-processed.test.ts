import { Connection } from '@solana/web3.js';
import bs58 from 'bs58';

jest.mock('../../../src/services/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  redactUrl: jest.fn((url: string) => url),
}));

jest.mock('../../../src/services/config-manager-v2', () => ({
  ConfigManagerV2: {
    getInstance: jest.fn(() => ({
      get: jest.fn((key: string) => {
        if (key === 'solana.defaultNetwork') return 'mainnet-beta';
        if (key === 'solana.defaultWallet') return 'test-wallet';
        if (key === 'solana.rpcProvider') return 'url';
        if (key === 'solana-mainnet-beta.nodeURL') return 'https://api.mainnet-beta.solana.com';
        if (key === 'solana-mainnet-beta.nativeCurrencySymbol') return 'SOL';
        if (key === 'solana-mainnet-beta.defaultComputeUnits') return 200000;
        if (key === 'solana-mainnet-beta.confirmRetryInterval') return 2;
        if (key === 'solana-mainnet-beta.confirmRetryCount') return 30;
        if (key === 'solana-mainnet-beta.minPriorityFeePerCU') return 0;
        return undefined;
      }),
    })),
  },
}));

import { Solana } from '../../../src/chains/solana/solana';

// A wire transaction: one signature (compact-u16 count 1, then 64 bytes), then a message.
const sigBytes = Uint8Array.from({ length: 64 }, (_, i) => i + 1);
const wire = Uint8Array.from([1, ...sigBytes, 9, 9, 9]);
const signature = bs58.encode(sigBytes);

describe('sending a transaction that has already landed', () => {
  let solana: Solana;
  let conn: jest.Mocked<Connection>;

  beforeEach(async () => {
    (Solana as any)._instances = new Map();
    solana = await Solana.getInstance('mainnet-beta');
    conn = solana.connection as jest.Mocked<Connection>;
    conn.getLatestBlockhash = jest.fn().mockResolvedValue({ blockhash: 'b', lastValidBlockHeight: 10 });
    conn.sendRawTransaction = jest
      .fn()
      .mockRejectedValue(new Error('Transaction error: This transaction has already been processed'));
  });

  it('reports the landed transaction by the signature in its bytes', async () => {
    const fetch = jest.spyOn(solana as any, '_fetchTransactionWithRetry').mockResolvedValue({ meta: { err: null } });
    const out = await (solana as any)._sendAndConfirmRawTransaction(wire);
    expect(fetch).toHaveBeenCalledWith(signature, 3, 500);
    expect(out).toEqual({ confirmed: true, signature, txData: { meta: { err: null } } });
  });

  it('reports a landed transaction that failed as unconfirmed', async () => {
    jest.spyOn(solana as any, '_fetchTransactionWithRetry').mockResolvedValue({ meta: { err: { Custom: 1 } } });
    const out = await (solana as any)._sendAndConfirmRawTransaction(wire);
    expect(out.confirmed).toBe(false);
    expect(out.signature).toBe(signature);
  });

  it('throws when the RPC claims it landed but cannot find it', async () => {
    jest.spyOn(solana as any, '_fetchTransactionWithRetry').mockResolvedValue(null);
    await expect((solana as any)._sendAndConfirmRawTransaction(wire)).rejects.toThrow(
      `RPC reports ${signature} already processed, but it cannot be found`,
    );
  });
});
