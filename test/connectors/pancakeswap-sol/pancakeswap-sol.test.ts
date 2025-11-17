import { PancakeswapSol } from '../../../src/connectors/pancakeswap-sol/pancakeswap-sol';

describe('PancakeSwap Solana Connector', () => {
  let pancakeswapSol: PancakeswapSol;
  const network = 'mainnet-beta';

  // Real PancakeSwap Solana SOL/USDC pool
  const testPoolAddress = 'DJNtGuBGEQiUCWE8F981M2C3ZghZt2XLD8f2sQdZ6rsZ';

  // Real PancakeSwap Solana position NFT
  const testPositionAddress = 'F1xRqqbWdg3vdMEsn9YjRU7RnFVn67MZhDVXrWoobii5';

  beforeAll(async () => {
    pancakeswapSol = await PancakeswapSol.getInstance(network);
  });

  describe('getClmmPoolInfo', () => {
    it('should fetch pool info for PancakeSwap SOL/USDC pool', async () => {
      const poolInfo = await pancakeswapSol.getClmmPoolInfo(testPoolAddress);

      expect(poolInfo).toBeDefined();
      expect(poolInfo).not.toBeNull();

      if (poolInfo) {
        expect(poolInfo.address).toBe(testPoolAddress);
        expect(poolInfo.baseTokenAddress).toBe('So11111111111111111111111111111111111111112'); // SOL
        expect(poolInfo.quoteTokenAddress).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // USDC
        expect(poolInfo.binStep).toBe(10); // tick spacing
        expect(poolInfo.feePct).toBeGreaterThan(0);
        expect(poolInfo.price).toBeGreaterThan(0);
        expect(poolInfo.baseTokenAmount).toBeGreaterThanOrEqual(0);
        expect(poolInfo.quoteTokenAmount).toBeGreaterThanOrEqual(0);
        expect(typeof poolInfo.activeBinId).toBe('number');

        console.log('\n📊 Pool Info:');
        console.log(`  Address: ${poolInfo.address}`);
        console.log(`  Tokens: ${poolInfo.baseTokenAddress} / ${poolInfo.quoteTokenAddress}`);
        console.log(`  Price: ${poolInfo.price.toFixed(6)}`);
        console.log(`  Fee: ${poolInfo.feePct}%`);
        console.log(`  Tick Spacing: ${poolInfo.binStep}`);
        console.log(`  Active Tick: ${poolInfo.activeBinId}`);
        console.log(
          `  Liquidity: ${poolInfo.baseTokenAmount.toFixed(4)} SOL / ${poolInfo.quoteTokenAmount.toFixed(2)} USDC`,
        );
      }
    }, 30000);

    it('should return null for invalid pool address', async () => {
      const invalidPool = '11111111111111111111111111111111';

      const result = await pancakeswapSol.getClmmPoolInfo(invalidPool);
      expect(result).toBeNull();
    }, 30000);
  });

  describe('getPositionInfo', () => {
    it('should fetch position info for PancakeSwap position NFT or skip if position closed', async () => {
      try {
        const positionInfo = await pancakeswapSol.getPositionInfo(testPositionAddress);

        expect(positionInfo).toBeDefined();
        expect(positionInfo).not.toBeNull();

        if (positionInfo) {
          expect(positionInfo.address).toBe(testPositionAddress);
          expect(positionInfo.poolAddress).toBe(testPoolAddress);
          expect(positionInfo.baseTokenAddress).toBe('So11111111111111111111111111111111111111112');
          expect(positionInfo.quoteTokenAddress).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
          expect(positionInfo.lowerPrice).toBeGreaterThan(0);
          expect(positionInfo.upperPrice).toBeGreaterThan(0);
          expect(positionInfo.lowerPrice).toBeLessThan(positionInfo.upperPrice);
          expect(positionInfo.price).toBeGreaterThan(0);
          expect(typeof positionInfo.lowerBinId).toBe('number');
          expect(typeof positionInfo.upperBinId).toBe('number');

          console.log('\n💼 Position Info:');
          console.log(`  NFT: ${positionInfo.address}`);
          console.log(`  Pool: ${positionInfo.poolAddress}`);
          console.log(`  Price Range: ${positionInfo.lowerPrice.toFixed(6)} - ${positionInfo.upperPrice.toFixed(6)}`);
          console.log(`  Current Price: ${positionInfo.price.toFixed(6)}`);
          console.log(`  Tick Range: ${positionInfo.lowerBinId} - ${positionInfo.upperBinId}`);
          console.log(
            `  Liquidity: ${positionInfo.baseTokenAmount.toFixed(4)} SOL / ${positionInfo.quoteTokenAmount.toFixed(2)} USDC`,
          );
          console.log(`  Fees: ${positionInfo.baseFeeAmount} / ${positionInfo.quoteFeeAmount}`);
        }
      } catch (error: any) {
        // Position may have been closed - skip test
        if (error.message.includes('Position account not found')) {
          console.log('\n⚠️  Test position has been closed - skipping test');
          expect(true).toBe(true); // Mark test as passed
        } else {
          throw error; // Re-throw unexpected errors
        }
      }
    }, 30000);

    it('should throw error for invalid position address', async () => {
      const invalidPosition = '11111111111111111111111111111111';

      await expect(pancakeswapSol.getPositionInfo(invalidPosition)).rejects.toThrow();
    }, 30000);
  });
});
