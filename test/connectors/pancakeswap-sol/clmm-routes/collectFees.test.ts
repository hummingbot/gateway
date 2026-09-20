import BN from 'bn.js';

import { Solana } from '../../../../src/chains/solana/solana';
import { PancakeswapSol } from '../../../../src/connectors/pancakeswap-sol/pancakeswap-sol';
import { buildRemoveLiquidityTransaction } from '../../../../src/connectors/pancakeswap-sol/pancakeswap-sol.transactions';
import { transactionFailed } from '../../../../src/services/error-handler';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';
import { parseWire } from '../../../utils/wire';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/pancakeswap-sol/pancakeswap-sol');
jest.mock('../../../../src/connectors/pancakeswap-sol/pancakeswap-sol.transactions');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { collectFeesRoute } = await import('../../../../src/trading/trading-clmm-routes/collect-fees');
  await server.register(collectFeesRoute);
  return server;
};

const WALLET = 'AabEVCB1sWgCPxbn6hFYM4Ukj7UubpBRbbYqRnqRXnZD';
const POSITION = 'ARwi1S4DaiTG5DX7S4M4ZsrXqpMD1MrTmbu9ue2tpmEq';

const mockSOL = { symbol: 'SOL', address: 'So11111111111111111111111111111111111111112', decimals: 9 };
const mockUSDC = { symbol: 'USDC', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 };

const mockPositionInfo = {
  baseTokenAddress: mockSOL.address,
  quoteTokenAddress: mockUSDC.address,
};

const mockTransaction = { sign: jest.fn() };

const baseSolanaMock = (overrides: Record<string, any> = {}) => ({
  getToken: jest.fn((t: string) => {
    if (t === mockSOL.address) return Promise.resolve(mockSOL);
    if (t === mockUSDC.address) return Promise.resolve(mockUSDC);
    return Promise.resolve(null);
  }),
  getWallet: jest.fn().mockResolvedValue({ publicKey: WALLET }),
  estimateGasPrice: jest.fn().mockResolvedValue(0.001),
  simulateWithErrorHandling: jest.fn().mockResolvedValue(undefined),
  throwIfLandedWithError: jest.fn().mockResolvedValue(undefined),
  extractBalanceChangesAndFee: jest.fn().mockResolvedValue({ balanceChanges: [0.0012, 0.34] }),
  ...overrides,
});

describe('POST /collect-fees (pancakeswap-sol)', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (PancakeswapSol.getInstance as jest.Mock).mockResolvedValue({
      getPositionInfo: jest.fn().mockResolvedValue(mockPositionInfo),
    });
    (buildRemoveLiquidityTransaction as jest.Mock).mockResolvedValue(mockTransaction);
  });

  it('collects fees via a zero-liquidity decrease — the position liquidity is NOT touched', async () => {
    const mockSolana = baseSolanaMock({
      sendAndConfirmRawTransaction: jest
        .fn()
        .mockResolvedValue({ confirmed: true, signature: 'collect-sig', txData: { meta: { fee: 5000 } } }),
    });
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

    const response = await server.inject({
      method: 'POST',
      url: '/collect-fees',
      body: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'pancakeswap-sol',
        walletAddress: WALLET,
        positionAddress: POSITION,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = parseWire(response.body);
    expect(body).toMatchObject({
      signature: 'collect-sig',
      status: 1,
      data: {
        fee: 5000 / 1e9,
        baseFeeAmountCollected: 0.0012,
        quoteFeeAmountCollected: 0.34,
      },
    });

    // The decrease_liquidity_v2 call must carry liquidity = 0 (fees only) — the old
    // implementation removed 1% of the position's liquidity and lied about the fees.
    const [, , , liquidityArg, amount0Min, amount1Min] = (buildRemoveLiquidityTransaction as jest.Mock).mock.calls[0];
    expect(liquidityArg).toBeInstanceOf(BN);
    expect(liquidityArg.isZero()).toBe(true);
    expect(amount0Min.isZero()).toBe(true);
    expect(amount1Min.isZero()).toBe(true);
  });

  it('fails loudly when the collect transaction landed on-chain but failed (no silent PENDING)', async () => {
    const failedTxData = { meta: { err: { InstructionError: [0, 'Custom'] } } };
    const mockSolana = baseSolanaMock({
      sendAndConfirmRawTransaction: jest
        .fn()
        .mockResolvedValue({ confirmed: false, signature: 'failed-sig', txData: failedTxData }),
      throwIfLandedWithError: jest
        .fn()
        .mockRejectedValue(transactionFailed('Transaction failed-sig landed on-chain but failed: custom error')),
    });
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

    const response = await server.inject({
      method: 'POST',
      url: '/collect-fees',
      body: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'pancakeswap-sol',
        walletAddress: WALLET,
        positionAddress: POSITION,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(parseWire(response.body).message).toMatch(/landed on-chain but failed/);
    expect(mockSolana.throwIfLandedWithError).toHaveBeenCalledWith('failed-sig', failedTxData);
  });

  it('keeps the pending shape when the transaction genuinely has not landed', async () => {
    const mockSolana = baseSolanaMock({
      sendAndConfirmRawTransaction: jest
        .fn()
        .mockResolvedValue({ confirmed: false, signature: 'pending-sig', txData: null }),
    });
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

    const response = await server.inject({
      method: 'POST',
      url: '/collect-fees',
      body: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'pancakeswap-sol',
        walletAddress: WALLET,
        positionAddress: POSITION,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(parseWire(response.body)).toMatchObject({ signature: 'pending-sig', status: 0 });
    expect(mockSolana.throwIfLandedWithError).toHaveBeenCalledWith('pending-sig', null);
  });
});
