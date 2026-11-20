/**
 * A PumpSwap deposit's SOL side is what went into the pool, not what left the wallet.
 *
 * The wallet's SOL change also pays the rent of every account the transaction opens.
 * Creating a pool with 0.003 SOL on mainnet (5SAqAHtDUDB4…) moved 0.01069112 SOL out of
 * the wallet, 0.00769112 of it rent, and reported the whole figure as deposited.
 */
import { NATIVE_MINT } from '@solana/spl-token';
import { Keypair, TransactionInstruction } from '@solana/web3.js';

jest.mock('../../../src/chains/solana/solana');
jest.mock('../../../src/connectors/pump/pump', () => ({ Pump: { getInstance: jest.fn() } }));
jest.mock('../../../src/connectors/pump/amm-routes/quoteLiquidity', () => ({
  getLiquidityQuote: jest.fn().mockResolvedValue({ quote: {}, baseLimited: true }),
}));

import { Solana } from '../../../src/chains/solana/solana';
import { addLiquidity } from '../../../src/connectors/pump/amm-routes/addLiquidity';
import { createPool } from '../../../src/connectors/pump/amm-routes/createPool';
import { Pump } from '../../../src/connectors/pump/pump';

const WALLET = Keypair.generate().publicKey;
const TOKEN = Keypair.generate().publicKey;
const SOL = NATIVE_MINT.toBase58();

const DEPOSIT = 3_000_000;
const VAULT_RENT = 2_039_280;
const OTHER_RENT = 5_651_840; // the pool, its LP mint, the base vault, the wallet's LP account
const FEE = 5000;

// The wallet, an account that opens holding only rent, and the pool's SOL vault, which
// opens holding its rent and the deposit.
const txData = {
  meta: {
    fee: FEE,
    preBalances: [1_000_000_000, 0, 0],
    postBalances: [1_000_000_000 - DEPOSIT - VAULT_RENT - OTHER_RENT - FEE, OTHER_RENT, VAULT_RENT + DEPOSIT],
    preTokenBalances: [],
    postTokenBalances: [{ accountIndex: 2, mint: SOL, uiTokenAmount: { amount: String(DEPOSIT) } }],
  },
};
const instruction = new TransactionInstruction({ programId: TOKEN, keys: [], data: Buffer.alloc(0) });

beforeEach(() => {
  (Solana.getInstance as jest.Mock).mockResolvedValue({
    sendAndConfirmTransactionForWallet: jest.fn().mockResolvedValue({ signature: 'sig' }),
    getConfirmedTransactionData: jest.fn().mockResolvedValue(txData),
    // The native change with the fee added back: the deposit and every account's rent.
    extractBalanceChangesAndFee: jest
      .fn()
      .mockResolvedValue({ balanceChanges: [-1000, -(DEPOSIT + VAULT_RENT + OTHER_RENT) / 1e9] }),
  });
  (Pump.getInstance as jest.Mock).mockResolvedValue({
    getTokenInfo: jest.fn(async (t: string) =>
      t === 'SOL' ? { address: SOL, symbol: 'SOL', decimals: 9 } : { address: t, symbol: 'TKN', decimals: 6 },
    ),
    getLiquidityState: jest.fn().mockResolvedValue({ pool: { baseMint: TOKEN, quoteMint: NATIVE_MINT } }),
    onlineAmm: { createPoolSolanaState: jest.fn().mockResolvedValue({}) },
    ammSdk: {
      createPoolInstructions: jest.fn().mockResolvedValue([instruction]),
      depositInstructionsInternal: jest.fn().mockResolvedValue([instruction]),
    },
  });
});

describe('pump AMM deposits report what the pool received', () => {
  it('create-pool leaves the rent of the accounts it opened out of the SOL deposited', async () => {
    const result = await createPool('mainnet-beta', WALLET.toBase58(), TOKEN.toBase58(), 'SOL', 1000, 0.003);

    expect(result.data?.quoteTokenAmountAdded).toBeCloseTo(0.003, 9);
    expect(result.data?.baseTokenAmountAdded).toBe(1000);
  });

  it('add-liquidity does the same', async () => {
    const result = await addLiquidity('mainnet-beta', WALLET.toBase58(), Keypair.generate().publicKey.toBase58(), 1, 1);

    expect(result.data?.quoteTokenAmountAdded).toBeCloseTo(0.003, 9);
    expect(result.data?.baseTokenAmountAdded).toBe(1000);
  });
});
