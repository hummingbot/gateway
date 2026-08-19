import { Token } from '@uniswap/sdk-core';
import { Pool, TickMath, encodeSqrtRatioX96 } from '@uniswap/v3-sdk';
import { BigNumber } from 'ethers';

import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { Uniswap } from '../../../../src/connectors/uniswap/uniswap';
import { getUniswapV3NftManagerAddress } from '../../../../src/connectors/uniswap/uniswap.contracts';
import { getUniswapPoolInfo } from '../../../../src/connectors/uniswap/uniswap.utils';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/ethereum/ethereum');
jest.mock('../../../../src/connectors/uniswap/uniswap');
jest.mock('@ethersproject/contracts');
jest.mock('../../../../src/connectors/uniswap/uniswap.utils', () => ({
  ...jest.requireActual('../../../../src/connectors/uniswap/uniswap.utils'),
  getUniswapPoolInfo: jest.fn(),
}));

// open-position is the route where a confirmed transaction can still fail to produce a usable
// result: the position's address only exists in the NFT-mint Transfer log. Pinned here:
//   - still pending             -> 200 { signature, status: 0 } with no data (no mint log yet).
//   - confirmed, no mint log    -> 500 naming the tx hash, NOT a confirmed response carrying
//                                  positionAddress: '' that the caller could never address.
//   - confirmed, mint log found -> 200 with the position ID from the log.
//   - unexpected failure        -> the underlying message survives the route's catch.

const WETH = new Token(8453, '0x4200000000000000000000000000000000000006', 18, 'WETH', 'Wrapped Ether');
const USDC = new Token(8453, '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', 6, 'USDC', 'USD Coin');
const mockWallet = '0x0000000000000000000000000000000000000001';
const poolAddress = '0xd0b53D9277642d899DF5C87A3966A349A798F224';
const txHash = '0x2222222222222222222222222222222222222222222222222222222222222222';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ZERO_TOPIC = '0x0000000000000000000000000000000000000000000000000000000000000000';

const { Ethereum: RealEthereum } = jest.requireActual('../../../../src/chains/ethereum/ethereum');

/** A live WETH/USDC 0.3% pool at ~3000 USDC per WETH. */
const buildPool = () => {
  const sqrtRatioX96 = encodeSqrtRatioX96('3000000000', '1000000000000000000');
  return new Pool(WETH, USDC, 3000, sqrtRatioX96, '1000000000000', TickMath.getTickAtSqrtRatio(sqrtRatioX96));
};

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { openPositionRoute } = await import('../../../../src/trading/trading-clmm-routes/open');
  await server.register(openPositionRoute);
  return server;
};

const primeMocks = (receipt: any, uniswapOverrides: Record<string, any> = {}) => {
  (getUniswapPoolInfo as jest.Mock).mockResolvedValue({
    baseTokenAddress: WETH.address,
    quoteTokenAddress: USDC.address,
  });

  (Uniswap.getInstance as jest.Mock).mockResolvedValue({
    getToken: jest.fn((address: string) =>
      Promise.resolve(address.toLowerCase() === WETH.address.toLowerCase() ? WETH : USDC),
    ),
    getV3Pool: jest.fn().mockResolvedValue(buildPool()),
    ...uniswapOverrides,
  });

  const ethereum: any = {
    provider: {},
    getWallet: jest.fn().mockResolvedValue({ address: mockWallet }),
    getContract: jest.fn().mockReturnValue({}),
    getERC20Allowance: jest.fn().mockResolvedValue({ value: BigNumber.from('1000000000000000000000000') }),
    prepareGasOptions: jest.fn().mockResolvedValue({}),
    handleTransactionExecution: jest.fn().mockResolvedValue(receipt),
  };
  ethereum.handleTransactionConfirmation = RealEthereum.prototype.handleTransactionConfirmation.bind(ethereum);
  (Ethereum.getInstance as jest.Mock).mockResolvedValue(ethereum);

  const { Contract } = require('@ethersproject/contracts');
  (Contract as jest.Mock).mockImplementation(() => ({
    multicall: jest.fn().mockResolvedValue({ hash: txHash }),
  }));
};

const open = (server: any) =>
  server.inject({
    method: 'POST',
    url: '/open',
    payload: {
      chainNetwork: 'ethereum-base',
      connector: 'uniswap',
      walletAddress: mockWallet,
      poolAddress,
      lowerPrice: 2500,
      upperPrice: 3500,
      baseTokenAmount: 0.1,
      quoteTokenAmount: 300,
    },
  });

describe('POST /open-position (Uniswap V3 CLMM) — transaction confirmation', () => {
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

    const response = await open(server);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.signature).toBe(txHash);
    expect(body.status).toBe(0); // TransactionStatus.PENDING
    expect(body.data).toBeUndefined();
  });

  it('fails loudly naming the tx hash when the confirmed transaction has no NFT mint log', async () => {
    primeMocks({
      status: 1,
      transactionHash: txHash,
      logs: [], // no Transfer-from-zero log -> the position ID is unknowable
      gasUsed: BigNumber.from(21_000),
      effectiveGasPrice: BigNumber.from('1000000000'),
    });

    const response = await open(server);

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.message).toContain(txHash);
    // Never a confirmed response with an unusable position address.
    expect(response.body).not.toContain('positionAddress');
  });

  it('returns the position ID read from the NFT mint log on confirmation', async () => {
    primeMocks({
      status: 1,
      transactionHash: txHash,
      logs: [
        {
          address: getUniswapV3NftManagerAddress('base'),
          topics: [TRANSFER_TOPIC, ZERO_TOPIC, ZERO_TOPIC, BigNumber.from(987654).toHexString()],
        },
      ],
      gasUsed: BigNumber.from(21_000),
      effectiveGasPrice: BigNumber.from('1000000000'),
    });

    const response = await open(server);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe(1); // TransactionStatus.CONFIRMED
    expect(body.data.positionAddress).toBe('987654');
    expect(body.data.fee).toBe(0.000021);
  });

  it('keeps the underlying error message instead of a bare "Failed to open position"', async () => {
    primeMocks(null, { getV3Pool: jest.fn().mockRejectedValue(new Error('pool state fetch exploded')) });

    const response = await open(server);

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).message).toContain('pool state fetch exploded');
  });
});
