import { BigNumber } from 'ethers';

import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { ZeroX } from '../../../../src/connectors/0x/0x';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/ethereum/ethereum');
jest.mock('../../../../src/connectors/0x/0x');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { executeSwapRoute } = await import(
    '../../../../src/connectors/0x/router-routes/executeSwap'
  );
  await server.register(executeSwapRoute);
  return server;
};

const mockWETH = {
  symbol: 'WETH',
  address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  decimals: 18,
};

const mockUSDC = {
  symbol: 'USDC',
  address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  decimals: 6,
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

const mockQuoteResponse = {
  sellToken: mockWETH.address,
  buyToken: mockUSDC.address,
  sellAmount: '100000000000000000',
  buyAmount: '150000000',
  allowanceTarget: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
  to: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
  data: '0x1234567890',
  value: '0',
  gas: '200000',
};

describe('POST /execute-swap', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should quote and execute a swap in one step for SELL side', async () => {
    mockWallet.sendTransaction.mockResolvedValue(mockTransaction);
    mockTransaction.wait.mockResolvedValue(mockReceipt);

    const mockEthereumInstance = {
      getWallet: jest.fn().mockResolvedValue(mockWallet),
      getTokenBySymbol: jest
        .fn()
        .mockResolvedValueOnce(mockWETH)
        .mockResolvedValueOnce(mockUSDC),
      getContract: jest.fn().mockReturnValue({}),
      getERC20Allowance: jest.fn().mockResolvedValue({
        value: BigNumber.from('1000000000000000000'),
        decimals: 18,
      }),
      nativeTokenSymbol: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    };
    (Ethereum.getInstance as jest.Mock).mockResolvedValue(mockEthereumInstance);
    (Ethereum.getWalletAddressExample as jest.Mock).mockResolvedValue(
      '0x1234567890123456789012345678901234567890',
    );

    const mockZeroXInstance = {
      parseTokenAmount: jest.fn().mockReturnValue('100000000000000000'),
      formatTokenAmount: jest
        .fn()
        .mockReturnValueOnce('0.006') // fee
        .mockReturnValueOnce('0.1') // sellAmount
        .mockReturnValueOnce('150'), // buyAmount
      convertSlippageToPercentage: jest.fn().mockReturnValue(0.005),
      getQuote: jest.fn().mockResolvedValue(mockQuoteResponse),
    };
    (ZeroX.getInstance as jest.Mock).mockResolvedValue(mockZeroXInstance);

    const response = await server.inject({
      method: 'POST',
      url: '/execute-swap',
      payload: {
        network: 'mainnet',
        walletAddress: '0x1234567890123456789012345678901234567890',
        baseToken: 'WETH',
        quoteToken: 'USDC',
        amount: 0.1,
        side: 'SELL',
        slippagePct: 0.5,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('signature', mockReceipt.transactionHash);
    expect(body).toHaveProperty('status', 1);
    expect(body.data).toHaveProperty('amountIn', 0.1);
    expect(body.data).toHaveProperty('amountOut', 150);
    expect(body.data).toHaveProperty('fee', 0.006);
    expect(body.data).toHaveProperty('baseTokenBalanceChange', -0.1);
    expect(body.data).toHaveProperty('quoteTokenBalanceChange', 150);
    expect(body.data).toHaveProperty('tokenIn', mockWETH.address);
    expect(body.data).toHaveProperty('tokenOut', mockUSDC.address);
  });

  it('should quote and execute a swap for BUY side', async () => {
    mockWallet.sendTransaction.mockResolvedValue(mockTransaction);
    mockTransaction.wait.mockResolvedValue(mockReceipt);

    const mockEthereumInstance = {
      getWallet: jest.fn().mockResolvedValue(mockWallet),
      getTokenBySymbol: jest
        .fn()
        .mockResolvedValueOnce(mockWETH)
        .mockResolvedValueOnce(mockUSDC),
      getContract: jest.fn().mockReturnValue({}),
      getERC20Allowance: jest.fn().mockResolvedValue({
        value: BigNumber.from('1000000000000000000'),
        decimals: 18,
      }),
      nativeTokenSymbol: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    };
    (Ethereum.getInstance as jest.Mock).mockResolvedValue(mockEthereumInstance);

    const mockZeroXInstance = {
      parseTokenAmount: jest.fn().mockReturnValue('100000000000000000'),
      formatTokenAmount: jest
        .fn()
        .mockReturnValueOnce('0.006') // fee
        .mockReturnValueOnce('0.1') // buyAmount (baseToken for BUY side)
        .mockReturnValueOnce('150'), // sellAmount (quoteToken for BUY side)
      convertSlippageToPercentage: jest.fn().mockReturnValue(0.005),
      getQuote: jest.fn().mockResolvedValue({
        ...mockQuoteResponse,
        sellToken: mockUSDC.address,
        buyToken: mockWETH.address,
        sellAmount: '150000000',
        buyAmount: '100000000000000000',
      }),
    };
    (ZeroX.getInstance as jest.Mock).mockResolvedValue(mockZeroXInstance);

    const response = await server.inject({
      method: 'POST',
      url: '/execute-swap',
      payload: {
        network: 'mainnet',
        walletAddress: '0x1234567890123456789012345678901234567890',
        baseToken: 'WETH',
        quoteToken: 'USDC',
        amount: 0.1,
        side: 'BUY',
        slippagePct: 0.5,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('signature', mockReceipt.transactionHash);
    expect(body).toHaveProperty('status', 1);
    expect(body.data).toHaveProperty('amountIn', 150);
    expect(body.data).toHaveProperty('amountOut', 0.1);
    expect(body.data).toHaveProperty('tokenIn', mockUSDC.address);
    expect(body.data).toHaveProperty('tokenOut', mockWETH.address);
  });

  it('should return 400 if token not found', async () => {
    const mockEthereumInstance = {
      getWallet: jest.fn(),
      getTokenBySymbol: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockUSDC),
    };
    (Ethereum.getInstance as jest.Mock).mockResolvedValue(mockEthereumInstance);

    const response = await server.inject({
      method: 'POST',
      url: '/execute-swap',
      payload: {
        network: 'mainnet',
        walletAddress: '0x1234567890123456789012345678901234567890',
        baseToken: 'INVALID',
        quoteToken: 'USDC',
        amount: 0.1,
        side: 'SELL',
        slippagePct: 0.5,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toHaveProperty('error');
  });
});
