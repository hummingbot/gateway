/**
 * The same rule as on Solana: a balance is reported under the name it was asked for with.
 * A token asked for by its address is under that address exactly as sent, one asked for by
 * symbol under the token list's symbol, and each entry says which token it is.
 */
import { BigNumber } from 'ethers';

import { Ethereum } from '../../../src/chains/ethereum/ethereum';
import { balanceResponse } from '../../../src/chains/wallet-balances';

const OWNER = '0x1111111111111111111111111111111111111111';
const USDC = { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 };
const WETH = { symbol: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 };

const ethereumHolding = (held: Record<string, string>) => {
  const instance = Object.create(Ethereum.prototype);
  instance.nativeTokenSymbol = 'ETH';
  instance.isHardwareWallet = jest.fn().mockResolvedValue(false);
  instance.getWallet = jest.fn().mockResolvedValue({});
  instance.getNativeBalance = jest.fn().mockResolvedValue({ value: BigNumber.from(10).pow(18), decimals: 18 });
  instance.getToken = jest.fn(async (name: string) =>
    [USDC, WETH].find((t) => t.symbol === name.toUpperCase() || t.address.toLowerCase() === name.toLowerCase()),
  );
  instance.getContract = jest.fn((address: string) => ({ address }));
  instance.getERC20Balance = jest.fn(async (contract: { address: string }, _wallet, decimals: number) => ({
    value: BigNumber.from(held[contract.address] ?? '0'),
    decimals,
  }));
  return instance as Ethereum;
};

describe('Ethereum getBalances by address', () => {
  const holding = () => ethereumHolding({ [USDC.address]: '5000000', [WETH.address]: '250000000000000000' });

  it('reports an address under the address exactly as sent', async () => {
    const lower = USDC.address.toLowerCase();

    expect(await holding().getBalances(OWNER, [lower])).toEqual({ ETH: 1, [lower]: 5 });
  });

  it('reports a symbol under the token list symbol, whatever its case', async () => {
    expect(await holding().getBalances(OWNER, ['usdc'])).toEqual({ ETH: 1, USDC: 5 });
  });

  it('keeps native and wrapped apart, and says which token each entry is', async () => {
    const entries = await holding().getTokenBalances(OWNER, ['ETH', WETH.address, 'USDC', 'NOT-A-TOKEN']);

    expect(balanceResponse(entries)).toEqual({
      balances: { ETH: 1, [WETH.address]: 0.25, USDC: 5, 'NOT-A-TOKEN': 0 },
      tokens: [
        { key: 'ETH', symbol: 'ETH', address: null, balance: 1 },
        { key: WETH.address, symbol: 'WETH', address: WETH.address, balance: 0.25 },
        { key: 'USDC', symbol: 'USDC', address: USDC.address, balance: 5 },
      ],
    });
  });
});
