import fs from 'fs';
import path from 'path';

import { Token } from '@uniswap/sdk-core';
import { computePairAddress } from '@uniswap/v2-sdk';
import { computePoolAddress, FeeAmount } from '@uniswap/v3-sdk';

import { getUniswapV2FactoryAddress, getUniswapV3FactoryAddress } from '../../src/connectors/uniswap/uniswap.contracts';

interface PoolTemplate {
  connector: string;
  type: 'amm' | 'clmm';
  network: string;
  baseSymbol: string;
  quoteSymbol: string;
  address: string;
  baseTokenAddress: string;
  quoteTokenAddress: string;
  feePct: number;
}

const POOLS_DIR = path.join(__dirname, '../../src/templates/pools/ethereum');

const uniswapPools: PoolTemplate[] = fs
  .readdirSync(POOLS_DIR)
  .filter((file) => file.endsWith('.json'))
  .flatMap((file) => JSON.parse(fs.readFileSync(path.join(POOLS_DIR, file), 'utf8')) as PoolTemplate[])
  .filter((pool) => pool.connector === 'uniswap');

// Pool and pair addresses are CREATE2 addresses derived from the factory and the
// token pair (and fee tier for V3), so a template entry can be checked offline.
describe('Uniswap pool templates', () => {
  it('has Uniswap pool templates to check', () => {
    expect(uniswapPools.length).toBeGreaterThan(0);
  });

  it.each(uniswapPools.map((pool) => [`${pool.network} ${pool.type} ${pool.baseSymbol}-${pool.quoteSymbol}`, pool]))(
    '%s points to the Uniswap pool for its tokens',
    (_name, pool: PoolTemplate) => {
      const tokenA = new Token(1, pool.baseTokenAddress, 18);
      const tokenB = new Token(1, pool.quoteTokenAddress, 18);

      const expected =
        pool.type === 'amm'
          ? computePairAddress({
              factoryAddress: getUniswapV2FactoryAddress(pool.network),
              tokenA,
              tokenB,
            })
          : computePoolAddress({
              factoryAddress: getUniswapV3FactoryAddress(pool.network),
              tokenA,
              tokenB,
              fee: Math.round(pool.feePct * 10000) as FeeAmount,
            });

      expect(pool.address.toLowerCase()).toBe(expected.toLowerCase());
    },
  );
});
