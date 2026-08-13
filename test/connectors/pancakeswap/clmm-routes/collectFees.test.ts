import { Contract } from '@ethersproject/contracts';
import { BigNumber } from 'ethers';

import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { collectFees } from '../../../../src/connectors/pancakeswap/clmm-routes/collectFees';
import { Pancakeswap } from '../../../../src/connectors/pancakeswap/pancakeswap';
import PancakeswapV3MasterchefABI from '../../../../src/connectors/pancakeswap/PancakeswapV3Masterchef.abi.json';

const MockedContract = Contract as unknown as jest.Mock;

jest.mock('@ethersproject/contracts', () => ({
  Contract: jest.fn(),
}));

jest.mock('../../../../src/chains/ethereum/ethereum');
jest.mock('../../../../src/connectors/pancakeswap/pancakeswap', () => ({
  Pancakeswap: {
    getInstance: jest.fn(),
  },
}));
jest.mock('../../../../src/connectors/pancakeswap/clmm-routes/positionInfo', () => ({
  getPositionInfo: jest.fn(),
}));
jest.mock('../../../../src/services/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('collectFees staked MasterChef path', () => {
  const positionManagerAddress = '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364';
  const masterChefAddress = '0x556B9306565093C855AEA9AE92A594704c2Cd59e';
  const walletAddress = '0xA57d70a25847A7457ED75E4e04F8d00bf1BE33bC';
  const positionAddress = '7127086';
  const token0 = {
    symbol: 'USDT',
    address: '0x55d398326f99059fF775485246999027B3197955',
    decimals: 18,
  };
  const token1 = {
    symbol: 'SPCXB',
    address: '0xbe9D156892E55e7154BcD3cB0FEA677F9D3103E1',
    decimals: 18,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    const mockCollect = jest.fn().mockResolvedValue({ hash: '0xcollect' });
    let token0BalanceCalls = 0;
    let token1BalanceCalls = 0;

    MockedContract.mockImplementation((address: string, abi: any) => {
      const abiNames = Array.isArray(abi) ? abi.map((entry: any) => entry?.name).filter(Boolean) : [];

      if (address === positionManagerAddress && abiNames.includes('ownerOf')) {
        return {
          ownerOf: jest.fn().mockResolvedValue(masterChefAddress),
        };
      }

      if (address === positionManagerAddress && abiNames.includes('positions')) {
        return {
          positions: jest.fn().mockResolvedValue({
            token0: token0.address,
            token1: token1.address,
            tokensOwed0: BigNumber.from(0),
            tokensOwed1: BigNumber.from(0),
          }),
        };
      }

      if (address === token0.address && abiNames.includes('balanceOf')) {
        return {
          balanceOf: jest.fn().mockImplementation(async () => {
            token0BalanceCalls += 1;
            return BigNumber.from(token0BalanceCalls === 1 ? '100' : '175');
          }),
        };
      }

      if (address === token1.address && abiNames.includes('balanceOf')) {
        return {
          balanceOf: jest.fn().mockImplementation(async () => {
            token1BalanceCalls += 1;
            return BigNumber.from(token1BalanceCalls === 1 ? '200' : '260');
          }),
        };
      }

      if (address === masterChefAddress && abi === PancakeswapV3MasterchefABI) {
        return {
          collect: mockCollect,
        };
      }

      throw new Error(`Unexpected contract mock for ${address} with ABI names ${abiNames.join(',')}`);
    });

    (Pancakeswap.getInstance as jest.Mock).mockResolvedValue({
      getToken: jest.fn().mockResolvedValueOnce(token0).mockResolvedValueOnce(token1),
      unstakeNft: jest.fn(),
    });

    (Ethereum.getInstance as jest.Mock).mockResolvedValue({
      provider: {},
      getWallet: jest.fn().mockResolvedValue({ address: walletAddress }),
      prepareGasOptions: jest.fn().mockResolvedValue({ gasLimit: 500000 }),
      handleTransactionExecution: jest.fn().mockResolvedValue({
        transactionHash: '0xreceipt',
        status: 1,
        gasUsed: BigNumber.from('21000'),
        effectiveGasPrice: BigNumber.from('1'),
      }),
    });
  });

  it('uses MasterChef collect directly for staked NFTs and does not unstake first', async () => {
    const pancakeswap = await Pancakeswap.getInstance('bsc');

    const result = await collectFees('bsc', walletAddress, positionAddress);

    expect(pancakeswap.unstakeNft).not.toHaveBeenCalled();

    const masterChefInstance = MockedContract.mock.results
      .map((result) => result.value)
      .find((instance) => typeof instance.collect === 'function');

    expect(masterChefInstance.collect).toHaveBeenCalledWith(
      positionAddress,
      walletAddress,
      expect.anything(),
      expect.anything(),
      { gasLimit: 500000 },
    );

    expect(result.signature).toBe('0xreceipt');
    expect(result.data?.baseFeeAmountCollected).toBeGreaterThan(0);
    expect(result.data?.quoteFeeAmountCollected).toBeGreaterThan(0);
  });
});
