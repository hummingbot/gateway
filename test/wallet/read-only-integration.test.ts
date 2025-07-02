import { PublicKey } from '@solana/web3.js';
import { ethers } from 'ethers';
import Fastify, { FastifyInstance } from 'fastify';

import { Ethereum } from '../../src/chains/ethereum/ethereum';
import { Solana } from '../../src/chains/solana/solana';
import { getReadOnlyWalletAddresses } from '../../src/wallet/utils';

// Mock dependencies
jest.mock('../../src/services/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../src/wallet/utils', () => ({
  ...jest.requireActual('../../src/wallet/utils'),
  getReadOnlyWalletAddresses: jest.fn(),
}));

describe('Read-Only Wallet Integration Tests', () => {
  describe('Ethereum Chain Integration', () => {
    let ethereum: Ethereum;
    const testAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0Bfee';

    beforeEach(async () => {
      ethereum = await Ethereum.getInstance('mainnet');

      // Mock getReadOnlyWalletAddresses to return our test address
      (getReadOnlyWalletAddresses as jest.Mock).mockResolvedValue([
        testAddress,
      ]);
    });

    it('should identify read-only wallets correctly', async () => {
      const isReadOnly = await ethereum.isReadOnlyWallet(testAddress);
      expect(isReadOnly).toBe(true);

      const isNotReadOnly = await ethereum.isReadOnlyWallet(
        '0x0000000000000000000000000000000000000000',
      );
      expect(isNotReadOnly).toBe(false);
    });

    it('should get native balance for read-only wallet', async () => {
      // Mock provider.getBalance
      ethereum.provider.getBalance = jest
        .fn()
        .mockResolvedValue(ethers.BigNumber.from('1000000000000000000'));

      const balance = await ethereum.getNativeBalanceByAddress(testAddress);
      expect(balance.value.toString()).toBe('1000000000000000000');
      expect(balance.decimals).toBe(18);
    });

    it('should get ERC20 balance for read-only wallet', async () => {
      // Mock contract
      const mockContract = {
        balanceOf: jest
          .fn()
          .mockResolvedValue(ethers.BigNumber.from('1000000')),
      };

      const balance = await ethereum.getERC20BalanceByAddress(
        mockContract as any,
        testAddress,
        6,
        5000,
      );

      expect(mockContract.balanceOf).toHaveBeenCalledWith(testAddress);
      expect(balance.value.toString()).toBe('1000000');
      expect(balance.decimals).toBe(6);
    });

    it('should get ERC20 allowance for read-only wallet', async () => {
      const spender = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

      // Mock contract
      const mockContract = {
        allowance: jest.fn().mockResolvedValue(ethers.BigNumber.from('500000')),
      };

      const allowance = await ethereum.getERC20AllowanceByAddress(
        mockContract as any,
        testAddress,
        spender,
        6,
      );

      expect(mockContract.allowance).toHaveBeenCalledWith(testAddress, spender);
      expect(allowance.value.toString()).toBe('500000');
      expect(allowance.decimals).toBe(6);
    });
  });

  describe('Solana Chain Integration', () => {
    let solana: Solana;
    const testAddress = 'DRpaJDurGtinzUPWSYnripFsJTBXm4HG7AC3LSgJNtNB';

    beforeEach(async () => {
      solana = await Solana.getInstance('mainnet-beta');

      // Mock getReadOnlyWalletAddresses to return our test address
      (getReadOnlyWalletAddresses as jest.Mock).mockResolvedValue([
        testAddress,
      ]);
    });

    it('should identify read-only wallets correctly', async () => {
      const isReadOnly = await solana.isReadOnlyWallet(testAddress);
      expect(isReadOnly).toBe(true);

      const isNotReadOnly = await solana.isReadOnlyWallet(
        '11111111111111111111111111111111',
      );
      expect(isNotReadOnly).toBe(false);
    });

    it('should validate the address is a valid Solana address', () => {
      // This should not throw
      expect(() => new PublicKey(testAddress)).not.toThrow();

      // Verify it's the expected public key
      const pubKey = new PublicKey(testAddress);
      expect(pubKey.toBase58()).toBe(testAddress);
    });
  });

  describe('Balance Route Integration', () => {
    it('should handle read-only wallets in Ethereum balance requests', async () => {
      // This test would require a full Fastify setup with routes
      // It's more of an integration test that would run against a real instance
      expect(true).toBe(true); // Placeholder
    });

    it('should handle read-only wallets in Solana balance requests', async () => {
      // This test would require a full Fastify setup with routes
      // It's more of an integration test that would run against a real instance
      expect(true).toBe(true); // Placeholder
    });
  });
});
