/**
 * A launch swap names its token as base. On a BUY the wallet spends the quote
 * currency and receives the token, so the token's change is the positive one.
 * Both launch connectors used to hand the confirmation step no side, which
 * labels by direction instead: a BUY reported the SOL spent as the base change.
 */
import { NATIVE_MINT } from '@solana/spl-token';
import { Keypair, PublicKey, Transaction } from '@solana/web3.js';

jest.mock('../../src/connectors/meteora/meteora-dbc', () => ({
  MeteoraDbc: { getInstance: jest.fn() },
}));
jest.mock('../../src/connectors/raydium/launchlab/launchlab', () => ({
  ...jest.requireActual('../../src/connectors/raydium/launchlab/launchlab'),
  readPool: jest.fn(),
  poolTradeAccounts: jest.fn(),
  buyInstruction: jest.fn(),
  sellInstruction: jest.fn(),
}));

import { Solana } from '../../src/chains/solana/solana';
import { executeQuote as executeDbcQuote } from '../../src/connectors/meteora/launch-routes/executeQuote';
import { MeteoraDbc } from '../../src/connectors/meteora/meteora-dbc';
import { executeQuote as executeLaunchlabQuote } from '../../src/connectors/raydium/launch-routes/swap';
import * as launchlab from '../../src/connectors/raydium/launchlab/launchlab';
import { quoteCache } from '../../src/services/quote-cache';

const WALLET = Keypair.generate().publicKey;
const TOKEN = Keypair.generate().publicKey;
const POOL = Keypair.generate().publicKey;
const SOL = NATIVE_MINT.toBase58();

const SOL_SPENT = -0.0115;
const TOKENS_RECEIVED = 329_899;

/** A Solana whose confirmation step is the real one, over a fixed pair of balance changes. */
const solanaWith = (changes: Record<string, number>) => {
  const solana = Object.create(Solana.prototype);
  solana.connection = { getAccountInfo: jest.fn().mockResolvedValue({}) };
  solana.wrapSOL = jest.fn().mockResolvedValue([]);
  solana.sendAndConfirmTransactionForWallet = jest.fn().mockResolvedValue({ signature: 'sig' });
  solana.getConfirmedTransactionData = jest.fn().mockResolvedValue({ meta: { err: null } });
  solana.extractBalanceChangesAndFee = jest.fn(async (_sig: string, _owner: string, tokens: string[]) => ({
    balanceChanges: tokens.map((t) => changes[t]),
    fee: 0.000005,
  }));
  return solana as Solana;
};

const quote = (side: 'BUY' | 'SELL') => ({
  network: 'mainnet-beta',
  side,
  slippagePct: 1,
  tokenIn: { address: side === 'BUY' ? SOL : TOKEN.toBase58(), symbol: 'in' },
  tokenOut: { address: side === 'BUY' ? TOKEN.toBase58() : SOL, symbol: 'out' },
  amountInRaw: '10000000',
  minAmountOutRaw: '1',
});

afterEach(() => jest.restoreAllMocks());

describe('launch swaps label balance changes by base and quote', () => {
  it('meteora DBC: a BUY reports the token received as the base change', async () => {
    jest
      .spyOn(Solana, 'getInstance')
      .mockResolvedValue(solanaWith({ [SOL]: SOL_SPENT, [TOKEN.toBase58()]: TOKENS_RECEIVED }));
    (MeteoraDbc.getInstance as jest.Mock).mockResolvedValue({
      getPool: jest.fn().mockResolvedValue({ isMigrated: false }),
      client: { pool: { swap2: jest.fn().mockResolvedValue(new Transaction()) } },
    });
    quoteCache.set('dbc-buy', 'meteora-dbc', {
      ...quote('BUY'),
      poolAddress: POOL.toBase58(),
      swapBaseForQuote: false,
      partialFill: false,
    });

    const result = await executeDbcQuote(WALLET.toBase58(), 'mainnet-beta', 'dbc-buy');

    expect(result.data?.baseTokenBalanceChange).toBe(TOKENS_RECEIVED);
    expect(result.data?.quoteTokenBalanceChange).toBe(SOL_SPENT);
  });

  it('raydium LaunchLab: a BUY reports the token received as the base change', async () => {
    jest
      .spyOn(Solana, 'getInstance')
      .mockResolvedValue(solanaWith({ [SOL]: SOL_SPENT, [TOKEN.toBase58()]: TOKENS_RECEIVED }));
    (launchlab.readPool as jest.Mock).mockResolvedValue({ status: 0 });
    (launchlab.poolTradeAccounts as jest.Mock).mockReturnValue({
      userBase: Keypair.generate().publicKey,
      baseMint: TOKEN,
      baseProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      quoteMint: NATIVE_MINT,
    });
    (launchlab.buyInstruction as jest.Mock).mockReturnValue({
      programId: Keypair.generate().publicKey,
      keys: [],
      data: Buffer.alloc(0),
    });
    quoteCache.set('launchlab-buy', 'raydium-launchlab', { ...quote('BUY'), pool: POOL.toBase58() });

    const result = await executeLaunchlabQuote(WALLET.toBase58(), 'mainnet-beta', 'launchlab-buy');

    expect(result.data?.baseTokenBalanceChange).toBe(TOKENS_RECEIVED);
    expect(result.data?.quoteTokenBalanceChange).toBe(SOL_SPENT);
  });

  it('a SELL reports the token spent as the base change', async () => {
    jest.spyOn(Solana, 'getInstance').mockResolvedValue(solanaWith({ [SOL]: 0.0098, [TOKEN.toBase58()]: -329_899 }));
    (MeteoraDbc.getInstance as jest.Mock).mockResolvedValue({
      getPool: jest.fn().mockResolvedValue({ isMigrated: false }),
      client: { pool: { swap2: jest.fn().mockResolvedValue(new Transaction()) } },
    });
    quoteCache.set('dbc-sell', 'meteora-dbc', {
      ...quote('SELL'),
      poolAddress: POOL.toBase58(),
      swapBaseForQuote: true,
      partialFill: false,
    });

    const result = await executeDbcQuote(WALLET.toBase58(), 'mainnet-beta', 'dbc-sell');

    expect(result.data?.baseTokenBalanceChange).toBe(-329_899);
    expect(result.data?.quoteTokenBalanceChange).toBe(0.0098);
  });
});
