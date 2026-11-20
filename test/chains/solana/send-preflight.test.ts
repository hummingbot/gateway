import { SendTransactionError } from '@solana/web3.js';

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

import { Solana } from '../../../src/chains/solana/solana';

const wire = Uint8Array.from([1, ...Array.from({ length: 64 }, (_, i) => i + 1), 9, 9, 9]);
const JUPITER = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';

describe('sending a transaction with preflight', () => {
  let solana: Solana;
  let conn: any;

  beforeEach(async () => {
    (Solana as any)._instances = new Map();
    solana = await Solana.getInstance('mainnet-beta');
    conn = solana.connection as any;
    conn.getLatestBlockhash = jest.fn().mockResolvedValue({ blockhash: 'b', lastValidBlockHeight: 100 });
  });

  it('asks the RPC to run preflight', async () => {
    const send = jest.fn().mockResolvedValue('sig');
    conn.sendRawTransaction = send;
    jest.spyOn(solana as any, '_confirmViaPolling').mockResolvedValue({ confirmed: true, txData: {} });

    await (solana as any)._sendAndConfirmRawTransaction(wire);

    expect(send.mock.calls[0][1].skipPreflight).toBe(false);
  });

  it('throws the parsed program error when preflight refuses the transaction', async () => {
    conn.sendRawTransaction = jest.fn().mockRejectedValue(
      new SendTransactionError({
        action: 'simulate',
        signature: '',
        transactionMessage:
          'Transaction simulation failed: Error processing Instruction 3: custom program error: 0x1771',
        logs: [`Program ${JUPITER} invoke [1]`, `Program ${JUPITER} failed: custom program error: 0x1771`],
      }),
    );

    await expect((solana as any)._sendAndConfirmRawTransaction(wire)).rejects.toMatchObject({
      statusCode: 400,
      code: 'SLIPPAGE_EXCEEDED',
    });
  });
});
