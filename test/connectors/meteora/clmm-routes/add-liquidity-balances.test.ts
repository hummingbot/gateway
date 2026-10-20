/**
 * Meteora add-liquidity checks the wallet's balances by the pool's mints, through the
 * real Solana.getBalances over encoded token accounts. A token outside the token list
 * has no symbol getBalances knows, so asking by symbol read it as 0 and refused a funded
 * wallet.
 */
const mockGetMint = jest.fn();
jest.mock('@solana/spl-token', () => ({
  ...jest.requireActual('@solana/spl-token'),
  getMint: (...args: any[]) => mockGetMint(...args),
}));

import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Keypair, PublicKey } from '@solana/web3.js';

import { Solana } from '../../../../src/chains/solana/solana';
import { addLiquidity } from '../../../../src/connectors/meteora/clmm-routes/addLiquidity';
import { Meteora } from '../../../../src/connectors/meteora/meteora';
import { encodedTokenAccount } from '../../../helpers/solanaTokenAccounts';

jest.mock('../../../../src/connectors/meteora/meteora');

const WALLET_KEY = Keypair.generate().publicKey;
const WALLET = WALLET_KEY.toBase58();
const POSITION = Keypair.generate().publicKey.toBase58();
const UNLISTED = Keypair.generate().publicKey;
const USDC = Keypair.generate().publicKey;
const REACHED_THE_DEPOSIT = 'reached the deposit';

/** `held` is whole tokens per mint; both mints have 6 decimals. */
const setup = (held: Record<string, number>) => {
  (Meteora.getInstance as jest.Mock).mockResolvedValue({
    getRawPosition: jest.fn().mockResolvedValue({
      position: { publicKey: new PublicKey(POSITION), positionData: { lowerBinId: 0, upperBinId: 10 } },
      info: { publicKey: Keypair.generate().publicKey },
    }),
    getDlmmPool: jest.fn().mockResolvedValue({
      tokenX: { publicKey: UNLISTED, mint: { decimals: 6 } },
      tokenY: { publicKey: USDC, mint: { decimals: 6 } },
      addLiquidityByStrategyChunkable: jest.fn().mockRejectedValue(new Error(REACHED_THE_DEPOSIT)),
    }),
  });
  mockGetMint.mockResolvedValue({ decimals: 6 });

  // The real getBalances and getToken over a stubbed chain: USDC is listed, the other mint is not.
  const solana = Object.create(Solana.prototype);
  solana.getTokenList = jest.fn().mockResolvedValue([{ address: USDC.toBase58(), symbol: 'USDC', decimals: 6 }]);
  solana.connection = {
    getBalance: jest.fn().mockResolvedValue(1_000_000_000),
    getTokenAccountsByOwner: jest.fn(async (_owner: PublicKey, filter: { programId: PublicKey }) => ({
      value: filter.programId.equals(TOKEN_PROGRAM_ID)
        ? Object.entries(held).map(([mint, amount]) =>
            encodedTokenAccount(WALLET_KEY, new PublicKey(mint), BigInt(amount * 1e6), TOKEN_PROGRAM_ID),
          )
        : [],
    })),
    // getToken reads an unlisted mint from the chain; there is no account here to read.
    getAccountInfo: jest.fn().mockResolvedValue(null),
  };
  jest.spyOn(Solana, 'getInstance').mockResolvedValue(solana);
};

describe('meteora addLiquidity balance check', () => {
  afterEach(() => jest.restoreAllMocks());

  it('accepts a funded token that is not in the token list', async () => {
    setup({ [UNLISTED.toBase58()]: 100, [USDC.toBase58()]: 100 });

    await expect(addLiquidity('mainnet-beta', WALLET, POSITION, 50, 50)).rejects.toThrow(REACHED_THE_DEPOSIT);
  });

  it('refuses a listed token the wallet holds too little of', async () => {
    setup({ [UNLISTED.toBase58()]: 100, [USDC.toBase58()]: 10 });

    await expect(addLiquidity('mainnet-beta', WALLET, POSITION, 50, 50)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Insufficient balance for USDC. Required: 50, Available: 10',
    });
  });
});
