import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Raydium } from '../../../../src/connectors/raydium/raydium';
import { addLiquidityRoute } from '../../../../src/connectors/raydium/amm-routes/addLiquidity';
import { poolInfoRoute as ammPoolInfoRoute } from '../../../../src/connectors/raydium/amm-routes/poolInfo';
import { positionInfoRoute as ammPositionInfoRoute } from '../../../../src/connectors/raydium/amm-routes/positionInfo';
import { quoteSwapRoute } from '../../../../src/connectors/raydium/amm-routes/quoteSwap';
import { poolInfoRoute as clmmPoolInfoRoute } from '../../../../src/connectors/raydium/clmm-routes/poolInfo';
import { positionInfoRoute as clmmPositionInfoRoute } from '../../../../src/connectors/raydium/clmm-routes/positionInfo';
import { positionsOwnedRoute } from '../../../../src/connectors/raydium/clmm-routes/positionsOwned';
import { quotePositionRoute } from '../../../../src/connectors/raydium/clmm-routes/quotePosition';
import { COMMON_TEST_CONSTANTS } from '../../utils/schema-test-utils';

// Set environment variables
process.env.GATEWAY_TEST_MODE = process.env.GATEWAY_TEST_MODE || 'dev';
process.env.NODE_ENV = 'test';

// Timeout for tests
const TIMEOUT = 30000;

describe('Raydium Live Tests', () => {
  let app;
  let raydium;
  const network = 'mainnet-beta';
  const wallet = COMMON_TEST_CONSTANTS.SOLANA.TEST_WALLET_ADDRESS;

  // Setup function to create a Fastify instance and register routes
  const setupApp = async () => {
    app = Fastify({
      logger: process.env.GATEWAY_TEST_MODE === 'live'
    });
    
    app.withTypeProvider();
    
    // Initialize Raydium connector
    raydium = await Raydium.getInstance(network);
    
    // Register AMM routes
    app.register(ammPoolInfoRoute);
    app.register(ammPositionInfoRoute);
    app.register(quoteSwapRoute);
    
    // Register CLMM routes
    app.register(clmmPoolInfoRoute);
    app.register(clmmPositionInfoRoute);
    app.register(positionsOwnedRoute);
    app.register(quotePositionRoute);
    
    await app.ready();
  };
  
  // Check if we should run live tests
  const skipIfNotLive = () => {
    if (process.env.GATEWAY_TEST_MODE !== 'live') {
      console.log('Skipping live tests, run with GATEWAY_TEST_MODE=live to enable');
      return true;
    }
    return false;
  };

  // Run once before all tests
  beforeAll(async () => {
    await setupApp();
  });
  
  // Run once after all tests
  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // Test AMM Pool Info
  describe('AMM - Pool Info', () => {
    it('should get AMM pool info with mock data', async () => {
      // Mock the raydium getAmmPool method
      const originalGetAmmPool = raydium.getAmmPool;
      raydium.getAmmPool = () => {
        return {
          id: COMMON_TEST_CONSTANTS.SOLANA.POOLS['SOL-USDC'],
          baseMint: COMMON_TEST_CONSTANTS.SOLANA.TOKENS.SOL.address,
          quoteMint: COMMON_TEST_CONSTANTS.SOLANA.TOKENS.USDC.address,
          lpMint: "8HoQnePLqPj4M7PUDzfw8e3Ymdwgc7NLGnaTUapubyvu",
          baseVault: "BGcwkj1WudQwUUjFk78hAjwd1uAm8trh1N4CJSa51euh",
          quoteVault: "4YEx8g8aPY4UD5m7D3rC7FEAkK8gZXdtQnw7xN2jJFNB",
          baseDecimals: 9,
          quoteDecimals: 6,
          lpDecimals: 9,
          version: 4,
          programId: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
          authority: "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",
          openOrders: "9ot4bg8aT2FRKfQVr9H9KS5j4koS2DYa6bAGRR5tTF7H",
          targetOrders: "DKZvYsZZuKD6e3yxoRAyUxjTE7Ee3vUo1LgPiSQJMz3F",
          baseVaultKey: "1",
          quoteVaultKey: "2",
          marketVersion: 3,
          marketProgramId: "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX",
          marketId: "8BnEgHoWFysVcuFFX7QztDmzuH8r5ZFvyP3sYwn1XTh6",
          lookupTableAccount: "14ivkzphtYoQft7Ps2BJHfXMYQCpYNFcGzD44eacEoB8",
          baseReserve: "100000000000",
          quoteReserve: "3000000000",
          lpSupply: "10000000000",
          price: 30.0
        };
      });
      
      const response = await app.inject({
        method: 'GET',
        url: '/amm/pool-info',
        query: {
          network: network,
          baseToken: 'SOL',
          quoteToken: 'USDC'
        }
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      
      expect(body).toHaveProperty('address');
      expect(body).toHaveProperty('baseTokenAddress');
      expect(body).toHaveProperty('quoteTokenAddress');
      expect(body).toHaveProperty('feePct');
      expect(body).toHaveProperty('price');
      expect(body).toHaveProperty('baseTokenAmount');
      expect(body).toHaveProperty('quoteTokenAmount');
      expect(body).toHaveProperty('lpMint');
    });
    
    it('should get AMM pool info from mainnet-beta', async () => {
      if (skipIfNotLive()) return;
      
      const response = await app.inject({
        method: 'GET',
        url: '/amm/pool-info',
        query: {
          network: network,
          baseToken: 'SOL',
          quoteToken: 'USDC'
        }
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      
      expect(body).toHaveProperty('address');
      expect(body).toHaveProperty('baseTokenAddress');
      expect(body).toHaveProperty('quoteTokenAddress');
      expect(body).toHaveProperty('feePct');
      expect(body).toHaveProperty('price');
      expect(body).toHaveProperty('baseTokenAmount');
      expect(body).toHaveProperty('quoteTokenAmount');
      expect(body).toHaveProperty('lpMint');
      
      console.log('Live AMM Pool Info:', JSON.stringify(body, null, 2));
    });
  });
  
  // Test CLMM Pool Info
  describe('CLMM - Pool Info', () => {
    it('should get CLMM pool info with mock data', async () => {
      // Mock the raydium getClmmPool method
      const originalGetClmmPool = raydium.getClmmPool;
      raydium.getClmmPool = () => {
        return {
          id: "7quzvT3yBcbxLMGxbvHBwrXuUeN5xHPGUXUm6eKwLMsW",
          baseMint: COMMON_TEST_CONSTANTS.SOLANA.TOKENS.SOL.address,
          quoteMint: COMMON_TEST_CONSTANTS.SOLANA.TOKENS.USDC.address,
          lpMint: "SoLWs9Ni9MZTXqps9vxWPYKqYXvNsN81bBMJXu8LJF9",
          baseVault: "BGcwkj1WudQwUUjFk78hAjwd1uAm8trh1N4CJSa51euh",
          quoteVault: "4YEx8g8aPY4UD5m7D3rC7FEAkK8gZXdtQnw7xN2jJFNB",
          baseDecimals: 9,
          quoteDecimals: 6,
          lpDecimals: 9,
          ammType: "Stable",
          status: "Created",
          version: 6,
          programId: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
          ammConfig: {
            tradeFeeRate: 0.0025,
            protocolFeeRate: 0.0005,
            fundFeeRate: 0,
            tickSpacing: 10,
            fundOwner: "8JUjWjAyXTMB4ZXcV7nk3p6Tx7pCs6WAx8Yyj5y4HrjX"
          },
          price: 30.0,
          liquidity: "1000000000000",
          sqrtPrice: "1000000000",
          tickCurrent: 10000,
          tickLower: 9950,
          tickUpper: 10050,
          observationId: "9ot4bg8aT2FRKfQVr9H9KS5j4koS2DYa6bAGRR5tTF7H",
          observationUpdateQ: "57738875",
          swapInAmountTokenA: "10000000000",
          swapOutAmountTokenB: "300000000",
          swapInAmountTokenB: "100000000",
          swapOutAmountTokenA: "3333333333",
          tokenAVault: "BXZX2JRJFHJuwHMWQR2X4SCL5Qh3SWB8ox9e7UKhtrmZ",
          tokenBVault: "8T9eJ9ZG41n2qm4Pe3LYS3Ub7npEWUaZTG3b8LTtYnfA",
          mintA: {
            programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            mint: COMMON_TEST_CONSTANTS.SOLANA.TOKENS.SOL.address,
            decimals: 9,
            freezeAuthority: "",
            mintAuthority: ""
          },
          mintB: {
            programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            mint: COMMON_TEST_CONSTANTS.SOLANA.TOKENS.USDC.address,
            decimals: 6,
            freezeAuthority: "",
            mintAuthority: ""
          }
        };
      });
      
      const response = await app.inject({
        method: 'GET',
        url: '/clmm/pool-info',
        query: {
          network: network,
          baseToken: 'SOL',
          quoteToken: 'USDC',
          feeTier: 'MEDIUM'
        }
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      
      expect(body).toHaveProperty('address');
      expect(body).toHaveProperty('baseTokenAddress');
      expect(body).toHaveProperty('quoteTokenAddress');
      expect(body).toHaveProperty('binStep');
      expect(body).toHaveProperty('feePct');
      expect(body).toHaveProperty('price');
      expect(body).toHaveProperty('baseTokenAmount');
      expect(body).toHaveProperty('quoteTokenAmount');
      expect(body).toHaveProperty('activeBinId');
    });
    
    it('should get CLMM pool info from mainnet-beta', async () => {
      if (skipIfNotLive()) return;
      
      const response = await app.inject({
        method: 'GET',
        url: '/clmm/pool-info',
        query: {
          network: network,
          baseToken: 'SOL',
          quoteToken: 'USDC',
          feeTier: 'MEDIUM'
        }
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      
      expect(body).toHaveProperty('address');
      expect(body).toHaveProperty('baseTokenAddress');
      expect(body).toHaveProperty('quoteTokenAddress');
      expect(body).toHaveProperty('binStep');
      expect(body).toHaveProperty('feePct');
      expect(body).toHaveProperty('price');
      expect(body).toHaveProperty('baseTokenAmount');
      expect(body).toHaveProperty('quoteTokenAmount');
      expect(body).toHaveProperty('activeBinId');
      
      console.log('Live CLMM Pool Info:', JSON.stringify(body, null, 2));
    });
  });
  
  // Test CLMM Positions Owned
  describe('CLMM - Positions Owned', () => {
    it('should get positions owned with mock data', async () => {
      // Mock the raydium getClmmPositionsByOwner method
      const originalGetClmmPositionsByOwner = raydium.getClmmPositionsByOwner;
      raydium.getClmmPositionsByOwner = () => {
        return [{
          id: "7E2qVUhVgzHkrWP1QCi6fSjU9kZ1KUAvwhzB9h9mzWJA",
          poolId: "7quzvT3yBcbxLMGxbvHBwrXuUeN5xHPGUXUm6eKwLMsW",
          owner: COMMON_TEST_CONSTANTS.SOLANA.TEST_WALLET_ADDRESS,
          liquidity: "1000000000",
          tickLower: 9950,
          tickUpper: 10050,
          feeGrowthInsideLastX64A: "0",
          feeGrowthInsideLastX64B: "0",
          tokenAFee: "1000000",
          tokenBFee: "3000",
          rewardInfos: [],
          price: 30.0,
          tokenAAmount: 0.5,
          tokenBAmount: 15.0,
          poolData: {
            id: "7quzvT3yBcbxLMGxbvHBwrXuUeN5xHPGUXUm6eKwLMsW",
            baseMint: COMMON_TEST_CONSTANTS.SOLANA.TOKENS.SOL.address,
            quoteMint: COMMON_TEST_CONSTANTS.SOLANA.TOKENS.USDC.address,
            tickCurrent: 10000,
            price: 30.0,
            sqrtPrice: "1000000000",
            ammConfig: {
              tradeFeeRate: 0.0025,
              protocolFeeRate: 0.0005,
              tickSpacing: 10
            }
          }
        }];
      });
      
      const response = await app.inject({
        method: 'GET',
        url: '/clmm/positions-owned',
        query: {
          network: network,
          walletAddress: wallet
        }
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      
      expect(Array.isArray(body)).toBe(true);
      if (body.length > 0) {
        expect(body[0]).toHaveProperty('address');
        expect(body[0]).toHaveProperty('poolAddress');
        expect(body[0]).toHaveProperty('baseTokenAmount');
        expect(body[0]).toHaveProperty('quoteTokenAmount');
        expect(body[0]).toHaveProperty('lowerPrice');
        expect(body[0]).toHaveProperty('upperPrice');
      }
    });
    
    it('should get positions owned from mainnet-beta', async () => {
      if (skipIfNotLive()) return;
      
      const response = await app.inject({
        method: 'GET',
        url: '/clmm/positions-owned',
        query: {
          network: network,
          walletAddress: wallet
        }
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      
      expect(Array.isArray(body)).toBe(true);
      if (body.length > 0) {
        expect(body[0]).toHaveProperty('address');
        expect(body[0]).toHaveProperty('poolAddress');
        expect(body[0]).toHaveProperty('baseTokenAmount');
        expect(body[0]).toHaveProperty('quoteTokenAmount');
        expect(body[0]).toHaveProperty('lowerPrice');
        expect(body[0]).toHaveProperty('upperPrice');
        
        console.log('Live Positions Owned:', JSON.stringify(body, null, 2));
      } else {
        console.log('No positions found for the wallet address');
      }
    });
  });
  
  // Test Quote Swap
  describe('AMM - Quote Swap', () => {
    it('should get swap quote with mock data', async () => {
      // Mock the raydium getAmmQuote method
      const originalGetAmmQuote = raydium.getAmmQuote;
      raydium.getAmmQuote = () => {
        return {
          amountIn: 1.0,
          amountOut: 30.0,
          fee: 0.075,
          priceImpact: 0.001,
          minAmountOut: 29.85,
          maxAmountIn: 1.005,
          executionPrice: 30.0,
          pool: {
            id: COMMON_TEST_CONSTANTS.SOLANA.POOLS['SOL-USDC'],
            baseMint: COMMON_TEST_CONSTANTS.SOLANA.TOKENS.SOL.address,
            quoteMint: COMMON_TEST_CONSTANTS.SOLANA.TOKENS.USDC.address,
            fee: 0.0025
          }
        };
      });
      
      const response = await app.inject({
        method: 'GET',
        url: '/amm/quote-swap',
        query: {
          network: network,
          baseToken: 'SOL',
          quoteToken: 'USDC',
          amount: 1.0,
          side: 'SELL',
          slippagePct: 0.5
        }
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      
      expect(body).toHaveProperty('poolAddress');
      expect(body).toHaveProperty('estimatedAmountIn');
      expect(body).toHaveProperty('estimatedAmountOut');
      expect(body).toHaveProperty('minAmountOut');
      expect(body).toHaveProperty('maxAmountIn');
      expect(body).toHaveProperty('price');
    });
    
    it('should get swap quote from mainnet-beta', async () => {
      if (skipIfNotLive()) return;
      
      const response = await app.inject({
        method: 'GET',
        url: '/amm/quote-swap',
        query: {
          network: network,
          baseToken: 'SOL',
          quoteToken: 'USDC',
          amount: 1.0,
          side: 'SELL',
          slippagePct: 0.5
        }
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      
      expect(body).toHaveProperty('poolAddress');
      expect(body).toHaveProperty('estimatedAmountIn');
      expect(body).toHaveProperty('estimatedAmountOut');
      expect(body).toHaveProperty('minAmountOut');
      expect(body).toHaveProperty('maxAmountIn');
      expect(body).toHaveProperty('price');
      
      console.log('Live AMM Swap Quote:', JSON.stringify(body, null, 2));
    });
  });
});