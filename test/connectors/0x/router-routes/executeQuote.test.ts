import { BigNumber } from 'ethers';

import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { ZeroX } from '../../../../src/connectors/0x/0x';
import { quoteCache } from '../../../../src/services/quote-cache';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';
import { parseWire } from '../../../utils/wire';

jest.mock('../../../../src/chains/ethereum/ethereum');
jest.mock('../../../../src/connectors/0x/0x');

const RealZeroX = jest.requireActual('../../../../src/connectors/0x/0x').ZeroX;

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { executeQuoteRoute } = await import('../../../../src/trading/trading-router-routes/executeQuote');
  await server.register(executeQuoteRoute);
  return server;
};

const WALLET = '0x1234567890123456789012345678901234567890';
const QUOTE_ID = 'test-quote-id';

const mockWETH = { symbol: 'WETH', address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', decimals: 18 };
const mockUSDC = { symbol: 'USDC', address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6 };

// The fields of a 0x firm quote the execute path reads.
const mockQuoteData = {
  sellTokenAddress: mockWETH.address,
  sellAmount: '100000000000000000', // 0.1 WETH
  buyTokenAddress: mockUSDC.address,
  buyAmount: '150000000', // 150 USDC
  allowanceTarget: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
  to: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
  data: '0x1234567890',
  value: '0',
  gas: '250000',
  estimatedGas: '200000',
};

const mockEthereum = (allowance: string) => {
  const tokens: Record<string, any> = { [mockWETH.address]: mockWETH, [mockUSDC.address]: mockUSDC };
  const txResponse = { hash: '0xabcdef' };
  const txReceipt = { transactionHash: '0xabcdef', status: 1 };
  const wallet = { address: WALLET, sendTransaction: jest.fn().mockResolvedValue(txResponse) };
  const ethereum = {
    wallet,
    txResponse,
    txReceipt,
    nativeTokenSymbol: 'ETH',
    getWallet: jest.fn().mockResolvedValue(wallet),
    getContract: jest.fn().mockReturnValue({}),
    getToken: jest.fn(async (address: string) => tokens[address]),
    getERC20Allowance: jest.fn().mockResolvedValue({ value: BigNumber.from(allowance) }),
    approveERC20: jest.fn(),
    handleTransactionExecution: jest.fn().mockResolvedValue(txReceipt),
    handleExecuteQuoteTransactionConfirmation: jest.fn().mockReturnValue({ signature: '0xabcdef', status: 1 }),
  };
  (Ethereum.getInstance as jest.Mock).mockResolvedValue(ethereum);
  return ethereum;
};

const execute = (server: any, quoteId = QUOTE_ID) =>
  server.inject({
    method: 'POST',
    url: '/execute-quote',
    payload: { chainNetwork: 'ethereum-mainnet', connector: '0x', walletAddress: WALLET, quoteId },
  });

describe('POST /execute-quote (0x)', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    quoteCache.delete(QUOTE_ID);
    (ZeroX.getInstance as jest.Mock).mockResolvedValue({ formatTokenAmount: RealZeroX.prototype.formatTokenAmount });
  });

  it("sends the quote's transaction from the wallet and confirms it against the quoted amounts", async () => {
    quoteCache.set(QUOTE_ID, '0x', mockQuoteData, { slippagePct: 0.5 });
    const ethereum = mockEthereum('1000000000000000000');

    const response = await execute(server);

    expect(response.statusCode).toBe(200);
    // estimatedGas wins over gas as the limit.
    expect(ethereum.wallet.sendTransaction).toHaveBeenCalledWith({
      to: mockQuoteData.to,
      data: mockQuoteData.data,
      value: mockQuoteData.value,
      gasLimit: 200000,
    });
    expect(ethereum.handleTransactionExecution).toHaveBeenCalledWith(ethereum.txResponse);
    expect(ethereum.handleExecuteQuoteTransactionConfirmation).toHaveBeenCalledWith(
      ethereum.txReceipt,
      mockWETH.address,
      mockUSDC.address,
      0.1,
      150,
      undefined,
      undefined,
      0.5,
    );
    expect(parseWire(response.body)).toMatchObject({ signature: '0xabcdef', status: 1 });
    expect(quoteCache.get(QUOTE_ID, '0x')).toBeNull();
  });

  it('should return 400 if quote not found', async () => {
    const response = await execute(server, 'non-existent-quote');

    expect(response.statusCode).toBe(400);
    expect(parseWire(response.body).message).toBe('Quote not found or expired');
  });

  it('refuses to send when the allowance does not cover the sell amount, and does not approve', async () => {
    quoteCache.set(QUOTE_ID, '0x', mockQuoteData, { slippagePct: 0.5 });
    const ethereum = mockEthereum('0');

    const response = await execute(server);

    expect(response.statusCode).toBe(400);
    expect(parseWire(response.body).message).toBe('Insufficient allowance for WETH. Required: 0.1, Current: 0');
    expect(ethereum.approveERC20).not.toHaveBeenCalled();
    expect(ethereum.wallet.sendTransaction).not.toHaveBeenCalled();
  });
});
