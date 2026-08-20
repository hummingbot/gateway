import { parseChainNetwork } from '../../src/services/chain-network';

/**
 * One reading of `chain-network`, not three.
 *
 * The implementations had diverged in a way callers could feel: trading rejected a value
 * with no hyphen, ConfigManagerV2 answered `{ chain: 'solana', network: '' }` for
 * `"solana"`, and findPools hand-rolled the same lenient split inline and stamped the
 * empty network onto every pool it returned. Which behaviour a caller got depended on
 * which route they reached.
 */
describe('parseChainNetwork', () => {
  it.each([
    ['solana-mainnet-beta', { chain: 'solana', network: 'mainnet-beta' }],
    ['ethereum-mainnet', { chain: 'ethereum', network: 'mainnet' }],
    // The network keeps its hyphens; only the first segment is the chain.
    ['ethereum-robinhoodchain-testnet', { chain: 'ethereum', network: 'robinhoodchain-testnet' }],
  ])('reads %s', (input, expected) => {
    expect(parseChainNetwork(input)).toEqual(expected);
  });

  // Each of these used to be accepted somewhere, and each produced an empty half that
  // then travelled on as though it were a real network.
  it.each([['solana'], ['solana-'], ['-mainnet-beta'], [''], ['-']])('rejects %p', (input) => {
    expect(() => parseChainNetwork(input)).toThrow(/Invalid chainNetwork/);
  });

  // handlePoolError matches on this text to answer 400. If the wording drifts, a caller's
  // malformed selector starts being reported as a Gateway failure instead.
  it('says "Invalid chainNetwork", which is what the pool routes match on to answer 400', () => {
    expect(() => parseChainNetwork('solana')).toThrow(/Invalid chainNetwork 'solana'/);
  });
});

describe('the callers share it', () => {
  it('gives the trading routes a 400 rather than a raw error', () => {
    const { parseChainNetwork: tradingParse } = require('../../src/trading/common');

    expect(() => tradingParse('solana')).toThrow(/Invalid chainNetwork/);
    try {
      tradingParse('solana');
    } catch (e: any) {
      expect(e.statusCode).toBe(400);
    }
  });

  it('leaves no hand-rolled split behind in the pool routes', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.resolve(__dirname, '../../src/pools/routes/findPools.ts'), 'utf8');

    expect(source).not.toMatch(/chainNetwork\.split\('-'\)/);
  });
});
