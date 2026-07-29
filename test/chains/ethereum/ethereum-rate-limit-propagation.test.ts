import { BigNumber } from 'ethers';

import { Ethereum } from '../../../src/chains/ethereum/ethereum';

jest.mock('../../../src/services/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  redactUrl: jest.fn((url: string) => url),
}));

const address = '0x0000000000000000000000000000000000000001';
const tokenAddress = '0x0000000000000000000000000000000000000002';

const rateLimitError = () => {
  const error = new Error('Too many requests');
  (error as any).statusCode = 429;
  (error as any).name = 'TooManyRequestsError';
  return error;
};

const ethereumStub = (overrides: Record<string, any>) => Object.assign(Object.create(Ethereum.prototype), overrides);

const callGetBalances = (stub: any, tokens?: string[]) =>
  (Ethereum.prototype as any).getBalances.call(stub, address, tokens);

describe('Ethereum Rate Limit Error Propagation', () => {
  describe('provider read methods', () => {
    it('should propagate 429 error from getNativeBalanceByAddress', async () => {
      const error429 = rateLimitError();
      const stub = {
        provider: { getBalance: jest.fn().mockRejectedValue(error429) },
      };

      await expect((Ethereum.prototype as any).getNativeBalanceByAddress.call(stub, address)).rejects.toMatchObject({
        statusCode: 429,
      });
    });

    it('should propagate 429 error from getTransaction', async () => {
      const error429 = rateLimitError();
      const stub = {
        provider: { getTransaction: jest.fn().mockRejectedValue(error429) },
      };

      await expect((Ethereum.prototype as any).getTransaction.call(stub, '0xabc')).rejects.toMatchObject({
        statusCode: 429,
      });
    });

    it('should propagate 429 error from getTransactionReceipt', async () => {
      const error429 = rateLimitError();
      const stub = {
        provider: { getTransactionReceipt: jest.fn().mockRejectedValue(error429) },
      };

      await expect((Ethereum.prototype as any).getTransactionReceipt.call(stub, '0xabc')).rejects.toMatchObject({
        statusCode: 429,
      });
    });

    it('should propagate 429 error from getCurrentBlockNumber', async () => {
      const error429 = rateLimitError();
      const stub = {
        provider: { getBlockNumber: jest.fn().mockRejectedValue(error429) },
      };

      await expect((Ethereum.prototype as any).getCurrentBlockNumber.call(stub)).rejects.toMatchObject({
        statusCode: 429,
      });
    });
  });

  describe('getBalances', () => {
    it('should propagate 429 error from native balance reads', async () => {
      const error429 = rateLimitError();
      const stub = ethereumStub({
        nativeTokenSymbol: 'ETH',
        isHardwareWallet: jest.fn().mockResolvedValue(true),
        getNativeBalanceByAddress: jest.fn().mockRejectedValue(error429),
      });

      await expect(callGetBalances(stub, ['ETH'])).rejects.toMatchObject({ statusCode: 429 });
    });

    it('should propagate 429 error from token balance reads', async () => {
      const error429 = rateLimitError();
      const contract = { balanceOf: jest.fn().mockRejectedValue(error429) };
      const stub = ethereumStub({
        nativeTokenSymbol: 'ETH',
        provider: {},
        isHardwareWallet: jest.fn().mockResolvedValue(true),
        getNativeBalanceByAddress: jest
          .fn()
          .mockResolvedValue({ value: BigNumber.from('1000000000000000000'), decimals: 18 }),
        getToken: jest.fn().mockResolvedValue({ chainId: 1, address: tokenAddress, symbol: 'USDC', decimals: 6 }),
        getContract: jest.fn().mockReturnValue(contract),
      });

      await expect(callGetBalances(stub, ['USDC'])).rejects.toMatchObject({ statusCode: 429 });
    });

    it('should still return zero for non-rate-limit token balance errors', async () => {
      const contract = { balanceOf: jest.fn().mockRejectedValue(new Error('token read failed')) };
      const stub = ethereumStub({
        nativeTokenSymbol: 'ETH',
        provider: {},
        isHardwareWallet: jest.fn().mockResolvedValue(true),
        getNativeBalanceByAddress: jest
          .fn()
          .mockResolvedValue({ value: BigNumber.from('1000000000000000000'), decimals: 18 }),
        getToken: jest.fn().mockResolvedValue({ chainId: 1, address: tokenAddress, symbol: 'USDC', decimals: 6 }),
        getContract: jest.fn().mockReturnValue(contract),
      });

      await expect(callGetBalances(stub, ['USDC'])).resolves.toEqual({ ETH: 1, USDC: 0 });
    });
  });

  describe('handleTransactionExecution', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should propagate 429 error during extended receipt polling', async () => {
      const error429 = rateLimitError();
      const stub = {
        _transactionExecutionTimeoutMs: 30_000,
        getTransactionReceipt: jest.fn().mockRejectedValue(error429),
      };
      const tx = {
        hash: '0xabc',
        wait: jest.fn().mockReturnValue(new Promise(() => {})),
      };

      const promise = (Ethereum.prototype as any).handleTransactionExecution.call(stub, tx);
      const assertion = expect(promise).rejects.toMatchObject({ statusCode: 429 });
      await jest.advanceTimersByTimeAsync(30_000);
      await jest.advanceTimersByTimeAsync(5_000);

      await assertion;
    });
  });
});
