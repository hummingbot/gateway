import { assertBuildFields, assertBuildSupported } from '../../src/trading/build-common';

describe('assertBuildSupported', () => {
  it('builds for a Solana connector that signs through the wallet chokepoint', () => {
    expect(() => assertBuildSupported('meteora', 'solana')).not.toThrow();
  });

  it('builds for an EVM connector, which sends through Ethereum.sendTransactionForWallet', () => {
    expect(() => assertBuildSupported('uniswap', 'ethereum')).not.toThrow();
  });
});

describe('assertBuildFields', () => {
  it('lets a Solana build take every build field', () => {
    expect(() =>
      assertBuildFields('solana', { memo: 'app:ref=1', priority: 'high', platformFee: { bps: 10 } }),
    ).not.toThrow();
  });

  it('lets an EVM build through when it names none of them', () => {
    expect(() => assertBuildFields('ethereum', { memo: undefined, priority: undefined })).not.toThrow();
  });

  it('refuses every Solana-only field an EVM build names, by name', () => {
    expect(() => assertBuildFields('ethereum', { memo: 'x', priority: 'high', platformFee: { bps: 10 } })).toThrow(
      /memo, priority, platformFee apply to Solana builds only; a ethereum build takes none of them/,
    );
  });
});
