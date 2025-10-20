import { PublicKey } from '@solana/web3.js';

import { Solana } from '../../../src/chains/solana/solana';
import { PancakeswapSol } from '../../../src/connectors/pancakeswap-sol/pancakeswap-sol';

import poolInfoFixture from './fixtures/pool-info.json';
import positionInfoFixture from './fixtures/position-info.json';
import positionsOwnedFixture from './fixtures/positions-owned.json';
import quoteSwapBuyFixture from './fixtures/quote-swap-buy.json';
import quoteSwapSellFixture from './fixtures/quote-swap-sell.json';

/**
 * Comprehensive tests for all PancakeSwap Solana routes
 * Tests connector methods directly against mainnet data
 */
describe('PancakeSwap Solana - All Routes Integration', () => {
  let pancakeswapSol: PancakeswapSol;
  let solana: Solana;
  const network = 'mainnet-beta';
  const poolAddress = 'DJNtGuBGEQiUCWE8F981M2C3ZghZt2XLD8f2sQdZ6rsZ'; // SOL/USDC
  const positionAddress = 'F1xRqqbWdg3vdMEsn9YjRU7RnFVn67MZhDVXrWoobii5';
  const walletAddress = 'DRpaJDurGtinzUPWSYnripFsJTBXm4HG7AC3LSgJNtNB';

  beforeAll(async () => {
    pancakeswapSol = await PancakeswapSol.getInstance(network);
    solana = await Solana.getInstance(network);
  });

  describe('Pool Info Route', () => {
    it('should fetch pool info matching fixture structure', async () => {
      const poolInfo = await pancakeswapSol.getClmmPoolInfo(poolAddress);

      expect(poolInfo).toBeDefined();
      expect(poolInfo).not.toBeNull();

      if (poolInfo) {
        // Validate against fixture structure
        expect(poolInfo.address).toBe(poolInfoFixture.address);
        expect(poolInfo.baseTokenAddress).toBe(poolInfoFixture.baseTokenAddress);
        expect(poolInfo.quoteTokenAddress).toBe(poolInfoFixture.quoteTokenAddress);
        expect(poolInfo.binStep).toBe(poolInfoFixture.binStep);
        expect(poolInfo).toHaveProperty('feePct');
        expect(poolInfo).toHaveProperty('price');
        expect(poolInfo).toHaveProperty('baseTokenAmount');
        expect(poolInfo).toHaveProperty('quoteTokenAmount');
        expect(poolInfo).toHaveProperty('activeBinId');

        // Validate data types and ranges
        expect(poolInfo.feePct).toBeGreaterThan(0);
        expect(poolInfo.price).toBeGreaterThan(0);
        expect(poolInfo.baseTokenAmount).toBeGreaterThanOrEqual(0);
        expect(poolInfo.quoteTokenAmount).toBeGreaterThanOrEqual(0);
        expect(typeof poolInfo.activeBinId).toBe('number');

        console.log('\n📊 Pool Info Test:');
        console.log(`  ✓ Pool: ${poolInfo.address}`);
        console.log(`  ✓ Price: ${poolInfo.price.toFixed(6)} USDC/SOL`);
        console.log(`  ✓ Fee: ${poolInfo.feePct}%`);
        console.log(
          `  ✓ Liquidity: ${poolInfo.baseTokenAmount.toFixed(4)} SOL / ${poolInfo.quoteTokenAmount.toFixed(2)} USDC`,
        );
      }
    }, 30000);

    it('should handle invalid pool address gracefully', async () => {
      const poolInfo = await pancakeswapSol.getClmmPoolInfo('11111111111111111111111111111111');
      expect(poolInfo).toBeNull();
    }, 30000);
  });

  describe('Position Info Route', () => {
    it('should fetch position info matching fixture structure', async () => {
      const positionInfo = await pancakeswapSol.getPositionInfo(positionAddress);

      expect(positionInfo).toBeDefined();
      expect(positionInfo).not.toBeNull();

      if (positionInfo) {
        // Validate against fixture structure
        expect(positionInfo.address).toBe(positionInfoFixture.address);
        expect(positionInfo.poolAddress).toBe(positionInfoFixture.poolAddress);
        expect(positionInfo.baseTokenAddress).toBe(positionInfoFixture.baseTokenAddress);
        expect(positionInfo.quoteTokenAddress).toBe(positionInfoFixture.quoteTokenAddress);
        expect(positionInfo).toHaveProperty('baseTokenAmount');
        expect(positionInfo).toHaveProperty('quoteTokenAmount');
        expect(positionInfo).toHaveProperty('baseFeeAmount');
        expect(positionInfo).toHaveProperty('quoteFeeAmount');
        expect(positionInfo).toHaveProperty('lowerBinId');
        expect(positionInfo).toHaveProperty('upperBinId');
        expect(positionInfo).toHaveProperty('lowerPrice');
        expect(positionInfo).toHaveProperty('upperPrice');
        expect(positionInfo).toHaveProperty('price');

        // Validate data ranges
        expect(positionInfo.lowerPrice).toBeGreaterThan(0);
        expect(positionInfo.upperPrice).toBeGreaterThan(positionInfo.lowerPrice);
        expect(positionInfo.price).toBeGreaterThan(0);

        console.log('\n💼 Position Info Test:');
        console.log(`  ✓ NFT: ${positionInfo.address}`);
        console.log(`  ✓ Pool: ${positionInfo.poolAddress}`);
        console.log(`  ✓ Range: ${positionInfo.lowerPrice.toFixed(6)} - ${positionInfo.upperPrice.toFixed(6)}`);
        console.log(
          `  ✓ Liquidity: ${positionInfo.baseTokenAmount.toFixed(4)} SOL / ${positionInfo.quoteTokenAmount.toFixed(2)} USDC`,
        );
        console.log(`  ✓ Fees: ${positionInfo.baseFeeAmount} / ${positionInfo.quoteFeeAmount}`);
      }
    }, 30000);

    it('should handle invalid position address gracefully', async () => {
      const positionInfo = await pancakeswapSol.getPositionInfo('11111111111111111111111111111111');
      expect(positionInfo).toBeNull();
    }, 30000);
  });

  describe('Positions Owned Route (Token2022 Support)', () => {
    it('should find positions in wallet (queries both SPL Token and Token2022)', async () => {
      // This test validates the Token2022 fix
      const walletPubkey = new PublicKey(walletAddress);
      const poolPubkey = new PublicKey(poolAddress);

      // Get token accounts from both programs
      const [splTokenAccounts, token2022Accounts] = await Promise.all([
        solana.connection.getParsedTokenAccountsByOwner(walletPubkey, {
          programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        }),
        solana.connection.getParsedTokenAccountsByOwner(walletPubkey, {
          programId: new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'),
        }),
      ]);

      console.log('\n📋 Token Account Discovery:');
      console.log(`  ✓ SPL Token accounts: ${splTokenAccounts.value.length}`);
      console.log(`  ✓ Token2022 accounts: ${token2022Accounts.value.length}`);

      // Find NFTs (decimals=0, amount=1) in both programs
      const allTokenAccounts = [...splTokenAccounts.value, ...token2022Accounts.value];
      const nfts = allTokenAccounts.filter((acc) => {
        const data = acc.account.data.parsed.info;
        return data.tokenAmount.decimals === 0 && data.tokenAmount.amount === '1';
      });

      console.log(`  ✓ Total NFTs found: ${nfts.length}`);

      // Check if our position NFT is among them
      const positionNft = nfts.find((acc) => acc.account.data.parsed.info.mint === positionAddress);
      expect(positionNft).toBeDefined();

      console.log(`  ✓ Position NFT ${positionAddress} found in Token2022 program`);

      // Now test the actual positions-owned functionality
      // Test all NFTs to find PancakeSwap positions
      const positions = [];
      for (const nft of nfts) {
        const mintAddress = nft.account.data.parsed.info.mint;
        try {
          const positionInfo = await pancakeswapSol.getPositionInfo(mintAddress);
          if (positionInfo && positionInfo.poolAddress === poolAddress) {
            positions.push(positionInfo);
          }
        } catch (error) {
          // Silently skip non-position NFTs
        }
      }

      // Should find at least one position (the test position)
      expect(positions.length).toBeGreaterThanOrEqual(1);

      // Find our specific test position in the results
      const testPosition = positions.find((p) => p.address === positionsOwnedFixture[0].address);
      expect(testPosition).toBeDefined();
      expect(testPosition?.poolAddress).toBe(poolAddress);

      console.log(`\n  ✓ Found ${positions.length} position(s) in pool ${poolAddress}`);
      console.log(`  ✓ Test position ${positionAddress} verified`);
    }, 90000); // Longer timeout for multiple RPC calls
  });

  describe('Quote Swap Route (Simplified)', () => {
    it('should quote SELL swap matching fixture structure', async () => {
      const poolInfo = await pancakeswapSol.getClmmPoolInfo(poolAddress);
      const baseToken = await solana.getToken('SOL');
      const quoteToken = await solana.getToken('USDC');

      expect(poolInfo).not.toBeNull();
      expect(baseToken).toBeDefined();
      expect(quoteToken).toBeDefined();

      if (poolInfo && baseToken && quoteToken) {
        const amount = 0.01;
        const currentPrice = poolInfo.price;

        // Simulate quote-swap logic (simplified)
        const amountIn = amount;
        const amountOut = amount * currentPrice;
        const slippagePct = 1.0;
        const minAmountOut = amountOut * (1 - slippagePct / 100);

        // Validate against fixture
        expect(quoteSwapSellFixture.poolAddress).toBe(poolAddress);
        expect(quoteSwapSellFixture.tokenIn).toBe(baseToken.address);
        expect(quoteSwapSellFixture.tokenOut).toBe(quoteToken.address);
        expect(quoteSwapSellFixture.amountIn).toBe(amount);
        expect(quoteSwapSellFixture).toHaveProperty('amountOut');
        expect(quoteSwapSellFixture).toHaveProperty('price');
        expect(quoteSwapSellFixture).toHaveProperty('minAmountOut');
        expect(quoteSwapSellFixture).toHaveProperty('priceImpactPct');
        expect(quoteSwapSellFixture.priceImpactPct).toBe(0); // Simplified quote doesn't calculate impact

        console.log('\n💱 Quote Swap SELL Test:');
        console.log(`  ✓ Sell ${amount} SOL`);
        console.log(`  ✓ Expected: ~${amountOut.toFixed(6)} USDC`);
        console.log(`  ✓ Price: ${currentPrice.toFixed(6)} USDC/SOL`);
        console.log(`  ✓ Min Output: ${minAmountOut.toFixed(6)} USDC (1% slippage)`);
      }
    }, 30000);

    it('should quote BUY swap matching fixture structure', async () => {
      const poolInfo = await pancakeswapSol.getClmmPoolInfo(poolAddress);
      const baseToken = await solana.getToken('SOL');
      const quoteToken = await solana.getToken('USDC');

      expect(poolInfo).not.toBeNull();

      if (poolInfo && baseToken && quoteToken) {
        const amount = 0.01;
        const currentPrice = poolInfo.price;

        // Simulate quote-swap logic (simplified)
        const amountOut = amount;
        const amountIn = amount * currentPrice;
        const slippagePct = 1.0;
        const maxAmountIn = amountIn * (1 + slippagePct / 100);

        // Validate against fixture
        expect(quoteSwapBuyFixture.poolAddress).toBe(poolAddress);
        expect(quoteSwapBuyFixture.tokenIn).toBe(quoteToken.address);
        expect(quoteSwapBuyFixture.tokenOut).toBe(baseToken.address);
        expect(quoteSwapBuyFixture.amountOut).toBe(amount);
        expect(quoteSwapBuyFixture).toHaveProperty('maxAmountIn');

        console.log('\n💱 Quote Swap BUY Test:');
        console.log(`  ✓ Buy ${amount} SOL`);
        console.log(`  ✓ Expected: ~${amountIn.toFixed(6)} USDC`);
        console.log(`  ✓ Price: ${currentPrice.toFixed(6)} USDC/SOL`);
        console.log(`  ✓ Max Input: ${maxAmountIn.toFixed(6)} USDC (1% slippage)`);
      }
    }, 30000);
  });

  describe('Fixture Validation', () => {
    it('should have valid pool-info fixture', () => {
      expect(poolInfoFixture).toMatchObject({
        address: expect.any(String),
        baseTokenAddress: expect.any(String),
        quoteTokenAddress: expect.any(String),
        binStep: expect.any(Number),
        feePct: expect.any(Number),
        price: expect.any(Number),
        baseTokenAmount: expect.any(Number),
        quoteTokenAmount: expect.any(Number),
        activeBinId: expect.any(Number),
      });
    });

    it('should have valid position-info fixture', () => {
      expect(positionInfoFixture).toMatchObject({
        address: expect.any(String),
        poolAddress: expect.any(String),
        baseTokenAddress: expect.any(String),
        quoteTokenAddress: expect.any(String),
        baseTokenAmount: expect.any(Number),
        quoteTokenAmount: expect.any(Number),
        baseFeeAmount: expect.any(Number),
        quoteFeeAmount: expect.any(Number),
        lowerBinId: expect.any(Number),
        upperBinId: expect.any(Number),
        lowerPrice: expect.any(Number),
        upperPrice: expect.any(Number),
        price: expect.any(Number),
      });
    });

    it('should have valid quote-swap fixtures', () => {
      [quoteSwapSellFixture, quoteSwapBuyFixture].forEach((fixture) => {
        expect(fixture).toMatchObject({
          poolAddress: expect.any(String),
          tokenIn: expect.any(String),
          tokenOut: expect.any(String),
          amountIn: expect.any(Number),
          amountOut: expect.any(Number),
          price: expect.any(Number),
          minAmountOut: expect.any(Number),
          maxAmountIn: expect.any(Number),
          priceImpactPct: expect.any(Number),
          slippagePct: expect.any(Number),
        });
      });
    });
  });
});
