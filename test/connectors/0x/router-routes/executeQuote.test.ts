import { BigNumber, providers } from 'ethers';

import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { ZeroX } from '../../../../src/connectors/0x/0x';
import { quoteCache } from '../../../../src/services/quote-cache';
import { TokenService } from '../../../../src/services/token-service';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/ethereum/ethereum');
jest.mock('../../../../src/connectors/0x/0x');
jest.mock('../../../../src/services/token-service');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { executeQuoteRoute } = await import('../../../../src/connectors/0x/router-routes/executeQuote');
  await server.register(executeQuoteRoute);
  return server;
};

const mockWETH = {
  symbol: 'WETH',
  address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  decimals: 18,
  name: 'Wrapped Ether',
};

const mockUSDC = {
  symbol: 'USDC',
  address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  decimals: 6,
  name: 'USD Coin',
};

const mockWallet = {
  address: '0x1234567890123456789012345678901234567890',
  sendTransaction: jest.fn(),
};

const mockTransaction = {
  hash: '0xabcdef1234567890',
  wait: jest.fn(),
};

const mockReceipt = {
  transactionHash: '0xabcdef1234567890',
  status: 1,
  gasUsed: BigNumber.from('200000'),
  effectiveGasPrice: BigNumber.from('30000000000'), // 30 gwei
};

const mockQuoteData = {
  chainId: 1,
  price: '1500',
  estimatedPriceImpact: '0.001',
  value: '0',
  gasPrice: '30000000000',
  gas: '200000',
  estimatedGas: '200000',
  protocolFee: '0',
  minimumProtocolFee: '0',
  buyTokenAddress: mockUSDC.address,
  buyAmount: '150000000',
  sellTokenAddress: mockWETH.address,
  sellAmount: '100000000000000000',
  sources: [],
  allowanceTarget: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
  sellTokenToEthRate: '1',
  buyTokenToEthRate: '0.0006666',
  expectedSlippage: null,
  // Quote-specific fields
  guaranteedPrice: '1500',
  to: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
  data: '0x1234567890',
  orders: [],
  fees: {
    zeroExFee: {
      feeType: 'none',
      feeToken: '0x0',
      feeAmount: '0',
      billingType: 'none',
    },
  },
  auxiliaryChainData: {},
} as any;

describe('POST /execute-quote', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    quoteCache.clear();

    // Mock TokenService
    const mockTokenService = {
      getToken: jest.fn().mockImplementation(async (_chain, _network, addressOrSymbol) => {
        // Handle both address and symbol lookups
        const addressLower = addressOrSymbol.toLowerCase();
        if (addressLower === mockWETH.address.toLowerCase() || addressOrSymbol === 'WETH') {
          return Promise.resolve(mockWETH);
        }
        if (addressLower === mockUSDC.address.toLowerCase() || addressOrSymbol === 'USDC') {
          return Promise.resolve(mockUSDC);
        }
        return Promise.resolve(null);
      }),
    };
    (TokenService.getInstance as jest.Mock).mockReturnValue(mockTokenService);
  });

  it('should execute a previously fetched quote', async () => {
    const quoteId = 'test-quote-id';
    quoteCache.set(quoteId, mockQuoteData);

    mockWallet.sendTransaction.mockResolvedValue(mockTransaction);
    mockTransaction.wait.mockResolvedValue(mockReceipt);

    const mockEthereumInstance = {
      getWallet: jest.fn().mockResolvedValue(mockWallet),
      getContract: jest.fn().mockReturnValue({}),
      getERC20Allowance: jest.fn().mockResolvedValue({
        value: BigNumber.from('1000000000000000000'),
        decimals: 18,
      }),
      nativeTokenSymbol: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      getToken: jest.fn().mockImplementation((symbolOrAddress) => {
        if (symbolOrAddress.toLowerCase() === mockWETH.address.toLowerCase() || symbolOrAddress === 'WETH')
          return mockWETH;
        if (symbolOrAddress.toLowerCase() === mockUSDC.address.toLowerCase() || symbolOrAddress === 'USDC')
          return mockUSDC;
        return null;
      }),
      getTokenByAddress: jest.fn().mockImplementation((address) => {
        if (address === mockWETH.address) return mockWETH;
        if (address === mockUSDC.address) return mockUSDC;
        return null;
      }),
      handleTransactionExecution: jest.fn().mockImplementation((tx) => {
        return {
          transactionHash: tx.hash,
          blockHash: '',
          blockNumber: null,
          transactionIndex: null,
          from: tx.from,
          to: tx.to || null,
          cumulativeGasUsed: BigNumber.from(0),
          gasUsed: BigNumber.from(0),
          contractAddress: null,
          logs: [],
          logsBloom: '',
          status: 1,
          effectiveGasPrice: BigNumber.from(0),
        } as providers.TransactionReceipt;
      }),
      handleExecuteQuoteTransactionConfirmation: jest
        .fn()
        .mockImplementation((txReceipt, inputToken, outputToken, amountIn, amountOut) => {
          if (!txReceipt) {
            return { signature: '', status: 0 };
          }
          return {
            signature: txReceipt.transactionHash,
            status: txReceipt.status,
            data: {
              tokenIn: inputToken,
              tokenOut: outputToken,
              amountIn,
              amountOut,
              fee: 0.006,
              baseTokenBalanceChange: 0,
              quoteTokenBalanceChange: 0,
            },
          };
        }),
    };
    (Ethereum.getInstance as jest.Mock).mockResolvedValue(mockEthereumInstance);
    (Ethereum.getWalletAddressExample as jest.Mock).mockResolvedValue('0x1234567890123456789012345678901234567890');

    const mockZeroXInstance = {
      formatTokenAmount: jest
        .fn()
        .mockReturnValueOnce('0.1') // sellAmount (amountIn)
        .mockReturnValueOnce('150'), // buyAmount (amountOut)
    };
    (ZeroX.getInstance as jest.Mock).mockResolvedValue(mockZeroXInstance);

    const response = await server.inject({
      method: 'POST',
      url: '/execute-quote',
      payload: {
        network: 'mainnet',
        walletAddress: '0x1234567890123456789012345678901234567890',
        quoteId: quoteId,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('signature', mockReceipt.transactionHash);
    expect(body).toHaveProperty('status', 1);
    expect(body.data).toHaveProperty('amountIn', 0.1);
    expect(body.data).toHaveProperty('amountOut', 150);
    expect(body.data).toHaveProperty('fee', 0.006);
    expect(body.data).toHaveProperty('baseTokenBalanceChange', 0);
    expect(body.data).toHaveProperty('quoteTokenBalanceChange', 0);
    expect(body.data).toHaveProperty('tokenIn', mockWETH.address);
    expect(body.data).toHaveProperty('tokenOut', mockUSDC.address);
  });

  it('should return 400 if quote not found', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/execute-quote',
      payload: {
        network: 'mainnet',
        walletAddress: '0x1234567890123456789012345678901234567890',
        quoteId: 'non-existent-quote',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toHaveProperty('error');
  });

  it('should throw error if allowance is insufficient', async () => {
    const quoteId = 'test-quote-id';
    quoteCache.set(quoteId, mockQuoteData);

    mockWallet.sendTransaction.mockResolvedValue(mockTransaction);
    mockTransaction.wait.mockResolvedValue(mockReceipt);

    const mockEthereumInstance = {
      getWallet: jest.fn().mockResolvedValue(mockWallet),
      getContract: jest.fn().mockReturnValue({}),
      getERC20Allowance: jest.fn().mockResolvedValue({ value: BigNumber.from('0') }),
      approveERC20: jest.fn().mockResolvedValue({}),
      nativeTokenSymbol: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      getToken: jest.fn().mockImplementation((symbolOrAddress) => {
        if (symbolOrAddress.toLowerCase() === mockWETH.address.toLowerCase() || symbolOrAddress === 'WETH')
          return mockWETH;
        if (symbolOrAddress.toLowerCase() === mockUSDC.address.toLowerCase() || symbolOrAddress === 'USDC')
          return mockUSDC;
        return null;
      }),
      getTokenByAddress: jest.fn().mockImplementation((address) => {
        if (address === mockWETH.address) return mockWETH;
        if (address === mockUSDC.address) return mockUSDC;
        return null;
      }),
      handleExecuteQuoteTransactionConfirmation: jest
        .fn()
        .mockImplementation((txReceipt, inputToken, outputToken, amountIn, amountOut) => {
          if (!txReceipt) {
            return { signature: '', status: 0 };
          }
          return {
            signature: txReceipt.transactionHash,
            status: txReceipt.status,
            data: {
              tokenIn: inputToken,
              tokenOut: outputToken,
              amountIn,
              amountOut,
              fee: 0.006,
              baseTokenBalanceChange: 0,
              quoteTokenBalanceChange: 0,
            },
          };
        }),
    };
    (Ethereum.getInstance as jest.Mock).mockResolvedValue(mockEthereumInstance);

    const mockZeroXInstance = {
      formatTokenAmount: jest.fn().mockReturnValue('0.1'),
    };
    (ZeroX.getInstance as jest.Mock).mockResolvedValue(mockZeroXInstance);

    const response = await server.inject({
      method: 'POST',
      url: '/execute-quote',
      payload: {
        network: 'mainnet',
        walletAddress: '0x1234567890123456789012345678901234567890',
        quoteId: quoteId,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.message).toContain('Insufficient allowance');
    expect(mockEthereumInstance.approveERC20).not.toHaveBeenCalled();
  });
});
