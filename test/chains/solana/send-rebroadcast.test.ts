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
        if (key === 'solana-mainnet-beta.confirmRetryInterval') return 1;
        if (key === 'solana-mainnet-beta.confirmRetryCount') return 3;
        if (key === 'solana-mainnet-beta.minPriorityFeePerCU') return 0;
        return undefined;
      }),
    })),
  },
}));

import { REBROADCAST_INTERVAL_MS, Solana } from '../../../src/chains/solana/solana';

const wire = Uint8Array.from([1, ...Array.from({ length: 64 }, (_, i) => i + 1), 9, 9, 9]);
const LAST_VALID_BLOCK_HEIGHT = 100;

/**
 * A stub RPC whose block height grows by one per second from 95, so the blockhash expires
 * (height 101) six seconds after the send. A send counts as delivered only from the
 * `landsOnSend`-th send on; the earlier ones are dropped.
 */
function stubRpc(solana: Solana, landsOnSend: number) {
  const conn = solana.connection as any;
  const start = Date.now();
  const sent: Uint8Array[] = [];
  const getLatestBlockhash = jest
    .fn()
    .mockResolvedValue({ blockhash: 'b', lastValidBlockHeight: LAST_VALID_BLOCK_HEIGHT });
  conn.getLatestBlockhash = getLatestBlockhash;
  conn.getBlockHeight = jest.fn(async () => 95 + Math.floor((Date.now() - start) / 1000));
  conn.sendRawTransaction = jest.fn(async (bytes: any) => {
    sent.push(bytes);
    return 'sig';
  });
  conn.getSignatureStatuses = jest.fn(async () => ({
    context: { slot: 1 },
    value: [sent.length >= landsOnSend ? { confirmationStatus: 'confirmed', err: null } : null],
  }));
  conn.getTransaction = jest.fn(async () => (sent.length >= landsOnSend ? { meta: { err: null } } : null));
  return { sent, getLatestBlockhash };
}

describe('rebroadcasting a sent transaction', () => {
  let solana: Solana;

  beforeEach(async () => {
    jest.useFakeTimers();
    (Solana as any)._instances = new Map();
    solana = await Solana.getInstance('mainnet-beta');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends the same bytes again until the RPC delivers one, then stops', async () => {
    const { sent, getLatestBlockhash } = stubRpc(solana, 3);

    const result = (solana as any)._sendAndConfirmRawTransaction(wire);
    await jest.advanceTimersByTimeAsync(10_000);

    expect(await result).toEqual({ confirmed: true, signature: 'sig', txData: { meta: { err: null } } });
    expect(sent).toHaveLength(3);
    for (const bytes of sent) expect(bytes).toBe(wire);
    expect(getLatestBlockhash).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(10 * REBROADCAST_INTERVAL_MS);
    expect(sent).toHaveLength(3);
  });

  it('stops rebroadcasting when the blockhash expires', async () => {
    const { sent } = stubRpc(solana, Infinity);

    const result = (solana as any)._sendAndConfirmRawTransaction(wire);
    await jest.advanceTimersByTimeAsync(30_000);

    expect(await result).toEqual({ confirmed: false, signature: 'sig', txData: null });
    // The first send, then resends at 2 s (height 97) and 4 s (height 99); at 6 s the
    // height is 101, past the last valid block height of 100.
    expect(sent).toHaveLength(3);

    await jest.advanceTimersByTimeAsync(10 * REBROADCAST_INTERVAL_MS);
    expect(sent).toHaveLength(3);
  });
});
