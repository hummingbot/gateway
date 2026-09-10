import { Token } from '@uniswap/sdk-core';
import { Pool, TickMath } from '@uniswap/v3-sdk';
import { BigNumber } from 'ethers';

import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { getPositionsOwned } from '../../../../src/connectors/uniswap/clmm-routes/positionsOwned';
import { Uniswap } from '../../../../src/connectors/uniswap/uniswap';

jest.mock('../../../../src/chains/ethereum/ethereum');
jest.mock('../../../../src/connectors/uniswap/uniswap');
jest.mock('@ethersproject/contracts', () => ({ Contract: jest.fn() }));

// `positions-owned` answers "what does this wallet hold". Two ways it used to lie:
//
//  1. It skipped zero-liquidity positions. The NFT is still owned and still counted by
//     balanceOf, so a wallet holding four drained-but-unburned positions got back an empty
//     array. Real case: 0xfC17…0313 on Ethereum mainnet owns v3 token ids 390655, 465081,
//     622939 and 638201, all with liquidity 0 — balanceOf says 4, the route said 0.
//  2. It caught per-position read failures, logged a warning, and returned the rest. An RPC
//     hiccup on one position became indistinguishable from that position not existing, and
//     callers size new exposure against that list.

const WALLET = '0xfC17747C89E93E2deeAdA88419e857a907A20313';
const WETH = new Token(1, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 18, 'WETH', 'Wrapped Ether');
const HBOT = new Token(1, '0xE5097D9baeAFB89f9bcB78C9290d545dB5f9e9CB', 18, 'HBOT', 'Hummingbot');
const TICK_CURRENT = 120000;

const fastify = {
  httpErrors: {
    badRequest: (m: string) => new Error(m),
    internalServerError: (m: string) => new Error(m),
  },
} as any;

/** A drained-but-unburned v3 position: liquidity 0, nothing owed. */
const drainedPosition = {
  token0: WETH.address,
  token1: HBOT.address,
  fee: 3000,
  tickLower: 101280,
  tickUpper: 138180,
  liquidity: BigNumber.from(0),
  tokensOwed0: BigNumber.from(0),
  tokensOwed1: BigNumber.from(0),
};

const primeMocks = ({ balance, positions }: { balance: number; positions: (typeof drainedPosition | Error)[] }) => {
  (Ethereum.getInstance as jest.Mock).mockResolvedValue({ provider: {} });
  (Uniswap.getInstance as jest.Mock).mockResolvedValue({
    getToken: jest.fn(async (address: string) => (address === WETH.address ? WETH : HBOT)),
    getV3Pool: jest.fn(
      async () => new Pool(WETH, HBOT, 3000, TickMath.getSqrtRatioAtTick(TICK_CURRENT).toString(), '1', TICK_CURRENT),
    ),
  });

  const { Contract } = jest.requireMock('@ethersproject/contracts');
  Contract.mockImplementation(() => ({
    balanceOf: async () => BigNumber.from(balance),
    tokenOfOwnerByIndex: async (_owner: string, index: number) => BigNumber.from(390655 + index),
    positions: async (tokenId: BigNumber) => {
      const entry = positions[tokenId.toNumber() - 390655];
      if (entry instanceof Error) throw entry;
      return entry;
    },
  }));
};

describe('uniswap clmm positions-owned completeness', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reports zero-liquidity positions instead of dropping them', async () => {
    primeMocks({ balance: 4, positions: Array(4).fill(drainedPosition) });

    const result = await getPositionsOwned(fastify, 'mainnet', WALLET);

    // balanceOf said 4, so the route must return 4 — not an empty array.
    expect(result).toHaveLength(4);
    expect(result.map((p) => p.address)).toEqual(['390655', '390656', '390657', '390658']);
    expect(result.every((p) => p.baseTokenAmount === 0 && p.quoteTokenAmount === 0)).toBe(true);
  });

  it('throws rather than returning a silently short list when a read fails', async () => {
    primeMocks({
      balance: 3,
      positions: [drainedPosition, new Error('call revert exception'), drainedPosition],
    });

    await expect(getPositionsOwned(fastify, 'mainnet', WALLET)).rejects.toThrow(/Failed to read position 2 of 3/);
  });
});
