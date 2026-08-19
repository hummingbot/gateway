import { fastifyWithTypeProvider } from '../../utils/testUtils';

// open and close give the AMM surface the same verbs as CLMM, and work on every AMM —
// but "a position" differs. On meteora DAMM v2 a position is an NFT with its own rent,
// so open mints it and close closes it. On fungible-LP AMMs liquidity is LP tokens
// against the pool, so open is the deposit and close is the full withdrawal, with no
// position address and no rent either way. These pin that dispatch and that the
// position fields are reported honestly rather than invented.

const mockMeteoraOpen = jest.fn();
const mockMeteoraClose = jest.fn();
const mockRaydiumAdd = jest.fn();
const mockRaydiumRemove = jest.fn();
const mockUniswapAdd = jest.fn();
const mockUniswapRemove = jest.fn();
const mockPancakeswapAdd = jest.fn();
const mockPancakeswapRemove = jest.fn();

jest.mock('../../../src/connectors/meteora/amm-routes/openPosition', () => ({
  openPosition: (...args: any[]) => mockMeteoraOpen(...args),
}));
jest.mock('../../../src/connectors/meteora/amm-routes/closePosition', () => ({
  closePosition: (...args: any[]) => mockMeteoraClose(...args),
}));
jest.mock('../../../src/connectors/raydium/amm-routes/addLiquidity', () => ({
  addLiquidity: (...args: any[]) => mockRaydiumAdd(...args),
}));
jest.mock('../../../src/connectors/raydium/amm-routes/removeLiquidity', () => ({
  removeLiquidity: (...args: any[]) => mockRaydiumRemove(...args),
}));
jest.mock('../../../src/connectors/uniswap/amm-routes/addLiquidity', () => ({
  addLiquidity: (...args: any[]) => mockUniswapAdd(...args),
}));
jest.mock('../../../src/connectors/uniswap/amm-routes/removeLiquidity', () => ({
  removeLiquidity: (...args: any[]) => mockUniswapRemove(...args),
}));
jest.mock('../../../src/connectors/pancakeswap/amm-routes/addLiquidity', () => ({
  addLiquidity: (...args: any[]) => mockPancakeswapAdd(...args),
}));
jest.mock('../../../src/connectors/pancakeswap/amm-routes/removeLiquidity', () => ({
  removeLiquidity: (...args: any[]) => mockPancakeswapRemove(...args),
}));

const WALLET = '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5';
const POOL = 'FAKEpoolAddress1111111111111111111111111111';
const POSITION = 'FAKEpositionAddress11111111111111111111111';

const ADDED = {
  signature: 'sig-add',
  status: 1,
  data: { fee: 0.00002, baseTokenAmountAdded: 0.1, quoteTokenAmountAdded: 20 },
};

const REMOVED = {
  signature: 'sig-remove',
  status: 1,
  data: { fee: 0.00002, baseTokenAmountRemoved: 0.1, quoteTokenAmountRemoved: 20 },
};

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
    [mockRaydiumAdd, mockUniswapAdd, mockPancakeswapAdd].forEach((m) => m.mockResolvedValue(ADDED));
    [mockRaydiumRemove, mockUniswapRemove, mockPancakeswapRemove].forEach((m) => m.mockResolvedValue(REMOVED));
  });

  const openPayload = (connector: string) => ({
    connector,
    chainNetwork: connector === 'meteora' || connector === 'raydium' ? 'solana-mainnet-beta' : 'ethereum-mainnet',
    walletAddress: WALLET,
    poolAddress: POOL,
    baseTokenAmount: 0.1,
    quoteTokenAmount: 20,
  });

  const closePayload = (connector: string) => ({
    connector,
    chainNetwork: connector === 'meteora' || connector === 'raydium' ? 'solana-mainnet-beta' : 'ethereum-mainnet',
    walletAddress: WALLET,
    poolAddress: POOL,
  });

  describe('meteora (positions are NFTs)', () => {
    it('opens a position and reports its address and rent', async () => {
      mockMeteoraOpen.mockResolvedValue({
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
      expect(mockMeteoraOpen).toHaveBeenCalledWith('mainnet-beta', WALLET, POOL, 0.1, 20, undefined);
    });

    it('closes a position and reports the rent refunded', async () => {
      mockMeteoraClose.mockResolvedValue({
        signature: 'sig-close',
        status: 1,
        data: {
          fee: 0.00001,
          positionRentRefunded: 0.0575,
          baseTokenAmountRemoved: 0.1,
          quoteTokenAmountRemoved: 20,
        },
      });

      const response = await server.inject({
        method: 'POST',
        url: '/close',
        payload: { ...closePayload('meteora'), positionAddress: POSITION },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.positionRentRefunded).toBe(0.0575);
      expect(mockMeteoraClose).toHaveBeenCalledWith('mainnet-beta', WALLET, POOL, POSITION, undefined);
    });

    it('requires the position address to close, since a wallet may hold several per pool', async () => {
      const response = await server.inject({ method: 'POST', url: '/close', payload: closePayload('meteora') });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toMatch(/positionAddress is required for meteora/);
      expect(mockMeteoraClose).not.toHaveBeenCalled();
    });
  });

  describe('fungible-LP AMMs (liquidity is LP tokens)', () => {
    const adders: Record<string, jest.Mock> = {
      raydium: mockRaydiumAdd,
      uniswap: mockUniswapAdd,
      pancakeswap: mockPancakeswapAdd,
    };
    const removers: Record<string, jest.Mock> = {
      raydium: mockRaydiumRemove,
      uniswap: mockUniswapRemove,
      pancakeswap: mockPancakeswapRemove,
    };

    it.each(['raydium', 'uniswap', 'pancakeswap'])('opens %s through its add, reporting no position', async (c) => {
      const response = await server.inject({ method: 'POST', url: '/open', payload: openPayload(c) });

      expect(response.statusCode).toBe(200);
      expect(adders[c]).toHaveBeenCalledWith(expect.any(String), WALLET, POOL, 0.1, 20, undefined);
      const { data } = response.json();
      expect(data.baseTokenAmountAdded).toBe(0.1);
      expect(data.quoteTokenAmountAdded).toBe(20);
      // No position account exists, so there is no address and no rent was locked.
      expect(data.positionAddress).toBeUndefined();
      expect(data.positionRent).toBe(0);
    });

    it.each(['raydium', 'uniswap', 'pancakeswap'])('closes %s through a full remove', async (c) => {
      const response = await server.inject({ method: 'POST', url: '/close', payload: closePayload(c) });

      expect(response.statusCode).toBe(200);
      // Closing a fungible LP position IS withdrawing all of it.
      expect(removers[c]).toHaveBeenCalledWith(expect.any(String), WALLET, POOL, 100, undefined);
      const { data } = response.json();
      expect(data.baseTokenAmountRemoved).toBe(0.1);
      expect(data.quoteTokenAmountRemoved).toBe(20);
      expect(data.positionRentRefunded).toBe(0);
    });

    it('ignores a position address on a fungible-LP AMM', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/close',
        payload: { ...closePayload('raydium'), positionAddress: POSITION },
      });

      expect(response.statusCode).toBe(200);
      expect(mockRaydiumRemove).toHaveBeenCalledWith('mainnet-beta', WALLET, POOL, 100, undefined);
    });

    it('passes a pending transaction through without inventing position data', async () => {
      mockRaydiumAdd.mockResolvedValue({ signature: 'sig-pending', status: 0 });

      const response = await server.inject({ method: 'POST', url: '/open', payload: openPayload('raydium') });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ signature: 'sig-pending', status: 0 });
    });
  });

  it('rejects a connector outside the AMM enum', async () => {
    const response = await server.inject({ method: 'POST', url: '/open', payload: openPayload('notaconnector') });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toMatch(/must be equal to one of the allowed values/);
  });
});
