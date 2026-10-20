/**
 * Meteora add-liquidity checks the wallet's balances by the pool's mints, through the
 * real Solana.getBalances. A token outside the token list has no symbol getBalances
 * knows, so asking by symbol read it as 0 and refused a funded wallet.
 */
import { Keypair, PublicKey } from '@solana/web3.js';

import { Solana } from '../../../../src/chains/solana/solana';
import { addLiquidity } from '../../../../src/connectors/meteora/clmm-routes/addLiquidity';
import { Meteora } from '../../../../src/connectors/meteora/meteora';

jest.mock('../../../../src/connectors/meteora/meteora');

const WALLET = Keypair.generate().publicKey.toBase58();
const POSITION = Keypair.generate().publicKey.toBase58();
const UNLISTED = Keypair.generate().publicKey;
const USDC = Keypair.generate().publicKey;
const REACHED_THE_DEPOSIT = 'reached the deposit';

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

  // The real getBalances and getToken over a stubbed chain: USDC is listed, the other mint is not.
  const solana = Object.create(Solana.prototype);
  solana.getTokenList = jest.fn().mockResolvedValue([{ address: USDC.toBase58(), symbol: 'USDC', decimals: 6 }]);
  solana.getSolBalance = jest.fn().mockResolvedValue(1);
  solana.fetchTokenAccounts = jest
    .fn()
    .mockResolvedValue(
      new Map(Object.entries(held).map(([mint, uiAmount]) => [mint, { parsedAccount: { uiAmount } }])),
    );
  solana.getTokenBalanceWithMintInfo = jest.fn(async (account: any) => account.parsedAccount.uiAmount);
  solana.connection = {
    getAccountInfo: jest.fn().mockResolvedValue({ owner: Keypair.generate().publicKey }),
  };
  solana.fetchTokenFromChain = jest.fn().mockResolvedValue(null);
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
