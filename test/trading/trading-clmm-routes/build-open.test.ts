/**
 * Route-level tests for /trading/clmm/build-open: the build gating and the capture
 * plumbing between route and connector, on Solana and on EVM.
 * The connector itself is mocked; the capture mechanics are covered in
 * test/chains/solana/build-mode.test.ts.
 */
import { EvmTransactionCaptured } from '../../../src/chains/ethereum/evm-build-mode';
import { UnsignedTransactionCaptured } from '../../../src/chains/solana/solana-build-mode';
import { fastifyWithTypeProvider } from '../../utils/testUtils';

jest.mock('../../../src/connectors/meteora/clmm-routes/openPosition', () => ({
  openPosition: jest.fn(),
}));
jest.mock('../../../src/connectors/pancakeswap-sol/clmm-routes/openPosition', () => ({
  openPosition: jest.fn(),
}));
jest.mock('../../../src/connectors/uniswap/clmm-routes/openPosition', () => ({
  openPosition: jest.fn(),
}));

const WALLET = '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5';

const FAKE_BUILT = {
  transaction: Buffer.from('unsigned-tx').toString('base64'),
  feePayer: WALLET,
  recentBlockhash: 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N',
  lastValidBlockHeight: 424242,
  currentBlockHeight: 424100,
  extraSigners: [{ pubkey: 'CiDwVBFgWV9E5MvXWoLgnEgn2hK7rJikbvfWavzAQz3', signature: 'c2ln' }],
};

const EVM_WALLET = '0xDA50C69342216b538Daf06FfECDa7363E0B96684';
const evmTx = (nonce: number, to: string) => ({
  chainId: 1,
  from: EVM_WALLET,
  to,
  data: '0xac9650d8',
  value: '0',
  nonce,
  gasLimit: '600000',
  type: 2,
  maxFeePerGas: '30000000000',
  maxPriorityFeePerGas: '1000000000',
});
const EVM_BUILT = {
  unsignedTransaction: evmTx(8, '0xC36442b4a4522E871399CD717aBDD847Ab11FE88'),
  approvals: [
    {
      token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      symbol: 'USDC',
      spender: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
      amount: '2.0',
      currentAllowance: '0.0',
      transaction: evmTx(7, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
    },
  ],
  simulated: false,
};

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { openPositionRoute } = await import('../../../src/trading/trading-clmm-routes/open');
  await server.register(openPositionRoute);
  return server;
};

const basePayload = {
  connector: 'meteora',
  chainNetwork: 'solana-mainnet-beta',
  walletAddress: WALLET,
  lowerPrice: 100,
  upperPrice: 200,
  poolAddress: '2sf5NYcY4zUPXUSmG6f66mskb24t5F8S11pC1Nz5nQT3',
  baseTokenAmount: 0.1,
};

describe('POST /trading/clmm/build-open', () => {
  let server: any;
  let openPosition: jest.Mock;

  beforeAll(async () => {
    server = await buildApp();
    openPosition = require('../../../src/connectors/meteora/clmm-routes/openPosition').openPosition;
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    openPosition.mockReset();
  });

  it('returns the captured unsigned transaction from the connector execute path', async () => {
    openPosition.mockImplementation(async () => {
      throw new UnsignedTransactionCaptured(FAKE_BUILT);
    });

    const response = await server.inject({ method: 'POST', url: '/build-open', payload: basePayload });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(FAKE_BUILT);
    // The exact same connector function the execute route runs, with the same arguments.
    expect(openPosition).toHaveBeenCalledWith(
      'mainnet-beta',
      WALLET,
      100,
      200,
      basePayload.poolAddress,
      0.1,
      undefined,
      undefined,
      undefined,
    );
  });

  it('returns an EVM build, with its approvals, in the EVM shape', async () => {
    const uniswapOpen: jest.Mock = require('../../../src/connectors/uniswap/clmm-routes/openPosition').openPosition;
    uniswapOpen.mockImplementation(async () => {
      throw new EvmTransactionCaptured(EVM_BUILT);
    });

    const response = await server.inject({
      method: 'POST',
      url: '/build-open',
      payload: { ...basePayload, connector: 'uniswap', chainNetwork: 'ethereum-mainnet', walletAddress: EVM_WALLET },
    });

    expect(response.statusCode).toBe(200);
    // Every field survives the response serializer, which picks the EVM half of the union.
    expect(JSON.parse(response.body)).toEqual(EVM_BUILT);
    expect(uniswapOpen).toHaveBeenCalledWith(
      'mainnet',
      EVM_WALLET,
      100,
      200,
      basePayload.poolAddress,
      0.1,
      undefined,
      undefined,
    );
    expect(openPosition).not.toHaveBeenCalled();
  });

  it('refuses a Solana-only build field on an EVM connector, by name', async () => {
    const uniswapOpen: jest.Mock = require('../../../src/connectors/uniswap/clmm-routes/openPosition').openPosition;
    uniswapOpen.mockReset();

    const response = await server.inject({
      method: 'POST',
      url: '/build-open',
      payload: {
        ...basePayload,
        connector: 'uniswap',
        chainNetwork: 'ethereum-mainnet',
        walletAddress: EVM_WALLET,
        memo: 'app:ref=1',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/memo applies to Solana builds only/);
    expect(uniswapOpen).not.toHaveBeenCalled();
  });

  it('reports a connector that completed without building a transaction', async () => {
    openPosition.mockResolvedValue({ signature: 'oops-this-executed', status: 1 });

    const response = await server.inject({ method: 'POST', url: '/build-open', payload: basePayload });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/nothing to sign/);
  });

  it('applies the same amount validation as the execute route', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/build-open',
      payload: { ...basePayload, baseTokenAmount: 0 },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/greater than 0/);
    expect(openPosition).not.toHaveBeenCalled();
  });
});
