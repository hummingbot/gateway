/**
 * NFT Staking Route Integration Tests
 *
 * Tests the four PancakeSwap MasterChef staking endpoints via Fastify injection:
 *   POST /connectors/pancakeswap/nft-staking/masterchef-stake
 *   POST /connectors/pancakeswap/nft-staking/masterchef-unstake
 *   POST /connectors/pancakeswap/nft-staking/masterchef-unstake-and-close
 *   POST /connectors/pancakeswap/nft-staking/masterchef-knows-pool
 *
 * Strategy:
 *  - The Pancakeswap class is mocked at module level so no real RPC calls are made.
 *  - Each describe block covers: happy path, schema validation, error propagation,
 *    and boundary / edge-case inputs (QA lens).
 */

import '../../mocks/app-mocks';

import { FastifyInstance } from 'fastify';

import { gatewayApp } from '../../../src/app';

// ---------------------------------------------------------------------------
// Shared test constants
// ---------------------------------------------------------------------------
const BASE_URL = '/connectors/pancakeswap/nft-staking';
const VALID_WALLET = '0x742d35Cc6634C0532925a3b844Bc9e7595f42e0E';
const VALID_TOKEN_ID = 6350589;
const VALID_NETWORK = 'bsc';
const VALID_POOL_ADDRESS = '0xA5067360b13Fc7A2685Dc82dcD1bF2B4B8D7868B';
const CAKE_ADDRESS = '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82';
const TX_HASH_STAKE = '0xabc123def456abc123def456abc123def456abc123def456abc123def456abc1';
const TX_HASH_UNSTAKE = '0xdef789abc123def789abc123def789abc123def789abc123def789abc123def7';

// ---------------------------------------------------------------------------
// Mock Pancakeswap module
// ---------------------------------------------------------------------------
const mockStakeNft = jest.fn();
const mockUnstakeNft = jest.fn();
const mockGetV3PoolIdFromMasterChef = jest.fn();
const mockGetInstance = jest.fn();

jest.mock('../../../src/connectors/pancakeswap/pancakeswap', () => ({
  Pancakeswap: {
    getInstance: (...args: any[]) => mockGetInstance(...args),
  },
}));

// Mock closePosition used by masterchef-unstake-and-close.
// We must preserve the `default` export (the Fastify plugin function) so that
// clmm-routes/index.ts can register it without Fastify throwing
// "Plugin must be a function".
const mockClosePosition = jest.fn();
jest.mock('../../../src/connectors/pancakeswap/clmm-routes/closePosition', () => ({
  __esModule: true,
  // Named export used by masterchef-unstake-and-close route handler
  closePosition: (...args: any[]) => mockClosePosition(...args),
  // Default export: no-op Fastify plugin so the CLMM index can register it
  default: async (_fastify: any) => {},
}));

// ---------------------------------------------------------------------------
// Default mock return values (happy path)
// ---------------------------------------------------------------------------
const defaultStakeResult = {
  txHash: TX_HASH_STAKE,
  poolId: 3,
  poolAddress: VALID_POOL_ADDRESS,
  baseTokenAddress: CAKE_ADDRESS,
  baseTokenSymbol: 'CAKE',
  quoteTokenAddress: '0x55d398326f99059fF775485246999027B3197955',
  quoteTokenSymbol: 'USDT',
  feePct: 0.25,
  liquidity: '987654321098765',
  tickLower: -887272,
  tickUpper: 887272,
  currentPrice: 2.45,
  lowerPrice: 1.0,
  upperPrice: 5.0,
  inRange: true,
  cakePerSecond: 0.00423,
  rewardEndTime: 1780000000,
  isRewardActive: true,
};

const defaultUnstakeResult = {
  txHash: TX_HASH_UNSTAKE,
  rewardAmount: 12.345678,
  rewardToken: 'CAKE',
  rewardTokenAddress: CAKE_ADDRESS,
};

const defaultCloseResult = {
  signature: '0xfff666eee555ddd444ccc333bbb222aaa111fff666eee555ddd444ccc333bbb2',
  data: {
    fee: 0.00045,
    positionRentRefunded: 0,
    baseTokenAmountRemoved: 100.0,
    quoteTokenAmountRemoved: 245.0,
    baseFeeAmountCollected: 1.23,
    quoteFeeAmountCollected: 3.01,
    baseTokenSymbol: 'CAKE',
    baseTokenAddress: CAKE_ADDRESS,
    quoteTokenSymbol: 'USDT',
    quoteTokenAddress: '0x55d398326f99059fF775485246999027B3197955',
  },
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------
describe('NFT Staking Routes', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = gatewayApp;
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: all methods succeed
    mockGetInstance.mockResolvedValue({
      stakeNft: mockStakeNft,
      unstakeNft: mockUnstakeNft,
      getV3PoolIdFromMasterChef: mockGetV3PoolIdFromMasterChef,
    });
    mockStakeNft.mockResolvedValue(defaultStakeResult);
    mockUnstakeNft.mockResolvedValue(defaultUnstakeResult);
    mockGetV3PoolIdFromMasterChef.mockResolvedValue(3);
    mockClosePosition.mockResolvedValue(defaultCloseResult);
  });

  // =========================================================================
  // masterchef-stake
  // =========================================================================
  describe('POST /masterchef-stake', () => {
    const url = `${BASE_URL}/masterchef-stake`;

    // --- Happy Path ---
    it('returns 200 and full stake metadata on success', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET, tokenId: VALID_TOKEN_ID },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.txHash).toBe(TX_HASH_STAKE);
      expect(body.poolId).toBe(3);
      expect(body.poolAddress).toBe(VALID_POOL_ADDRESS);
      expect(body.baseTokenSymbol).toBe('CAKE');
      expect(body.quoteTokenSymbol).toBe('USDT');
      expect(body.feePct).toBe(0.25);
      expect(body.liquidity).toBe('987654321098765');
      expect(body.tickLower).toBe(-887272);
      expect(body.tickUpper).toBe(887272);
      expect(body.currentPrice).toBe(2.45);
      expect(body.lowerPrice).toBe(1.0);
      expect(body.upperPrice).toBe(5.0);
      expect(body.inRange).toBe(true);
      expect(body.cakePerSecond).toBe(0.00423);
      expect(body.rewardEndTime).toBe(1780000000);
      expect(body.isRewardActive).toBe(true);
      expect(body.message).toContain('6350589');
      expect(body.message).toContain('CAKE/USDT');
    });

    it('calls Pancakeswap.getInstance with the correct network', async () => {
      await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET, tokenId: VALID_TOKEN_ID },
      });
      expect(mockGetInstance).toHaveBeenCalledWith(VALID_NETWORK);
    });

    it('calls stakeNft with the correct tokenId and walletAddress', async () => {
      await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET, tokenId: VALID_TOKEN_ID },
      });
      expect(mockStakeNft).toHaveBeenCalledWith(VALID_TOKEN_ID, VALID_WALLET);
    });

    // --- Position not in range ---
    it('returns 200 with inRange=false when position is out of range', async () => {
      mockStakeNft.mockResolvedValueOnce({ ...defaultStakeResult, inRange: false });
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET, tokenId: VALID_TOKEN_ID },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().inRange).toBe(false);
    });

    // --- Reward period expired ---
    it('returns 200 with isRewardActive=false when reward period has ended', async () => {
      mockStakeNft.mockResolvedValueOnce({ ...defaultStakeResult, isRewardActive: false, rewardEndTime: 1000 });
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET, tokenId: VALID_TOKEN_ID },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().isRewardActive).toBe(false);
    });

    // --- Schema Validation ---
    it('returns 400 when body is missing required fields', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: {},
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when tokenId is missing', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when walletAddress is missing', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, tokenId: VALID_TOKEN_ID },
      });
      expect(response.statusCode).toBe(400);
    });

    it('falls back to default network when network is omitted (schema has default: bsc)', async () => {
      // MasterChefStakeSchema declares default:'bsc' so a missing network is
      // filled in by the schema — the route receives it and proceeds normally.
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { walletAddress: VALID_WALLET, tokenId: VALID_TOKEN_ID },
      });
      // Should NOT return 400 — the default kicks in and stakeNft is called
      expect(response.statusCode).not.toBe(400);
    });

    it('returns 400 when tokenId is a string instead of number', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET, tokenId: 'not-a-number' },
      });
      expect(response.statusCode).toBe(400);
    });

    // --- Error Propagation ---
    it('returns 500 when stakeNft throws "NFT not owned by wallet"', async () => {
      mockStakeNft.mockRejectedValueOnce(new Error('Position 6350589 is not owned by wallet 0x742d35Cc'));
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET, tokenId: VALID_TOKEN_ID },
      });
      expect(response.statusCode).toBe(500);
      expect(response.json().error).toContain('Failed to stake NFT');
    });

    it('returns 500 when stakeNft throws "already staked" error', async () => {
      mockStakeNft.mockRejectedValueOnce(new Error(`NFT ${VALID_TOKEN_ID} is already staked in MasterChef.`));
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET, tokenId: VALID_TOKEN_ID },
      });
      expect(response.statusCode).toBe(500);
      expect(response.json().error).toContain('already staked');
    });

    it('returns 500 when stakeNft throws "zero liquidity" error', async () => {
      mockStakeNft.mockRejectedValueOnce(
        new Error(`Position ${VALID_TOKEN_ID} has zero liquidity and cannot be staked.`),
      );
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET, tokenId: VALID_TOKEN_ID },
      });
      expect(response.statusCode).toBe(500);
      expect(response.json().error).toContain('zero liquidity');
    });

    it('returns 500 when stakeNft throws "pool not registered in MasterChef"', async () => {
      mockStakeNft.mockRejectedValueOnce(
        new Error(`Pool for position ${VALID_TOKEN_ID} is not registered in MasterChef.`),
      );
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET, tokenId: VALID_TOKEN_ID },
      });
      expect(response.statusCode).toBe(500);
      expect(response.json().error.toLowerCase()).toContain('pool');
    });

    it('returns 500 when stakeNft throws "MasterChef not approved"', async () => {
      mockStakeNft.mockRejectedValueOnce(new Error(`MasterChef is not approved to transfer your NFTs.`));
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET, tokenId: VALID_TOKEN_ID },
      });
      expect(response.statusCode).toBe(500);
      expect(response.json().error).toContain('Failed to stake NFT');
    });

    it('returns 500 when getInstance throws (unknown network)', async () => {
      mockGetInstance.mockRejectedValueOnce(new Error('Unknown network: fantom'));
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: 'fantom', walletAddress: VALID_WALLET, tokenId: VALID_TOKEN_ID },
      });
      expect(response.statusCode).toBe(500);
    });

    // --- Edge Cases ---
    it('handles tokenId of 0 (boundary: lowest valid uint256)', async () => {
      mockStakeNft.mockResolvedValueOnce({ ...defaultStakeResult });
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET, tokenId: 0 },
      });
      // Should reach the handler (schema passes 0 as a valid number)
      expect(response.statusCode).not.toBe(400);
    });

    it('handles very large tokenId (uint256 boundary)', async () => {
      const largeTokenId = 999999999;
      mockStakeNft.mockResolvedValueOnce({ ...defaultStakeResult });
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET, tokenId: largeTokenId },
      });
      expect(response.statusCode).not.toBe(400);
    });

    it('handles cakePerSecond of 0 (no active rewards)', async () => {
      mockStakeNft.mockResolvedValueOnce({
        ...defaultStakeResult,
        cakePerSecond: 0,
        isRewardActive: false,
        rewardEndTime: 0,
      });
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET, tokenId: VALID_TOKEN_ID },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().cakePerSecond).toBe(0);
      expect(response.json().isRewardActive).toBe(false);
    });
  });

  // =========================================================================
  // masterchef-unstake
  // =========================================================================
  describe('POST /masterchef-unstake', () => {
    const url = `${BASE_URL}/masterchef-unstake`;

    // --- Happy Path ---
    it('returns 200 with txHash and rewardAmount on success', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET, tokenId: VALID_TOKEN_ID },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.txHash).toBe(TX_HASH_UNSTAKE);
      expect(body.rewardAmount).toBe(12.345678);
      expect(body.rewardToken).toBe('CAKE');
      expect(body.rewardTokenAddress).toBe(CAKE_ADDRESS);
      expect(body.message).toContain('6350589');
      expect(body.message).toContain('CAKE');
    });

    it('calls unstakeNft with the correct tokenId and walletAddress', async () => {
      await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET, tokenId: VALID_TOKEN_ID },
      });
      expect(mockUnstakeNft).toHaveBeenCalledWith(VALID_TOKEN_ID, VALID_WALLET);
    });

    // --- Zero reward ---
    it('returns 200 with rewardAmount=0 when no CAKE was accumulated', async () => {
      mockUnstakeNft.mockResolvedValueOnce({
        ...defaultUnstakeResult,
        rewardAmount: 0,
      });
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET, tokenId: VALID_TOKEN_ID },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().rewardAmount).toBe(0);
    });

    // --- Schema Validation ---
    it('returns 400 when body is empty', async () => {
      const response = await fastify.inject({ method: 'POST', url, payload: {} });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when tokenId is missing', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when walletAddress is missing', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, tokenId: VALID_TOKEN_ID },
      });
      expect(response.statusCode).toBe(400);
    });

    // --- Error Propagation ---
    it('returns 500 when unstakeNft throws (NFT not staked)', async () => {
      mockUnstakeNft.mockRejectedValueOnce(new Error('NFT not currently staked in MasterChef'));
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET, tokenId: VALID_TOKEN_ID },
      });
      expect(response.statusCode).toBe(500);
      expect(response.json().error).toContain('Failed to unstake NFT');
    });

    it('returns 500 when unstakeNft throws (wrong wallet)', async () => {
      mockUnstakeNft.mockRejectedValueOnce(new Error('caller is not the owner'));
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET, tokenId: VALID_TOKEN_ID },
      });
      expect(response.statusCode).toBe(500);
    });

    it('returns 500 when unstakeNft throws a generic RPC error', async () => {
      mockUnstakeNft.mockRejectedValueOnce(new Error('execution reverted'));
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET, tokenId: VALID_TOKEN_ID },
      });
      expect(response.statusCode).toBe(500);
    });

    // --- Edge Cases ---
    it('handles very small fractional reward amount correctly', async () => {
      mockUnstakeNft.mockResolvedValueOnce({ ...defaultUnstakeResult, rewardAmount: 0.000000001 });
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET, tokenId: VALID_TOKEN_ID },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().rewardAmount).toBeCloseTo(0.000000001, 10);
    });

    it('handles very large reward amount (whale position)', async () => {
      mockUnstakeNft.mockResolvedValueOnce({ ...defaultUnstakeResult, rewardAmount: 999999.999 });
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET, tokenId: VALID_TOKEN_ID },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().rewardAmount).toBeCloseTo(999999.999, 3);
    });
  });

  // =========================================================================
  // masterchef-unstake-and-close
  // =========================================================================
  describe('POST /masterchef-unstake-and-close', () => {
    const url = `${BASE_URL}/masterchef-unstake-and-close`;

    // --- Happy Path ---
    it('returns 200 with both transaction hashes and closed position data', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET, tokenId: 6450873 },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.unstakeTransaction).toBe(TX_HASH_UNSTAKE);
      expect(body.closeTransaction).toBe(defaultCloseResult.signature);
      expect(body.cakeRewardAmount).toBe(12.345678);
      expect(body.rewardToken).toBe('CAKE');
      expect(body.rewardTokenAddress).toBe(CAKE_ADDRESS);
      expect(body.positionClosed).toBeDefined();
      expect(body.positionClosed.baseTokenAmountRemoved).toBe(100.0);
      expect(body.positionClosed.quoteTokenAmountRemoved).toBe(245.0);
      expect(body.positionClosed.baseFeeAmountCollected).toBe(1.23);
      expect(body.positionClosed.quoteFeeAmountCollected).toBe(3.01);
      expect(body.message).toContain('6450873');
    });

    it('calls unstakeNft before closePosition', async () => {
      const callOrder: string[] = [];
      mockUnstakeNft.mockImplementationOnce(async () => {
        callOrder.push('unstake');
        return defaultUnstakeResult;
      });
      mockClosePosition.mockImplementationOnce(async () => {
        callOrder.push('close');
        return defaultCloseResult;
      });

      await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET, tokenId: 6450873 },
      });

      expect(callOrder).toEqual(['unstake', 'close']);
    });

    it('passes correct arguments to closePosition', async () => {
      await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET, tokenId: 6450873 },
      });
      expect(mockClosePosition).toHaveBeenCalledWith(VALID_NETWORK, VALID_WALLET, '6450873');
    });

    // --- Schema Validation ---
    it('returns 400 when body is empty', async () => {
      const response = await fastify.inject({ method: 'POST', url, payload: {} });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when tokenId is missing', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET },
      });
      expect(response.statusCode).toBe(400);
    });

    // --- Error Propagation ---
    it('returns 500 and reports failure when unstakeNft fails (close is NOT called)', async () => {
      mockUnstakeNft.mockRejectedValueOnce(new Error('execution reverted: not staked'));
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET, tokenId: 6450873 },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json().error).toContain('unstake');
      // closePosition must NOT be called if unstake fails
      expect(mockClosePosition).not.toHaveBeenCalled();
    });

    it('returns 500 and reports failure when closePosition fails after successful unstake', async () => {
      mockClosePosition.mockRejectedValueOnce(new Error('cannot collect: already closed'));
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET, tokenId: 6450873 },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json().error).toContain('close');
      // unstake was called successfully
      expect(mockUnstakeNft).toHaveBeenCalled();
    });

    // --- Edge Cases ---
    it('handles positionClosed.data with optional token fields missing', async () => {
      mockClosePosition.mockResolvedValueOnce({
        ...defaultCloseResult,
        data: {
          ...defaultCloseResult.data,
          baseTokenSymbol: undefined,
          baseTokenAddress: undefined,
          quoteTokenSymbol: undefined,
          quoteTokenAddress: undefined,
        },
      });
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET, tokenId: 6450873 },
      });
      // Should still return 200 — optional fields are allowed
      expect(response.statusCode).toBe(200);
    });

    it('handles zero CAKE reward (position never accrued)', async () => {
      mockUnstakeNft.mockResolvedValueOnce({ ...defaultUnstakeResult, rewardAmount: 0 });
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, walletAddress: VALID_WALLET, tokenId: 6450873 },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().cakeRewardAmount).toBe(0);
    });
  });

  // =========================================================================
  // masterchef-knows-pool
  // =========================================================================
  describe('POST /masterchef-knows-pool', () => {
    const url = `${BASE_URL}/masterchef-knows-pool`;

    // --- Happy Path (registered pool) ---
    it('returns 200 with poolId and known=true for a registered pool', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, poolAddress: VALID_POOL_ADDRESS },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.poolId).toBe('3');
      expect(body.known).toBe(true);
    });

    // --- Unregistered pool (poolId === 0) ---
    it('returns 200 with poolId="0" and known=false for an unregistered pool', async () => {
      mockGetV3PoolIdFromMasterChef.mockResolvedValueOnce(0);
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, poolAddress: VALID_POOL_ADDRESS },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.poolId).toBe('0');
      expect(body.known).toBe(false);
    });

    it('calls getV3PoolIdFromMasterChef with the correct pool address', async () => {
      await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, poolAddress: VALID_POOL_ADDRESS },
      });
      expect(mockGetV3PoolIdFromMasterChef).toHaveBeenCalledWith(VALID_POOL_ADDRESS);
    });

    // --- Schema Validation ---
    it('returns 400 when body is empty', async () => {
      const response = await fastify.inject({ method: 'POST', url, payload: {} });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when poolAddress is missing', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK },
      });
      expect(response.statusCode).toBe(400);
    });

    it('falls back to default network when network is omitted (schema has default: bsc)', async () => {
      // MasterChefKnowsPoolSchema declares default:'bsc' — missing network is
      // coerced to 'bsc', the route proceeds normally.
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { poolAddress: VALID_POOL_ADDRESS },
      });
      expect(response.statusCode).not.toBe(400);
    });

    // --- Error Propagation ---
    it('returns 500 when getV3PoolIdFromMasterChef throws (RPC error)', async () => {
      mockGetV3PoolIdFromMasterChef.mockRejectedValueOnce(new Error('could not detect network'));
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, poolAddress: VALID_POOL_ADDRESS },
      });
      expect(response.statusCode).toBe(500);
    });

    it('returns 500 when getInstance throws (unsupported network)', async () => {
      mockGetInstance.mockRejectedValueOnce(new Error('Unsupported network: avax'));
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: 'avax', poolAddress: VALID_POOL_ADDRESS },
      });
      expect(response.statusCode).toBe(500);
    });

    // --- Edge Cases ---
    it('poolId is returned as a string (not a number) per schema', async () => {
      mockGetV3PoolIdFromMasterChef.mockResolvedValueOnce(99);
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: VALID_NETWORK, poolAddress: VALID_POOL_ADDRESS },
      });
      expect(response.statusCode).toBe(200);
      // TypeBox schema defines poolId as Type.String
      expect(typeof response.json().poolId).toBe('string');
      expect(response.json().poolId).toBe('99');
    });

    it('handles all supported networks (mainnet)', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: 'mainnet', poolAddress: VALID_POOL_ADDRESS },
      });
      expect(response.statusCode).not.toBe(404);
    });

    it('handles all supported networks (arbitrum)', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: 'arbitrum', poolAddress: VALID_POOL_ADDRESS },
      });
      expect(response.statusCode).not.toBe(404);
    });

    it('handles all supported networks (base)', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url,
        payload: { network: 'base', poolAddress: VALID_POOL_ADDRESS },
      });
      expect(response.statusCode).not.toBe(404);
    });
  });

  // =========================================================================
  // Cross-cutting: HTTP method guard
  // =========================================================================
  describe('HTTP method guard', () => {
    it.each([
      `${BASE_URL}/masterchef-stake`,
      `${BASE_URL}/masterchef-unstake`,
      `${BASE_URL}/masterchef-unstake-and-close`,
      `${BASE_URL}/masterchef-knows-pool`,
    ])('GET %s returns 404 (routes are POST only)', async (url) => {
      const response = await fastify.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(404);
    });
  });
});
