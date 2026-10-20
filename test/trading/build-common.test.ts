import { assertBuildSupported } from '../../src/trading/build-common';

describe('assertBuildSupported', () => {
  it('builds for a Solana connector that signs through the wallet chokepoint', () => {
    expect(() => assertBuildSupported('meteora', 'solana')).not.toThrow();
  });

  it('refuses an EVM connector, which signs inside its execute route', () => {
    expect(() => assertBuildSupported('uniswap', 'ethereum')).toThrow(/Solana connectors only; 'uniswap'/);
  });
});
