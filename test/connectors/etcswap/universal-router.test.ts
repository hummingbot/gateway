import { Token } from '@uniswap/sdk-core';

import {
  getUniversalRouterAddress,
  getETCswapV2FactoryAddress,
  getETCswapV3FactoryAddress,
  getETCswapV2InitCodeHash,
  ETCSWAP_V3_INIT_CODE_HASH,
} from '../../../src/connectors/etcswap/etcswap.contracts';

describe('ETCswapUniversalRouterService', () => {
  // ETCswap uses Ethereum Classic (Chain ID 61) tokens
  const WETC = new Token(61, '0x1953cab0E5bFa6D4a9BaD6E05fD46C1CC6527a5a', 18, 'WETC', 'Wrapped ETC');

  const USC = new Token(61, '0xDE093684c796204224BC081f937aa059D903c52a', 6, 'USC', 'Classic USD');

  describe('Token Configuration', () => {
    it('should have correct WETC token for chain ID 61', () => {
      expect(WETC.chainId).toBe(61);
      expect(WETC.address).toBe('0x1953cab0E5bFa6D4a9BaD6E05fD46C1CC6527a5a');
      expect(WETC.decimals).toBe(18);
      expect(WETC.symbol).toBe('WETC');
    });

    it('should have correct USC token for chain ID 61', () => {
      expect(USC.chainId).toBe(61);
      expect(USC.address).toBe('0xDE093684c796204224BC081f937aa059D903c52a');
      expect(USC.decimals).toBe(6);
      expect(USC.symbol).toBe('USC');
    });
  });

  describe('Universal Router Configuration', () => {
    it('should return correct Universal Router address for classic', () => {
      const address = getUniversalRouterAddress('classic');
      expect(address).toBe('0x9b676E761040D60C6939dcf5f582c2A4B51025F1');
    });

    it('should return correct Universal Router address for mordor', () => {
      const address = getUniversalRouterAddress('mordor');
      expect(address).toBe('0x9b676E761040D60C6939dcf5f582c2A4B51025F1');
    });

    it('should have same Universal Router address on both networks', () => {
      expect(getUniversalRouterAddress('classic')).toBe(getUniversalRouterAddress('mordor'));
    });
  });

  describe('V2 Factory Configuration', () => {
    it('should return different V2 factory addresses for classic and mordor', () => {
      const classicFactory = getETCswapV2FactoryAddress('classic');
      const mordorFactory = getETCswapV2FactoryAddress('mordor');

      expect(classicFactory).toBe('0x0307cd3D7DA98A29e6Ed0D2137be386Ec1e4Bc9C');
      expect(mordorFactory).toBe('0x212eE1B5c8C26ff5B2c4c14CD1C54486Fe23ce70');
      expect(classicFactory).not.toBe(mordorFactory);
    });
  });

  describe('V3 Factory Configuration', () => {
    it('should return same V3 factory address for both networks', () => {
      const classicFactory = getETCswapV3FactoryAddress('classic');
      const mordorFactory = getETCswapV3FactoryAddress('mordor');

      expect(classicFactory).toBe('0x2624E907BcC04f93C8f29d7C7149a8700Ceb8cDC');
      expect(classicFactory).toBe(mordorFactory);
    });
  });

  describe('INIT_CODE_HASH Configuration', () => {
    it('should have different V2 INIT_CODE_HASH for classic and mordor', () => {
      const classicHash = getETCswapV2InitCodeHash('classic');
      const mordorHash = getETCswapV2InitCodeHash('mordor');

      expect(classicHash).not.toBe(mordorHash);
      expect(classicHash).toBe('0xb5e58237f3a44220ffc3dfb989e53735df8fcd9df82c94b13105be8380344e52');
      expect(mordorHash).toBe('0x4d8a51f257ed377a6ac3f829cd4226c892edbbbcb87622bcc232807b885b1303');
    });

    it('should have correct V3 INIT_CODE_HASH', () => {
      expect(ETCSWAP_V3_INIT_CODE_HASH).toBe('0x7ea2da342810af3c5a9b47258f990aaac829fe1385a1398feb77d0126a85dbef');
    });
  });

  describe('Token Sorting', () => {
    it('should correctly sort WETC and USC tokens', () => {
      // Lower address comes first in V2/V3 pools
      const wetcLower = WETC.address.toLowerCase();
      const uscLower = USC.address.toLowerCase();

      // Determine which should be token0
      const isWetcToken0 = wetcLower < uscLower;

      // WETC: 0x1953cab0E5bFa6D4a9BaD6E05fD46C1CC6527a5a
      // USC:  0xDE093684c796204224BC081f937aa059D903c52a
      // 0x19... < 0xDE... so WETC should be token0
      expect(isWetcToken0).toBe(true);
    });
  });
});
