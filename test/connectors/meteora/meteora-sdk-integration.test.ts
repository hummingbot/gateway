import DLMM, { StrategyType } from '@meteora-ag/dlmm';
import { PublicKey } from '@solana/web3.js';

import '../../mocks/app-mocks';
import { Solana } from '../../../src/chains/solana/solana';

/**
 * Integration tests for Meteora SDK v1.7.5
 * Tests key API changes and ensures compatibility with the new SDK version
 */
describe('Meteora SDK v1.7.5 Integration', () => {
  let solana: Solana;
  const testPoolAddress = 'BEX7ez22ot4oHdFM3GwHGfYV7W4vMWivj2nYxT1JouSe'; // USDC-SOL pool

  beforeAll(async () => {
    solana = await Solana.getInstance('mainnet-beta');
  });

  describe('DLMM Pool Creation', () => {
    it('should create DLMM pool instance', async () => {
      const dlmmPool = await DLMM.create(solana.connection, new PublicKey(testPoolAddress));

      expect(dlmmPool).toBeDefined();
      expect(dlmmPool.pubkey).toEqual(new PublicKey(testPoolAddress));
      expect(dlmmPool.lbPair).toBeDefined();
    });
  });

  describe('TokenReserve API Changes', () => {
    it('should access token decimals via mint.decimals', async () => {
      const dlmmPool = await DLMM.create(solana.connection, new PublicKey(testPoolAddress));

      // New API: tokenX.mint.decimals
      expect(dlmmPool.tokenX.mint).toBeDefined();
      expect(dlmmPool.tokenX.mint.decimals).toBeDefined();
      expect(typeof dlmmPool.tokenX.mint.decimals).toBe('number');

      expect(dlmmPool.tokenY.mint).toBeDefined();
      expect(dlmmPool.tokenY.mint.decimals).toBeDefined();
      expect(typeof dlmmPool.tokenY.mint.decimals).toBe('number');

      // Verify the old .decimal property no longer exists
      expect((dlmmPool.tokenX as any).decimal).toBeUndefined();
      expect((dlmmPool.tokenY as any).decimal).toBeUndefined();
    });

    it('should have correct token reserve structure', async () => {
      const dlmmPool = await DLMM.create(solana.connection, new PublicKey(testPoolAddress));

      // Check TokenReserve structure
      expect(dlmmPool.tokenX.publicKey).toBeInstanceOf(PublicKey);
      expect(dlmmPool.tokenX.reserve).toBeInstanceOf(PublicKey);
      expect(dlmmPool.tokenX.mint).toBeDefined();
      expect(typeof dlmmPool.tokenX.amount).toBe('bigint');
      expect(dlmmPool.tokenX.owner).toBeInstanceOf(PublicKey);
      expect(Array.isArray(dlmmPool.tokenX.transferHookAccountMetas)).toBe(true);
    });
  });

  describe('StrategyType Enum Changes', () => {
    it('should have Spot strategy type', () => {
      expect(StrategyType.Spot).toBeDefined();
      expect(typeof StrategyType.Spot).toBe('number');
    });

    it('should have Curve strategy type', () => {
      expect(StrategyType.Curve).toBeDefined();
      expect(typeof StrategyType.Curve).toBe('number');
    });

    it('should have BidAsk strategy type', () => {
      expect(StrategyType.BidAsk).toBeDefined();
      expect(typeof StrategyType.BidAsk).toBe('number');
    });

    it('should not have deprecated SpotBalanced or SpotImBalanced', () => {
      expect((StrategyType as any).SpotBalanced).toBeUndefined();
      expect((StrategyType as any).SpotImBalanced).toBeUndefined();
    });
  });

  describe('Pool Data Access', () => {
    it('should fetch bins around active bin', async () => {
      const dlmmPool = await DLMM.create(solana.connection, new PublicKey(testPoolAddress));

      const binData = await dlmmPool.getBinsAroundActiveBin(5, 5);

      expect(binData).toBeDefined();
      expect(Array.isArray(binData.bins)).toBe(true);
      expect(binData.bins.length).toBeGreaterThan(0);

      // Check bin structure
      const bin = binData.bins[0];
      expect(bin.binId).toBeDefined();
      expect(bin.price).toBeDefined();
      expect(bin.pricePerToken).toBeDefined();
      expect(bin.xAmount).toBeDefined();
      expect(bin.yAmount).toBeDefined();
    });

    it('should get pool price data', async () => {
      const dlmmPool = await DLMM.create(solana.connection, new PublicKey(testPoolAddress));

      const activeBinId = dlmmPool.lbPair.activeId;
      expect(activeBinId).toBeDefined();
      expect(typeof activeBinId).toBe('number');

      const binStep = dlmmPool.lbPair.binStep;
      expect(binStep).toBeDefined();
      expect(typeof binStep).toBe('number');
    });
  });
});
