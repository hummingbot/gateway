import { BigNumber } from 'ethers';

import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { Fibrous } from '../../../../src/connectors/fibrous/fibrous';
import { quoteCache } from '../../../../src/services/quote-cache';
import { FIBROUS_ROUTER_ADDRESS, mockUSDC, mockWETH } from '../../../mocks/fibrous/route.mock';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/ethereum/ethereum');
jest.mock('../../../../src/connectors/fibrous/fibrous');

const WALLET = '0x1234567890123456789012345678901234567890';
const TX_HASH = '0xabc123';

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { executeQuoteRoute } = await import('../../../../src/connectors/fibrous/router-routes/executeQuote');
  await server.register(executeQuoteRoute);
  return server;
};

const cachedQuote = (overrides: Record<string, any> = {}) => ({
  network: 'base',
  to: FIBROUS_ROUTER_ADDRESS,
  data: '0xdeadbeef',
  value: '0',
  gasEstimate: '500000',
  routerAddress: FIBROUS_ROUTER_ADDRESS,
  tokenIn: mockWETH,
  tokenOut: mockUSDC,
  amountIn: '1000000000000000000',
  amountOut: '1888000000',
  minReceived: '1869120000',
  expectedAmountIn: 1,
  expectedAmountOut: 1888,
  ...overrides,
});

const mockEthereumInstance = (overrides: Record<string, any> = {}) => {
  const sendTransaction = jest.fn().mockResolvedValue({ hash: TX_HASH });
  const instance = {
    getWallet: jest.fn().mockResolvedValue({ sendTransaction }),
    getContract: jest.fn().mockReturnValue({}),
    getERC20Allowance: jest.fn().mockResolvedValue({ value: BigNumber.from('10000000000000000000'), decimals: 18 }),
    handleTransactionExecution: jest.fn().mockResolvedValue({ status: 1, transactionHash: TX_HASH }),
    handleExecuteQuoteTransactionConfirmation: jest.fn().mockReturnValue({ signature: TX_HASH, status: 1 }),
    ...overrides,
  };
  (Ethereum.getInstance as jest.Mock).mockResolvedValue(instance);
  return { instance, sendTransaction };
};

describe('POST /execute-quote (fibrous)', () => {
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
    (Fibrous.getInstance as jest.Mock).mockResolvedValue({
      formatTokenAmount: jest.fn((amount: string, decimals: number) => (Number(amount) / 10 ** decimals).toString()),
    });
  });

  it('sends the cached calldata and clears the quote on success', async () => {
    const { sendTransaction } = mockEthereumInstance();
    quoteCache.set('quote-1', cachedQuote());

    const response = await server.inject({
      method: 'POST',
      url: '/execute-quote',
      payload: { walletAddress: WALLET, network: 'base', quoteId: 'quote-1' },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ signature: TX_HASH, status: 1 });
    expect(sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        to: FIBROUS_ROUTER_ADDRESS,
        data: '0xdeadbeef',
        gasLimit: 500000,
      }),
    );
    // Confirmed quotes are single-use
    expect(quoteCache.get('quote-1')).toBeNull();
  });

  it('rejects an unknown or expired quote', async () => {
    mockEthereumInstance();

    const response = await server.inject({
      method: 'POST',
      url: '/execute-quote',
      payload: { walletAddress: WALLET, network: 'base', quoteId: 'missing' },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toContain('Quote not found');
  });

  it('rejects when the router allowance is insufficient', async () => {
    mockEthereumInstance({
      getERC20Allowance: jest.fn().mockResolvedValue({ value: BigNumber.from('1'), decimals: 18 }),
    });
    quoteCache.set('quote-2', cachedQuote());

    const response = await server.inject({
      method: 'POST',
      url: '/execute-quote',
      payload: { walletAddress: WALLET, network: 'base', quoteId: 'quote-2' },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toContain('Insufficient allowance for WETH');
  });

  it('checks allowance against the router address', async () => {
    const { instance } = mockEthereumInstance();
    quoteCache.set('quote-3', cachedQuote());

    await server.inject({
      method: 'POST',
      url: '/execute-quote',
      payload: { walletAddress: WALLET, network: 'base', quoteId: 'quote-3' },
    });

    expect(instance.getERC20Allowance).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      FIBROUS_ROUTER_ADDRESS,
      mockWETH.decimals,
    );
  });

  it('skips the allowance check for native-coin inputs', async () => {
    const { instance } = mockEthereumInstance();
    quoteCache.set(
      'quote-4',
      cachedQuote({
        tokenIn: { ...mockWETH, symbol: 'ETH', address: '0x0000000000000000000000000000000000000000' },
        value: '1000000000000000000',
      }),
    );

    const response = await server.inject({
      method: 'POST',
      url: '/execute-quote',
      payload: { walletAddress: WALLET, network: 'base', quoteId: 'quote-4' },
    });

    expect(response.statusCode).toBe(200);
    expect(instance.getERC20Allowance).not.toHaveBeenCalled();
  });

  it('honours a maxGas override', async () => {
    const { sendTransaction } = mockEthereumInstance();
    quoteCache.set('quote-5', cachedQuote());

    await server.inject({
      method: 'POST',
      url: '/execute-quote',
      payload: { walletAddress: WALLET, network: 'base', quoteId: 'quote-5', maxGas: 900000 },
    });

    expect(sendTransaction).toHaveBeenCalledWith(expect.objectContaining({ gasLimit: 900000 }));
  });

  it('keeps the quote cached while the transaction is pending', async () => {
    mockEthereumInstance({
      handleExecuteQuoteTransactionConfirmation: jest.fn().mockReturnValue({ signature: TX_HASH, status: 0 }),
    });
    quoteCache.set('quote-6', cachedQuote());

    const response = await server.inject({
      method: 'POST',
      url: '/execute-quote',
      payload: { walletAddress: WALLET, network: 'base', quoteId: 'quote-6' },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).status).toBe(0);
    expect(quoteCache.get('quote-6')).not.toBeNull();
  });

  it('reports an on-chain failure as a server error', async () => {
    mockEthereumInstance({
      handleExecuteQuoteTransactionConfirmation: jest.fn().mockReturnValue({ signature: TX_HASH, status: -1 }),
    });
    quoteCache.set('quote-7', cachedQuote());

    const response = await server.inject({
      method: 'POST',
      url: '/execute-quote',
      payload: { walletAddress: WALLET, network: 'base', quoteId: 'quote-7' },
    });

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).message).toContain('Transaction failed on-chain');
  });
});
