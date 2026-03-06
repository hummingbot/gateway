import {
  getETCswapV2RouterAddress,
  getETCswapV2FactoryAddress,
  getETCswapV3FactoryAddress,
  getETCswapV3NftManagerAddress,
  getETCswapV3SwapRouter02Address,
  getETCswapV3QuoterV2ContractAddress,
  getUniversalRouterAddress,
  getETCswapV2InitCodeHash,
  isV3Available,
  isUniversalRouterAvailable,
  IEtcswapV2Router02ABI,
  ETCSWAP_V3_INIT_CODE_HASH,
  ETCSWAP_V2_INIT_CODE_HASH_MAP,
} from '../../../src/connectors/etcswap/etcswap.contracts';

describe('ETCswap Contracts Configuration', () => {
  describe('V2 Contract Addresses', () => {
    describe('Classic (mainnet)', () => {
      it('should return correct V2 router address for classic', () => {
        const address = getETCswapV2RouterAddress('classic');
        expect(address).toBe('0x79Bf07555C34e68C4Ae93642d1007D7f908d60F5');
      });

      it('should return correct V2 factory address for classic', () => {
        const address = getETCswapV2FactoryAddress('classic');
        expect(address).toBe('0x0307cd3D7DA98A29e6Ed0D2137be386Ec1e4Bc9C');
      });
    });

    describe('Mordor (testnet)', () => {
      it('should return correct V2 router address for mordor', () => {
        const address = getETCswapV2RouterAddress('mordor');
        expect(address).toBe('0x6d194227a9A1C11f144B35F96E6289c5602Da493');
      });

      it('should return correct V2 factory address for mordor', () => {
        const address = getETCswapV2FactoryAddress('mordor');
        expect(address).toBe('0x212eE1B5c8C26ff5B2c4c14CD1C54486Fe23ce70');
      });
    });

    it('should throw error for unknown network', () => {
      expect(() => getETCswapV2RouterAddress('unknown')).toThrow();
      expect(() => getETCswapV2FactoryAddress('unknown')).toThrow();
    });
  });

  describe('V3 Contract Addresses', () => {
    it('should return same V3 factory address for both networks', () => {
      const classicFactory = getETCswapV3FactoryAddress('classic');
      const mordorFactory = getETCswapV3FactoryAddress('mordor');

      expect(classicFactory).toBe('0x2624E907BcC04f93C8f29d7C7149a8700Ceb8cDC');
      expect(mordorFactory).toBe(classicFactory);
    });

    it('should return same V3 NFT manager address for both networks', () => {
      const classicNft = getETCswapV3NftManagerAddress('classic');
      const mordorNft = getETCswapV3NftManagerAddress('mordor');

      expect(classicNft).toBe('0x3CEDe6562D6626A04d7502CC35720901999AB699');
      expect(mordorNft).toBe(classicNft);
    });

    it('should return same V3 SwapRouter02 address for both networks', () => {
      const classicRouter = getETCswapV3SwapRouter02Address('classic');
      const mordorRouter = getETCswapV3SwapRouter02Address('mordor');

      expect(classicRouter).toBe('0xEd88EDD995b00956097bF90d39C9341BBde324d1');
      expect(mordorRouter).toBe(classicRouter);
    });

    it('should return same V3 QuoterV2 address for both networks', () => {
      const classicQuoter = getETCswapV3QuoterV2ContractAddress('classic');
      const mordorQuoter = getETCswapV3QuoterV2ContractAddress('mordor');

      expect(classicQuoter).toBe('0x4d8c163400CB87Cbe1bae76dBf36A09FED85d39B');
      expect(mordorQuoter).toBe(classicQuoter);
    });
  });

  describe('Universal Router', () => {
    it('should return same Universal Router address for both networks', () => {
      const classicRouter = getUniversalRouterAddress('classic');
      const mordorRouter = getUniversalRouterAddress('mordor');

      expect(classicRouter).toBe('0x9b676E761040D60C6939dcf5f582c2A4B51025F1');
      expect(mordorRouter).toBe(classicRouter);
    });
  });

  describe('V2 INIT_CODE_HASH', () => {
    it('should have different INIT_CODE_HASH for classic and mordor', () => {
      const classicHash = getETCswapV2InitCodeHash('classic');
      const mordorHash = getETCswapV2InitCodeHash('mordor');

      expect(classicHash).toBe('0xb5e58237f3a44220ffc3dfb989e53735df8fcd9df82c94b13105be8380344e52');
      expect(mordorHash).toBe('0x4d8a51f257ed377a6ac3f829cd4226c892edbbbcb87622bcc232807b885b1303');
      expect(classicHash).not.toBe(mordorHash);
    });

    it('should throw error for unknown network', () => {
      expect(() => getETCswapV2InitCodeHash('unknown')).toThrow(
        'ETCswap V2 INIT_CODE_HASH not configured for network: unknown',
      );
    });

    it('should have INIT_CODE_HASH map with correct values', () => {
      expect(ETCSWAP_V2_INIT_CODE_HASH_MAP['classic']).toBeDefined();
      expect(ETCSWAP_V2_INIT_CODE_HASH_MAP['mordor']).toBeDefined();
    });
  });

  describe('V3 INIT_CODE_HASH', () => {
    it('should have correct V3 INIT_CODE_HASH', () => {
      expect(ETCSWAP_V3_INIT_CODE_HASH).toBe('0x7ea2da342810af3c5a9b47258f990aaac829fe1385a1398feb77d0126a85dbef');
    });
  });

  describe('Availability Checks', () => {
    it('should indicate V3 is available on both networks', () => {
      expect(isV3Available('classic')).toBe(true);
      expect(isV3Available('mordor')).toBe(true);
    });

    it('should indicate Universal Router is available on both networks', () => {
      expect(isUniversalRouterAvailable('classic')).toBe(true);
      expect(isUniversalRouterAvailable('mordor')).toBe(true);
    });

    it('should indicate V3 is not available on unknown network', () => {
      expect(isV3Available('unknown')).toBe(false);
    });

    it('should indicate Universal Router is not available on unknown network', () => {
      expect(isUniversalRouterAvailable('unknown')).toBe(false);
    });
  });

  describe('V2 Router ABI', () => {
    it('should have IEtcswapV2Router02ABI with ETC function names', () => {
      expect(IEtcswapV2Router02ABI).toBeDefined();
      expect(IEtcswapV2Router02ABI.abi).toBeDefined();
      expect(Array.isArray(IEtcswapV2Router02ABI.abi)).toBe(true);
    });

    it('should include addLiquidityETC function (not addLiquidityETH)', () => {
      const functionNames = IEtcswapV2Router02ABI.abi.map((f: any) => f.name);

      expect(functionNames).toContain('addLiquidityETC');
      expect(functionNames).not.toContain('addLiquidityETH');
    });

    it('should include removeLiquidityETC function (not removeLiquidityETH)', () => {
      const functionNames = IEtcswapV2Router02ABI.abi.map((f: any) => f.name);

      expect(functionNames).toContain('removeLiquidityETC');
      expect(functionNames).not.toContain('removeLiquidityETH');
    });

    it('should include swapExactETCForTokens function (not swapExactETHForTokens)', () => {
      const functionNames = IEtcswapV2Router02ABI.abi.map((f: any) => f.name);

      expect(functionNames).toContain('swapExactETCForTokens');
      expect(functionNames).not.toContain('swapExactETHForTokens');
    });

    it('should include swapExactTokensForETC function (not swapExactTokensForETH)', () => {
      const functionNames = IEtcswapV2Router02ABI.abi.map((f: any) => f.name);

      expect(functionNames).toContain('swapExactTokensForETC');
      expect(functionNames).not.toContain('swapExactTokensForETH');
    });

    it('should include token-to-token functions (same as Uniswap)', () => {
      const functionNames = IEtcswapV2Router02ABI.abi.map((f: any) => f.name);

      expect(functionNames).toContain('swapExactTokensForTokens');
      expect(functionNames).toContain('swapTokensForExactTokens');
      expect(functionNames).toContain('addLiquidity');
      expect(functionNames).toContain('removeLiquidity');
    });
  });
});
