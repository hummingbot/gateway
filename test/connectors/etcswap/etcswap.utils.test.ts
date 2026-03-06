/**
 * ETCswap Utils Tests
 *
 * Note: These tests verify the utility functions and contract constants
 * from etcswap.contracts.ts without triggering ConfigManagerV2.
 */

import {
  getETCswapV2FactoryAddress,
  getETCswapV2RouterAddress,
  getETCswapV2InitCodeHash,
  getETCswapV3FactoryAddress,
  getETCswapV3NftManagerAddress,
  getETCswapV3SwapRouter02Address,
  getETCswapV3QuoterV2ContractAddress,
  getUniversalRouterAddress,
  ETCSWAP_V3_INIT_CODE_HASH,
  ETCSWAP_V2_INIT_CODE_HASH_MAP,
  isV3Available,
  isUniversalRouterAvailable,
} from '../../../src/connectors/etcswap/etcswap.contracts';

describe('ETCswap Utils', () => {
  describe('V2 Contract Addresses', () => {
    it('should have different V2 factory addresses for classic and mordor', () => {
      const classicFactory = getETCswapV2FactoryAddress('classic');
      const mordorFactory = getETCswapV2FactoryAddress('mordor');

      expect(classicFactory).toBe('0x0307cd3D7DA98A29e6Ed0D2137be386Ec1e4Bc9C');
      expect(mordorFactory).toBe('0x212eE1B5c8C26ff5B2c4c14CD1C54486Fe23ce70');
      expect(classicFactory).not.toBe(mordorFactory);
    });

    it('should have different V2 router addresses for classic and mordor', () => {
      const classicRouter = getETCswapV2RouterAddress('classic');
      const mordorRouter = getETCswapV2RouterAddress('mordor');

      expect(classicRouter).toBe('0x79Bf07555C34e68C4Ae93642d1007D7f908d60F5');
      expect(mordorRouter).toBe('0x6d194227a9A1C11f144B35F96E6289c5602Da493');
      expect(classicRouter).not.toBe(mordorRouter);
    });

    it('should have different V2 INIT_CODE_HASH for classic and mordor', () => {
      const classicHash = getETCswapV2InitCodeHash('classic');
      const mordorHash = getETCswapV2InitCodeHash('mordor');

      expect(classicHash).toBe('0xb5e58237f3a44220ffc3dfb989e53735df8fcd9df82c94b13105be8380344e52');
      expect(mordorHash).toBe('0x4d8a51f257ed377a6ac3f829cd4226c892edbbbcb87622bcc232807b885b1303');
      expect(classicHash).not.toBe(mordorHash);
    });

    it('should have INIT_CODE_HASH map with both networks', () => {
      expect(ETCSWAP_V2_INIT_CODE_HASH_MAP['classic']).toBeDefined();
      expect(ETCSWAP_V2_INIT_CODE_HASH_MAP['mordor']).toBeDefined();
    });
  });

  describe('V3 Contract Addresses', () => {
    it('should have same V3 factory address for both networks', () => {
      const classicFactory = getETCswapV3FactoryAddress('classic');
      const mordorFactory = getETCswapV3FactoryAddress('mordor');

      expect(classicFactory).toBe('0x2624E907BcC04f93C8f29d7C7149a8700Ceb8cDC');
      expect(classicFactory).toBe(mordorFactory);
    });

    it('should have same V3 NFT manager address for both networks', () => {
      const classicNft = getETCswapV3NftManagerAddress('classic');
      const mordorNft = getETCswapV3NftManagerAddress('mordor');

      expect(classicNft).toBe('0x3CEDe6562D6626A04d7502CC35720901999AB699');
      expect(classicNft).toBe(mordorNft);
    });

    it('should have same V3 SwapRouter02 address for both networks', () => {
      const classicRouter = getETCswapV3SwapRouter02Address('classic');
      const mordorRouter = getETCswapV3SwapRouter02Address('mordor');

      expect(classicRouter).toBe('0xEd88EDD995b00956097bF90d39C9341BBde324d1');
      expect(classicRouter).toBe(mordorRouter);
    });

    it('should have same V3 QuoterV2 address for both networks', () => {
      const classicQuoter = getETCswapV3QuoterV2ContractAddress('classic');
      const mordorQuoter = getETCswapV3QuoterV2ContractAddress('mordor');

      expect(classicQuoter).toBe('0x4d8c163400CB87Cbe1bae76dBf36A09FED85d39B');
      expect(classicQuoter).toBe(mordorQuoter);
    });

    it('should have correct V3 INIT_CODE_HASH', () => {
      expect(ETCSWAP_V3_INIT_CODE_HASH).toBe('0x7ea2da342810af3c5a9b47258f990aaac829fe1385a1398feb77d0126a85dbef');
    });
  });

  describe('Universal Router', () => {
    it('should have same Universal Router address for both networks', () => {
      const classicRouter = getUniversalRouterAddress('classic');
      const mordorRouter = getUniversalRouterAddress('mordor');

      expect(classicRouter).toBe('0x9b676E761040D60C6939dcf5f582c2A4B51025F1');
      expect(classicRouter).toBe(mordorRouter);
    });
  });

  describe('Availability Checks', () => {
    it('should indicate V3 is available on classic', () => {
      expect(isV3Available('classic')).toBe(true);
    });

    it('should indicate V3 is available on mordor', () => {
      expect(isV3Available('mordor')).toBe(true);
    });

    it('should indicate Universal Router is available on classic', () => {
      expect(isUniversalRouterAvailable('classic')).toBe(true);
    });

    it('should indicate Universal Router is available on mordor', () => {
      expect(isUniversalRouterAvailable('mordor')).toBe(true);
    });

    it('should indicate V3 is not available on unknown network', () => {
      expect(isV3Available('unknown')).toBe(false);
    });

    it('should indicate Universal Router is not available on unknown network', () => {
      expect(isUniversalRouterAvailable('unknown')).toBe(false);
    });
  });

  describe('Address Validation', () => {
    it('all V2 addresses should be valid Ethereum addresses', () => {
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;

      expect(getETCswapV2FactoryAddress('classic')).toMatch(addressRegex);
      expect(getETCswapV2RouterAddress('classic')).toMatch(addressRegex);
      expect(getETCswapV2FactoryAddress('mordor')).toMatch(addressRegex);
      expect(getETCswapV2RouterAddress('mordor')).toMatch(addressRegex);
    });

    it('all V3 addresses should be valid Ethereum addresses', () => {
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;

      expect(getETCswapV3FactoryAddress('classic')).toMatch(addressRegex);
      expect(getETCswapV3NftManagerAddress('classic')).toMatch(addressRegex);
      expect(getETCswapV3SwapRouter02Address('classic')).toMatch(addressRegex);
      expect(getETCswapV3QuoterV2ContractAddress('classic')).toMatch(addressRegex);
      expect(getUniversalRouterAddress('classic')).toMatch(addressRegex);
    });

    it('all INIT_CODE_HASH values should be valid 32-byte hashes', () => {
      const hashRegex = /^0x[a-fA-F0-9]{64}$/;

      expect(getETCswapV2InitCodeHash('classic')).toMatch(hashRegex);
      expect(getETCswapV2InitCodeHash('mordor')).toMatch(hashRegex);
      expect(ETCSWAP_V3_INIT_CODE_HASH).toMatch(hashRegex);
    });
  });
});
