import { BigNumber } from 'ethers';

import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { Uniswap } from '../../../../src/connectors/uniswap/uniswap';
import { getUniswapPoolInfo } from '../../../../src/connectors/uniswap/uniswap.utils';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/ethereum/ethereum');
jest.mock('../../../../src/connectors/uniswap/uniswap');
jest.mock('@ethersproject/contracts');
jest.mock('../../../../src/connectors/uniswap/amm-routes/positionInfo', () => ({
  ...jest.requireActual('../../../../src/connectors/uniswap/amm-routes/positionInfo'),
  checkLPAllowance: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../../src/connectors/uniswap/uniswap.utils', () => ({
  ...jest.requireActual('../../../../src/connectors/uniswap/uniswap.utils'),
  getUniswapPoolInfo: jest.fn(),
}));

// The AMM side of the same confirmation contract (the CLMM side is pinned in
// clmm-routes/collect-fees-confirmation.test.ts). remove-liquidity is the route where the old
// behaviour was worst: `expectedBaseTokenAmount`/`expectedQuoteTokenAmount` are derived from
// reserves read BEFORE sending, so a reverted transaction used to report those withdrawals
// alongside status 0 — read downstream as "still pending" forever.

const USDC = { address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', symbol: 'USDC', decimals: 6 };
const DAI = { address: '0x50c5725949a6f0c72e6c4a641f24049a917db0cb', symbol: 'DAI', decimals: 18 };
const mockWallet = '0x0000000000000000000000000000000000000001';
const poolAddress = '0xd0b53d9277642d899df5c87a3966a349a798f224';
const txHash = '0x3333333333333333333333333333333333333333333333333333333333333333';

const { Ethereum: RealEthereum } = jest.requireActual('../../../../src/chains/ethereum/ethereum');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { removeLiquidityRoute } = await import('../../../../src/trading/trading-amm-routes/remove-liquidity');
  await server.register(removeLiquidityRoute);
  return server;
};

const primeMocks = (receipt: any) => {
  (getUniswapPoolInfo as jest.Mock).mockResolvedValue({
    baseTokenAddress: USDC.address,
    quoteTokenAddress: DAI.address,
  });

  (Uniswap.getInstance as jest.Mock).mockResolvedValue({
    getToken: jest.fn((address: string) => Promise.resolve(address === USDC.address ? USDC : DAI)),
  });

  const ethereum: any = {
    provider: {},
    getWallet: jest.fn().mockResolvedValue({ address: mockWallet }),
    prepareGasOptions: jest.fn().mockResolvedValue({}),
    handleTransactionExecution: jest.fn().mockResolvedValue(receipt),
  };
  ethereum.handleTransactionConfirmation = RealEthereum.prototype.handleTransactionConfirmation.bind(ethereum);
  (Ethereum.getInstance as jest.Mock).mockResolvedValue(ethereum);

  const { Contract } = require('@ethersproject/contracts');
  (Contract as jest.Mock).mockImplementation(() => ({
    // LP pair reads: the wallet holds 10% of a pool with 100 USDC / 100 DAI of reserves,
    // so removing 50% is worth 5 USDC + 5 DAI.
    balanceOf: jest.fn().mockResolvedValue(BigNumber.from('1000000000000000000')),
    token0: jest.fn().mockResolvedValue(USDC.address),
    token1: jest.fn().mockResolvedValue(DAI.address),
    totalSupply: jest.fn().mockResolvedValue(BigNumber.from('10000000000000000000')),
    getReserves: jest.fn().mockResolvedValue([BigNumber.from('100000000'), BigNumber.from('100000000000000000000')]),
    // Router write
    removeLiquidity: jest.fn().mockResolvedValue({ hash: txHash }),
  }));
};

const remove = (server: any) =>
  server.inject({
    method: 'POST',
    url: '/remove-liquidity',
    payload: {
      chainNetwork: 'ethereum-base',
      connector: 'uniswap',
      walletAddress: mockWallet,
      poolAddress,
      percentageToRemove: 50,
    },
  });

describe('POST /remove-liquidity (Uniswap V2 AMM) — transaction confirmation', () => {
  let server: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    (Ethereum.getWalletAddressExample as jest.Mock) = jest.fn().mockResolvedValue(mockWallet);
    server = await buildApp();
  });

  afterEach(async () => {
    await server.close();
  });

  it('returns the pending shape with the tx hash and no withdrawn amounts', async () => {
    primeMocks(null);

    const response = await remove(server);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.signature).toBe(txHash);
    expect(body.status).toBe(0); // TransactionStatus.PENDING
    expect(body.data).toBeUndefined();
  });

  it('fails loudly (400 TRANSACTION_FAILED) on a revert rather than booking amounts as pending', async () => {
    primeMocks({
      status: 0,
      transactionHash: txHash,
      gasUsed: BigNumber.from(21_000),
      effectiveGasPrice: BigNumber.from('1000000000'),
    });

    const response = await remove(server);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toContain(txHash);
    expect(response.body).not.toContain('baseTokenAmountRemoved');
  });

  it('returns the confirmed shape with the withdrawn amounts and the receipt gas fee', async () => {
    primeMocks({
      status: 1,
      transactionHash: txHash,
      logs: [],
      gasUsed: BigNumber.from(21_000),
      effectiveGasPrice: BigNumber.from('1000000000'),
    });

    const response = await remove(server);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe(1); // TransactionStatus.CONFIRMED
    expect(body.data.baseTokenAmountRemoved).toBe(5);
    expect(body.data.quoteTokenAmountRemoved).toBe(5);
    expect(body.data.fee).toBe(0.000021);
  });
});
