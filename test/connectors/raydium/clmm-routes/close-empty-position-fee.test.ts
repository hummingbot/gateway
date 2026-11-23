import BN from 'bn.js';

import { Solana } from '../../../../src/chains/solana/solana';
import { closePosition } from '../../../../src/connectors/raydium/clmm-routes/closePosition';
import { Raydium } from '../../../../src/connectors/raydium/raydium';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/raydium/raydium');

// Closing a position that holds no liquidity reports the network fee in SOL. The fee is
// lamports / 1e9, which must not pick up floating-point noise (issue #752).

const WALLET = '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5';
const POSITION = 'ARwi1S4DaiTG5DX7S4M4ZsrXqpMD1MrTmbu9ue2tpmEq';

describe('raydium CLMM closePosition of an empty position', () => {
  it('reports the fee as the exact decimal SOL value', async () => {
    (Raydium.getInstance as jest.Mock).mockResolvedValue({
      setOwner: jest.fn(),
      getClmmPosition: jest.fn().mockResolvedValue({ poolId: { toBase58: () => 'pool' }, liquidity: new BN(0) }),
      getClmmPoolfromAPI: jest.fn().mockResolvedValue([{}, {}]),
      raydiumSDK: { clmm: { closePosition: jest.fn().mockResolvedValue({ transaction: {} }) } },
    });
    (Solana.getInstance as jest.Mock).mockResolvedValue({
      estimateGasPrice: jest.fn().mockResolvedValue(0.001),
      sendAndConfirmTransactionForWallet: jest.fn().mockResolvedValue({ signature: 'close-sig' }),
      getConfirmedTransactionData: jest.fn().mockResolvedValue({ meta: { fee: 230919729 } }),
      extractBalanceChangesAndFee: jest.fn().mockResolvedValue({ balanceChanges: [0.002] }),
    });

    const result = await closePosition('mainnet-beta', WALLET, POSITION);

    expect(result.data?.fee).toBe(0.230919729);
  });
});
