import fs from 'fs';
import path from 'path';

describe('ETCswap Routes Structure', () => {
  describe('Folder Structure', () => {
    it('should have router-routes, amm-routes, and clmm-routes folders', () => {
      const etcswapPath = path.join(__dirname, '../../../src/connectors/etcswap');
      const routerRoutesPath = path.join(etcswapPath, 'router-routes');
      const ammRoutesPath = path.join(etcswapPath, 'amm-routes');
      const clmmRoutesPath = path.join(etcswapPath, 'clmm-routes');

      expect(fs.existsSync(routerRoutesPath)).toBe(true);
      expect(fs.existsSync(ammRoutesPath)).toBe(true);
      expect(fs.existsSync(clmmRoutesPath)).toBe(true);
    });

    it('should have correct files in router-routes folder', () => {
      const routerRoutesPath = path.join(__dirname, '../../../src/connectors/etcswap/router-routes');
      const files = fs.readdirSync(routerRoutesPath);

      expect(files).toContain('executeSwap.ts');
      expect(files).toContain('quoteSwap.ts');
      expect(files).toContain('executeQuote.ts');
      expect(files).toContain('index.ts');
    });

    it('should have correct files in amm-routes folder', () => {
      const ammRoutesPath = path.join(__dirname, '../../../src/connectors/etcswap/amm-routes');
      const files = fs.readdirSync(ammRoutesPath);

      expect(files).toContain('executeSwap.ts');
      expect(files).toContain('quoteSwap.ts');
      expect(files).toContain('addLiquidity.ts');
      expect(files).toContain('removeLiquidity.ts');
      expect(files).toContain('poolInfo.ts');
      expect(files).toContain('index.ts');
    });

    it('should have correct files in clmm-routes folder', () => {
      const clmmRoutesPath = path.join(__dirname, '../../../src/connectors/etcswap/clmm-routes');
      const files = fs.readdirSync(clmmRoutesPath);

      expect(files).toContain('executeSwap.ts');
      expect(files).toContain('quoteSwap.ts');
      expect(files).toContain('openPosition.ts');
      expect(files).toContain('closePosition.ts');
      expect(files).toContain('addLiquidity.ts');
      expect(files).toContain('removeLiquidity.ts');
      expect(files).toContain('collectFees.ts');
      expect(files).toContain('positionInfo.ts');
      expect(files).toContain('positionsOwned.ts');
      expect(files).toContain('poolInfo.ts');
      expect(files).toContain('index.ts');
    });
  });

  describe('Core Files', () => {
    it('should have all required connector files', () => {
      const etcswapPath = path.join(__dirname, '../../../src/connectors/etcswap');

      expect(fs.existsSync(path.join(etcswapPath, 'etcswap.ts'))).toBe(true);
      expect(fs.existsSync(path.join(etcswapPath, 'etcswap.config.ts'))).toBe(true);
      expect(fs.existsSync(path.join(etcswapPath, 'etcswap.contracts.ts'))).toBe(true);
      expect(fs.existsSync(path.join(etcswapPath, 'etcswap.routes.ts'))).toBe(true);
      expect(fs.existsSync(path.join(etcswapPath, 'etcswap.utils.ts'))).toBe(true);
      expect(fs.existsSync(path.join(etcswapPath, 'schemas.ts'))).toBe(true);
      expect(fs.existsSync(path.join(etcswapPath, 'universal-router.ts'))).toBe(true);
    });
  });

  describe('Configuration Files', () => {
    it('should have classic.yml network config', () => {
      const configPath = path.join(__dirname, '../../../src/templates/chains/ethereum/classic.yml');
      expect(fs.existsSync(configPath)).toBe(true);
    });

    it('should have mordor.yml network config', () => {
      const configPath = path.join(__dirname, '../../../src/templates/chains/ethereum/mordor.yml');
      expect(fs.existsSync(configPath)).toBe(true);
    });

    it('should have classic.json token list', () => {
      const tokenPath = path.join(__dirname, '../../../src/templates/tokens/ethereum/classic.json');
      expect(fs.existsSync(tokenPath)).toBe(true);
    });

    it('should have mordor.json token list', () => {
      const tokenPath = path.join(__dirname, '../../../src/templates/tokens/ethereum/mordor.json');
      expect(fs.existsSync(tokenPath)).toBe(true);
    });

    it('should have etcswap.yml connector config', () => {
      const configPath = path.join(__dirname, '../../../src/templates/connectors/etcswap.yml');
      expect(fs.existsSync(configPath)).toBe(true);
    });
  });
});
