import { getPermit2Expiration } from '../../../../src/chains/ethereum/routes/approve';

// schemas.ts (imported transitively by approve.ts) calls getEthereumChainConfig
// and reads networks at import time, so the mock factory must return valid data
jest.mock('../../../../src/chains/ethereum/ethereum.config', () => ({
  getEthereumChainConfig: jest.fn().mockReturnValue({ defaultNetwork: 'mainnet', defaultWallet: '0x0' }),
  networks: ['mainnet'],
}));

import { getEthereumChainConfig } from '../../../../src/chains/ethereum/ethereum.config';

const MAX_UINT48 = 281474976710655;

describe('getPermit2Expiration', () => {
  const mockGetChainConfig = getEthereumChainConfig as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('defaults to never expiring (max uint48) when permit2ExpirationSeconds is not set', () => {
    mockGetChainConfig.mockReturnValue({});
    expect(getPermit2Expiration()).toBe(MAX_UINT48);
  });

  it('returns now + permit2ExpirationSeconds when configured', () => {
    const thirtyDays = 30 * 24 * 60 * 60;
    mockGetChainConfig.mockReturnValue({ permit2ExpirationSeconds: thirtyDays });

    const before = Math.floor(Date.now() / 1000) + thirtyDays;
    const expiration = getPermit2Expiration();
    const after = Math.floor(Date.now() / 1000) + thirtyDays;

    expect(expiration).toBeGreaterThanOrEqual(before);
    expect(expiration).toBeLessThanOrEqual(after);
  });

  it('caps the expiration at max uint48', () => {
    mockGetChainConfig.mockReturnValue({ permit2ExpirationSeconds: MAX_UINT48 });
    expect(getPermit2Expiration()).toBe(MAX_UINT48);
  });
});
