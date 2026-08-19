import { Token } from '@uniswap/sdk-core';
import { BigNumber } from 'ethers';

import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { Uniswap } from '../../../../src/connectors/uniswap/uniswap';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/ethereum/ethereum');
jest.mock('../../../../src/connectors/uniswap/uniswap');
jest.mock('@ethersproject/contracts');

// Route-level contract for an EVM CLMM liquidity route once the transaction has been sent.
// collect-fees stands in for every route on the shared confirmation gate: the amounts in its
// `data` are read BEFORE sending, so reporting them for anything but a confirmed transaction
// books tokens that never moved.
//
// Pinned here:
//   - still pending  -> 200 { signature, status: 0 } and NO data (used to be a TypeError on a
//                       null receipt, turned into a 500 that threw the tx hash away).
//   - reverted       -> 400 TRANSACTION_FAILED with no amounts (used to be status 0 == PENDING
//                       alongside the pre-send fee amounts, which a poller waits on forever).
//   - confirmed      -> 200 { status: 1, data } with the gas fee from the receipt.

const WETH = new Token(8453, '0x4200000000000000000000000000000000000006', 18, 'WETH', 'Wrapped Ether');
const USDC = new Token(8453, '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', 6, 'USDC', 'USD Coin');
const mockWallet = '0x0000000000000000000000000000000000000001';
const positionAddress = '1234';
const txHash = '0x1111111111111111111111111111111111111111111111111111111111111111';

// The real confirmation helper, bound to the stubbed instance, so these tests exercise the
// gate itself rather than a mock of it.
const { Ethereum: RealEthereum } = jest.requireActual('../../../../src/chains/ethereum/ethereum');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { collectFeesRoute } = await import('../../../../src/trading/trading-clmm-routes/collect-fees');
  await server.register(collectFeesRoute);
  return server;
};

/** Wire the Uniswap/Ethereum/Contract stubs so the route reaches the confirmation gate. */
const primeMocks = (receipt: any) => {
  (Uniswap.getInstance as jest.Mock).mockResolvedValue({
    checkNFTOwnership: jest.fn().mockResolvedValue(undefined),
    getToken: jest.fn((address: string) =>
      Promise.resolve(address.toLowerCase() === WETH.address.toLowerCase() ? WETH : USDC),
    ),
  });

  const ethereum: any = {
    provider: {},
    getWallet: jest.fn().mockResolvedValue({ address: mockWallet }),
    prepareGasOptions: jest.fn().mockResolvedValue({}),
    handleTransactionExecution: jest.fn().mockResolvedValue(receipt),
  };
  ethereum.handleTransactionConfirmation = RealEthereum.prototype.handleTransactionConfirmation.bind(ethereum);
  (Ethereum.getInstance as jest.Mock).mockResolvedValue(ethereum);
  (Ethereum.getWalletAddressExample as jest.Mock).mockResolvedValue(mockWallet);

  const { Contract } = require('@ethersproject/contracts');
  (Contract as jest.Mock).mockImplementation(() => ({
    positions: jest.fn().mockResolvedValue({
      token0: WETH.address,
      token1: USDC.address,
      tokensOwed0: BigNumber.from('1000000000000000'), // 0.001 WETH
      tokensOwed1: BigNumber.from('2000000'), // 2 USDC
    }),
    multicall: jest.fn().mockResolvedValue({ hash: txHash }),
  }));
};

const collect = (server: any) =>
  server.inject({
    method: 'POST',
    url: '/collect-fees',
    payload: { chainNetwork: 'ethereum-base', connector: 'uniswap', walletAddress: mockWallet, positionAddress },
  });

describe('POST /collect-fees (Uniswap V3 CLMM) — transaction confirmation', () => {
  let server: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    (Ethereum.getWalletAddressExample as jest.Mock) = jest.fn().mockResolvedValue(mockWallet);
    server = await buildApp();
  });

  afterEach(async () => {
    await server.close();
  });

  it('returns the pending shape with the tx hash when the receipt is still missing', async () => {
    primeMocks(null);

    const response = await collect(server);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.signature).toBe(txHash);
    expect(body.status).toBe(0); // TransactionStatus.PENDING
    // No fabricated amounts: nothing has been collected yet.
    expect(body.data).toBeUndefined();
  });

  it('fails loudly (400 TRANSACTION_FAILED) on a revert instead of reporting PENDING with amounts', async () => {
    primeMocks({
      status: 0,
      transactionHash: txHash,
      gasUsed: BigNumber.from(21_000),
      effectiveGasPrice: BigNumber.from('1000000000'),
    });

    const response = await collect(server);

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.message).toContain(txHash);
    expect(body.message).toMatch(/reverted on-chain/);
    // The pre-send fee amounts must not appear anywhere in the response.
    expect(response.body).not.toContain('baseFeeAmountCollected');
  });

  it('returns the confirmed shape with the receipt gas fee', async () => {
    primeMocks({
      status: 1,
      transactionHash: txHash,
      logs: [],
      gasUsed: BigNumber.from(21_000),
      effectiveGasPrice: BigNumber.from('1000000000'),
    });

    const response = await collect(server);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.signature).toBe(txHash);
    expect(body.status).toBe(1); // TransactionStatus.CONFIRMED
    expect(body.data.fee).toBe(0.000021);
    expect(body.data.baseFeeAmountCollected).toBe(0.001);
    expect(body.data.quoteFeeAmountCollected).toBe(2);
  });
});
