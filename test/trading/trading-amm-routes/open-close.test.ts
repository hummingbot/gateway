import { fastifyWithTypeProvider } from '../../utils/testUtils';

// open and close exist so the AMM surface carries the same verbs as CLMM, but only
// AMMs whose positions are discrete accounts have anything to open or close. These
// pin the dispatch: meteora reaches its connector, fungible-LP AMMs are turned away
// with the operation that replaces it, and neither route silently no-ops.

const mockOpenPosition = jest.fn();
const mockClosePosition = jest.fn();

jest.mock('../../../src/connectors/meteora/amm-routes/openPosition', () => ({
  openPosition: (...args: any[]) => mockOpenPosition(...args),
}));

jest.mock('../../../src/connectors/meteora/amm-routes/closePosition', () => ({
  closePosition: (...args: any[]) => mockClosePosition(...args),
}));

const WALLET = '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5';
const POOL = 'FAKEpoolAddress1111111111111111111111111111';
const POSITION = 'FAKEpositionAddress11111111111111111111111';

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { openPositionRoute } = await import('../../../src/trading/trading-amm-routes/open');
  const { closePositionRoute } = await import('../../../src/trading/trading-amm-routes/close');
  await server.register(openPositionRoute);
  await server.register(closePositionRoute);
  return server;
};

describe('POST /trading/amm/{open,close} (unified dispatch)', () => {
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

  const openPayload = (connector: string) => ({
    connector,
    chainNetwork: 'solana-mainnet-beta',
    walletAddress: WALLET,
    poolAddress: POOL,
    baseTokenAmount: 0.1,
    quoteTokenAmount: 20,
  });

  const closePayload = (connector: string) => ({
    connector,
    chainNetwork: 'solana-mainnet-beta',
    walletAddress: WALLET,
    poolAddress: POOL,
    positionAddress: POSITION,
  });

  it('opens a meteora position and reports its address and rent', async () => {
    mockOpenPosition.mockResolvedValue({
      signature: 'sig-open',
      status: 1,
      data: {
        fee: 0.00001,
        positionAddress: POSITION,
        positionRent: 0.0575,
        baseTokenAmountAdded: 0.1,
        quoteTokenAmountAdded: 20,
      },
    });

    const response = await server.inject({ method: 'POST', url: '/open', payload: openPayload('meteora') });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.positionAddress).toBe(POSITION);
    expect(response.json().data.positionRent).toBe(0.0575);
    expect(mockOpenPosition).toHaveBeenCalledWith('mainnet-beta', WALLET, POOL, 0.1, 20, undefined);
  });

  it('closes a meteora position and reports the rent refunded', async () => {
    mockClosePosition.mockResolvedValue({
      signature: 'sig-close',
      status: 1,
      data: {
        fee: 0.00001,
        positionRentRefunded: 0.0575,
        baseTokenAmountRemoved: 0.1,
        quoteTokenAmountRemoved: 20,
      },
    });

    const response = await server.inject({ method: 'POST', url: '/close', payload: closePayload('meteora') });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.positionRentRefunded).toBe(0.0575);
    expect(mockClosePosition).toHaveBeenCalledWith('mainnet-beta', WALLET, POOL, POSITION, undefined);
  });

  it.each(['raydium', 'uniswap', 'pancakeswap'])('points %s at add instead of open', async (connector) => {
    const response = await server.inject({ method: 'POST', url: '/open', payload: openPayload(connector) });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toMatch(/Use add instead/);
    expect(mockOpenPosition).not.toHaveBeenCalled();
  });

  it.each(['raydium', 'uniswap', 'pancakeswap'])('points %s at remove instead of close', async (connector) => {
    const response = await server.inject({ method: 'POST', url: '/close', payload: closePayload(connector) });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toMatch(/percentageToRemove 100/);
    expect(mockClosePosition).not.toHaveBeenCalled();
  });

  it('rejects a connector outside the AMM enum', async () => {
    const response = await server.inject({ method: 'POST', url: '/open', payload: openPayload('notaconnector') });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toMatch(/must be equal to one of the allowed values/);
  });

  it('requires the position address to close', async () => {
    const { positionAddress, ...withoutPosition } = closePayload('meteora');
    const response = await server.inject({ method: 'POST', url: '/close', payload: withoutPosition });

    expect(response.statusCode).toBe(400);
    expect(mockClosePosition).not.toHaveBeenCalled();
  });
});
