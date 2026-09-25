jest.mock('../../src/services/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const mockGetClmmPoolInfo = jest.fn();
jest.mock('../../src/connectors/raydium/raydium', () => ({
  Raydium: { getInstance: jest.fn(async () => ({ getClmmPoolInfo: mockGetClmmPoolInfo })) },
}));

import { fetchPoolInfo } from '../../src/pools/pool-info-helpers';

const POOL = '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv';

describe('fetchPoolInfo', () => {
  beforeEach(() => mockGetClmmPoolInfo.mockReset());

  it("returns the connector's pool facts", async () => {
    mockGetClmmPoolInfo.mockResolvedValue({ baseTokenAddress: 'A', quoteTokenAddress: 'B', feePct: 0.25, price: 1 });
    await expect(fetchPoolInfo('raydium', 'clmm', 'mainnet-beta', POOL)).resolves.toEqual({
      baseTokenAddress: 'A',
      quoteTokenAddress: 'B',
      feePct: 0.25,
    });
  });

  it("answers null only when the connector says the pool isn't its own", async () => {
    mockGetClmmPoolInfo.mockResolvedValue(null);
    await expect(fetchPoolInfo('raydium', 'clmm', 'mainnet-beta', POOL)).resolves.toBeNull();
  });

  it('propagates a failed read as a 500 carrying its cause', async () => {
    mockGetClmmPoolInfo.mockRejectedValue(new Error('429 Too Many Requests'));
    await expect(fetchPoolInfo('raydium', 'clmm', 'mainnet-beta', POOL)).rejects.toMatchObject({
      statusCode: 500,
      message: `Failed to fetch pool info for ${POOL} from raydium clmm: 429 Too Many Requests`,
    });
  });

  it('rejects an unknown connector as a 400', async () => {
    await expect(fetchPoolInfo('nosuchdex', 'clmm', 'mainnet-beta', POOL)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Unsupported connector: nosuchdex',
    });
  });
});
