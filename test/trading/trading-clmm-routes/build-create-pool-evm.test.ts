import { EvmTransactionCaptured } from '../../../src/chains/ethereum/evm-build-mode';
import { fastifyWithTypeProvider } from '../../utils/testUtils';

// /trading/clmm/build-create-pool on Uniswap V3: prepare decides the pool's address and
// seed price before anything is sent, and the build returns them beside the transaction.

jest.mock('../../../src/connectors/uniswap/clmm-routes/createPool', () => ({
  prepareCreatePool: jest.fn(),
  createPoolFromPrepared: jest.fn(),
}));

const WALLET = '0xDA50C69342216b538Daf06FfECDa7363E0B96684';
const POOL = '0x1111111111111111111111111111111111111111';
const BUILT = {
  unsignedTransaction: {
    chainId: 1,
    from: WALLET,
    to: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    data: '0x13ead562',
    value: '0',
    nonce: 4,
    gasLimit: '5400000',
    type: 2,
    maxFeePerGas: '30000000000',
    maxPriorityFeePerGas: '1000000000',
  },
  approvals: [],
  simulated: true,
};

describe('POST /trading/clmm/build-create-pool (EVM)', () => {
  let app: any;
  let prepare: jest.Mock;
  let fromPrepared: jest.Mock;

  beforeAll(async () => {
    app = fastifyWithTypeProvider();
    await app.register(require('@fastify/sensible'));
    const { buildCreatePoolRoute } = await import('../../../src/trading/trading-clmm-routes/build-create-pool');
    await app.register(buildCreatePoolRoute);
    ({
      prepareCreatePool: prepare,
      createPoolFromPrepared: fromPrepared,
    } = require('../../../src/connectors/uniswap/clmm-routes/createPool'));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    prepare.mockReset().mockResolvedValue({ poolAddress: POOL, seedPrice: 2500, call: {} });
    fromPrepared.mockReset().mockImplementation(async () => {
      throw new EvmTransactionCaptured(BUILT);
    });
  });

  const build = (payload: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: '/build-create-pool',
      payload: {
        connector: 'uniswap',
        chainNetwork: 'ethereum-mainnet',
        walletAddress: WALLET,
        baseToken: 'WETH',
        quoteToken: 'USDC',
        initialPrice: 2500,
        ...payload,
      },
    });

  it('returns the unsigned create with the pool address and price prepare decided', async () => {
    const response = await build({ feeBps: 30 });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ ...BUILT, poolAddress: POOL, price: 2500 });
    // feeBps is the route's fee vocabulary; V3 takes hundredths of a bip.
    expect(prepare).toHaveBeenCalledWith('mainnet', 'WETH', 'USDC', 2500, 3000);
    expect(fromPrepared).toHaveBeenCalledWith('mainnet', WALLET, { poolAddress: POOL, seedPrice: 2500, call: {} });
  });

  it('requires the V3 fee tier', async () => {
    const response = await build({});

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/feeBps is required for uniswap/);
    expect(prepare).not.toHaveBeenCalled();
  });
});
