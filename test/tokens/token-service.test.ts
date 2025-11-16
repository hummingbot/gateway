import fs from 'fs';
import path from 'path';

import { TokenService } from '../../src/services/token-service';
import { Token } from '../../src/tokens/types';

jest.mock('fs');
jest.mock('../../src/services/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('TokenService', () => {
  let tokenService: TokenService;

  beforeEach(() => {
    tokenService = TokenService.getInstance();
    jest.clearAllMocks();
  });

  describe('validateToken', () => {
    it('should validate Ethereum token with correct address checksum', async () => {
      const token: Token = {
        chainId: 1,
        name: 'USD Coin',
        symbol: 'USDC',
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        decimals: 6,
      };

      await expect(tokenService.validateToken('ethereum', token)).resolves.not.toThrow();
    });

    it('should reject Ethereum token with invalid address', async () => {
      const token: Token = {
        chainId: 1,
        name: 'Test Token',
        symbol: 'TEST',
        address: 'invalid-address',
        decimals: 18,
      };

      await expect(tokenService.validateToken('ethereum', token)).rejects.toThrow('Invalid Ethereum address');
    });

    it('should validate Solana token with valid base58 address', async () => {
      const token: Token = {
        chainId: 101,
        name: 'Test Token',
        symbol: 'TEST',
        address: 'So11111111111111111111111111111111111111112',
        decimals: 9,
      };

      await expect(tokenService.validateToken('solana', token)).resolves.not.toThrow();
    });

    it('should reject token with invalid decimals', async () => {
      const token: Token = {
        chainId: 1,
        name: 'Test Token',
        symbol: 'TEST',
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        decimals: 256,
      };

      await expect(tokenService.validateToken('ethereum', token)).rejects.toThrow(
        'Token decimals must be a number between 0 and 255',
      );
    });

    it('should reject unsupported chain', async () => {
      const token: Token = {
        chainId: 1,
        name: 'Test Token',
        symbol: 'TEST',
        address: 'some-address',
        decimals: 18,
      };

      await expect(tokenService.validateToken('unsupported', token)).rejects.toThrow('Unsupported chain');
    });
  });
});
