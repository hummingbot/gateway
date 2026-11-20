/**
 * The Meteora DLMM routes correct the native side of a pool for the fee and rent the
 * wallet paid. Which side is native is the pool's mint, not the symbol a token's
 * metadata claims.
 */
import { NATIVE_MINT } from '@solana/spl-token';
import { Keypair, PublicKey } from '@solana/web3.js';

import { Solana } from '../../../../src/chains/solana/solana';
import { removeLiquidity } from '../../../../src/connectors/meteora/clmm-routes/removeLiquidity';
import { Meteora } from '../../../../src/connectors/meteora/meteora';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/meteora/meteora');

const WALLET = Keypair.generate().publicKey.toBase58();
const POSITION = Keypair.generate().publicKey.toBase58();
const POOL = Keypair.generate().publicKey;
const IMPOSTOR = Keypair.generate().publicKey;
const USDC = Keypair.generate().publicKey;
const FEE = 0.00001;

const setup = (tokenX: PublicKey, symbolOf: Record<string, string>) => {
  const dlmmPool = {
    tokenX: { publicKey: tokenX },
    tokenY: { publicKey: USDC },
    removeLiquidity: jest.fn().mockResolvedValue({}),
  };
  (Meteora.getInstance as jest.Mock).mockResolvedValue({
    getRawPosition: jest.fn().mockResolvedValue({
      position: { publicKey: new PublicKey(POSITION), positionData: { lowerBinId: 0, upperBinId: 10 } },
      info: { publicKey: POOL },
    }),
    getDlmmPool: jest.fn().mockResolvedValue(dlmmPool),
  });
  (Solana.getInstance as jest.Mock).mockResolvedValue({
    getToken: jest.fn(async (mint: string) => ({ address: mint, symbol: symbolOf[mint], decimals: 9 })),
    sendAndConfirmTransactionForWallet: jest.fn().mockResolvedValue({ signature: 'sig', fee: FEE }),
    getConfirmedTransactionData: jest.fn().mockResolvedValue({ meta: {} }),
    extractBalanceChangesAndFee: jest.fn().mockResolvedValue({ balanceChanges: [2, 3] }),
  });
};

describe('meteora removeLiquidity', () => {
  it('leaves a token that calls itself SOL uncorrected', async () => {
    setup(IMPOSTOR, { [IMPOSTOR.toBase58()]: 'SOL', [USDC.toBase58()]: 'USDC' });

    const result = await removeLiquidity('mainnet-beta', WALLET, POSITION, 100);

    expect(result.data?.baseTokenAmountRemoved).toBe(2);
    expect(result.data?.quoteTokenAmountRemoved).toBe(3);
  });

  it('adds the fee back to the native side', async () => {
    setup(NATIVE_MINT, { [NATIVE_MINT.toBase58()]: 'WSOL', [USDC.toBase58()]: 'USDC' });

    const result = await removeLiquidity('mainnet-beta', WALLET, POSITION, 100);

    expect(result.data?.baseTokenAmountRemoved).toBe(2 + FEE);
  });
});
