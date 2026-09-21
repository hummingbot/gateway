import { Token } from '@uniswap/sdk-core';
import { Pool, TickMath, encodeSqrtRatioX96, nearestUsableTick } from '@uniswap/v3-sdk';
import { BigNumber } from 'ethers';

import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { Uniswap } from '../../../../src/connectors/uniswap/uniswap';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';
import { parseWire } from '../../../utils/wire';

jest.mock('../../../../src/chains/ethereum/ethereum');
jest.mock('../../../../src/connectors/uniswap/uniswap');
jest.mock('@ethersproject/contracts');

// Route-level contract for the gas limit of a Uniswap V3 CLMM close (#629): the estimate is
// asked for the same multicall, calldata and value that are then sent, and the limit that
// reaches prepareGasOptions is the estimate with its margin, or the fixed 400k floor when the
// estimate is lower or fails.

const WETH = new Token(8453, '0x4200000000000000000000000000000000000006', 18, 'WETH', 'Wrapped Ether');
const USDC = new Token(8453, '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', 6, 'USDC', 'USD Coin');
const mockWallet = '0x0000000000000000000000000000000000000001';
const positionAddress = '1268766';
const txHash = '0x3333333333333333333333333333333333333333333333333333333333333333';
const FIXED_CLOSE_GAS_LIMIT = 400000;

const { Ethereum: RealEthereum } = jest.requireActual('../../../../src/chains/ethereum/ethereum');

/** A live WETH/USDC 0.3% pool at ~3000 USDC per WETH. */
const buildPool = () => {
  const sqrtRatioX96 = encodeSqrtRatioX96('3000000000', '1000000000000000000');
  return new Pool(WETH, USDC, 3000, sqrtRatioX96, '1000000000000', TickMath.getTickAtSqrtRatio(sqrtRatioX96));
};

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { closePositionRoute } = await import('../../../../src/trading/trading-clmm-routes/close');
  await server.register(closePositionRoute);
  return server;
};

/** Wire the stubs; returns the spies the assertions read. */
const primeMocks = (estimate: () => Promise<BigNumber>) => {
  const pool = buildPool();
  (Uniswap.getInstance as jest.Mock).mockResolvedValue({
    checkNFTOwnership: jest.fn().mockResolvedValue(undefined),
    getToken: jest.fn((address: string) =>
      Promise.resolve(address.toLowerCase() === WETH.address.toLowerCase() ? WETH : USDC),
    ),
    getV3Pool: jest.fn().mockResolvedValue(pool),
  });

  const ethereum: any = {
    provider: {},
    getWallet: jest.fn().mockResolvedValue({ address: mockWallet }),
    prepareGasOptions: jest.fn(async (_gasPrice: number | undefined, gasLimit: number) => ({ gasLimit })),
    handleTransactionExecution: jest.fn().mockResolvedValue({
      status: 1,
      transactionHash: txHash,
      logs: [],
      gasUsed: BigNumber.from(394011),
      effectiveGasPrice: BigNumber.from('1000000000'),
    }),
  };
  ethereum.handleTransactionConfirmation = RealEthereum.prototype.handleTransactionConfirmation.bind(ethereum);
  ethereum.gasLimitWithMargin = RealEthereum.prototype.gasLimitWithMargin.bind(ethereum);
  (Ethereum.getInstance as jest.Mock).mockResolvedValue(ethereum);
  (Ethereum.getWalletAddressExample as jest.Mock).mockResolvedValue(mockWallet);

  const estimateGas = { multicall: jest.fn((..._args: any[]) => estimate()) };
  const multicall = jest.fn().mockResolvedValue({ hash: txHash });
  const { Contract } = require('@ethersproject/contracts');
  (Contract as jest.Mock).mockImplementation(() => ({
    positions: jest.fn().mockResolvedValue({
      token0: WETH.address,
      token1: USDC.address,
      fee: 3000,
      tickLower: nearestUsableTick(pool.tickCurrent - 600, pool.tickSpacing),
      tickUpper: nearestUsableTick(pool.tickCurrent + 600, pool.tickSpacing),
      liquidity: BigNumber.from('1000000000000'),
      tokensOwed0: BigNumber.from('1000000000000000'),
      tokensOwed1: BigNumber.from('2000000'),
    }),
    estimateGas,
    multicall,
  }));

  return { ethereum, estimateGas, multicall };
};

const close = (server: any) =>
  server.inject({
    method: 'POST',
    url: '/close',
    payload: {
      chainNetwork: 'ethereum-base',
      connector: 'uniswap',
      walletAddress: mockWallet,
      positionAddress,
    },
  });

describe('POST /close (Uniswap V3 CLMM) — gas limit', () => {
  let server: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    (Ethereum.getWalletAddressExample as jest.Mock) = jest.fn().mockResolvedValue(mockWallet);
    server = await buildApp();
  });

  afterEach(async () => {
    await server.close();
  });

  it('estimates the very multicall it sends and forwards the estimate with its margin', async () => {
    const { ethereum, estimateGas, multicall } = primeMocks(async () => BigNumber.from(600000));

    const response = await close(server);

    expect(response.statusCode).toBe(200);
    expect(parseWire(response.body).signature).toBe(txHash);

    // one estimate, one send, for the same calldata and the same value
    expect(estimateGas.multicall).toHaveBeenCalledTimes(1);
    expect(multicall).toHaveBeenCalledTimes(1);
    const [estimatedCalldata, estimateOverrides] = estimateGas.multicall.mock.calls[0] as any[];
    const [sentCalldata, sentParams] = multicall.mock.calls[0] as any[];
    expect(estimatedCalldata).toEqual(sentCalldata);
    expect(estimatedCalldata).toHaveLength(1);
    expect(sentParams.value.toString()).toBe(estimateOverrides.value.toString());

    // 600k + 25% reaches prepareGasOptions and the transaction
    expect(ethereum.prepareGasOptions).toHaveBeenCalledWith(undefined, 750000);
    expect(sentParams.gasLimit).toBe(750000);
  });

  it('keeps the fixed 400k when the estimate is lower', async () => {
    const { ethereum, multicall } = primeMocks(async () => BigNumber.from(250000));

    const response = await close(server);

    expect(response.statusCode).toBe(200);
    expect(ethereum.prepareGasOptions).toHaveBeenCalledWith(undefined, FIXED_CLOSE_GAS_LIMIT);
    expect(multicall.mock.calls[0][1].gasLimit).toBe(FIXED_CLOSE_GAS_LIMIT);
  });

  it('keeps the fixed 400k and still sends when the estimate fails', async () => {
    const { ethereum, multicall } = primeMocks(async () => {
      throw new Error('execution reverted');
    });

    const response = await close(server);

    expect(response.statusCode).toBe(200);
    expect(ethereum.prepareGasOptions).toHaveBeenCalledWith(undefined, FIXED_CLOSE_GAS_LIMIT);
    expect(multicall).toHaveBeenCalledTimes(1);
  });
});
