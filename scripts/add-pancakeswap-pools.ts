import { Contract } from '@ethersproject/contracts';
import { logger } from '../src/services/logger';
import { getV2PoolInfo, getV3PoolInfo } from '../src/connectors/pancakeswap/pancakeswap.utils';
import { ConfigManagerV2 } from '../src/services/config-manager-v2';
import { Ethereum } from '../src/chains/ethereum/ethereum';
import * as fs from 'fs';
import * as path from 'path';

interface PoolConfig {
  address: string;
  baseSymbol: string;
  quoteSymbol: string;
  type?: 'amm' | 'clmm';
}

const POOLS_TO_ADD: PoolConfig[] = [
  {
    address: '0xaead6bd31dd66eb3a6216aaf271d0e661585b0b1',
    baseSymbol: 'ASTER',
    quoteSymbol: 'USDT',
  },
  {
    address: '0x172fcd41e0913e95784454622d1c3724f546f849',
    baseSymbol: 'USDT',
    quoteSymbol: 'WBNB',
  },
  {
    address: '0x7f51c8aaa6b0599abd16674e2b17fec7a9f674a1',
    baseSymbol: 'CAKE',
    quoteSymbol: 'USDT',
  },
  {
    address: '0x58f876857a02d6762e0101bb5c46a8c1ed44dc16',
    baseSymbol: 'WBNB',
    quoteSymbol: 'BUSD',
  },
];

const NETWORK = 'bsc';
const TEMPLATE_PATH = path.join(__dirname, '../src/templates/pools/pancakeswap.json');

async function fetchPancakeswapPoolInfo(
  poolAddress: string,
  type: 'amm' | 'clmm'
): Promise<{
  baseTokenAddress: string;
  quoteTokenAddress: string;
  feePct: number;
} | null> {
  try {
    if (type === 'amm') {
      const poolInfo = await getV2PoolInfo(poolAddress, NETWORK);
      if (!poolInfo) {
        return null;
      }
      return {
        baseTokenAddress: poolInfo.baseTokenAddress,
        quoteTokenAddress: poolInfo.quoteTokenAddress,
        feePct: 0.25, // Pancakeswap V2 default fee
      };
    } else {
      const poolInfo = await getV3PoolInfo(poolAddress, NETWORK);
      if (!poolInfo) {
        return null;
      }

      // Get fee from V3 pool contract
      const ethereum = await Ethereum.getInstance(NETWORK);
      const v3PoolABI = [
        {
          inputs: [],
          name: 'fee',
          outputs: [{ internalType: 'uint24', name: '', type: 'uint24' }],
          stateMutability: 'view',
          type: 'function',
        },
      ];
      const poolContract = new Contract(poolAddress, v3PoolABI, ethereum.provider);
      const feeRaw = await poolContract.fee();
      const feePct = feeRaw / 10000; // Convert from basis points to percentage

      return {
        baseTokenAddress: poolInfo.baseTokenAddress,
        quoteTokenAddress: poolInfo.quoteTokenAddress,
        feePct,
      };
    }
  } catch (error: any) {
    logger.error(`Error fetching Pancakeswap pool info for ${poolAddress}: ${error.message}`);
    return null;
  }
}

async function addPools() {
  logger.info('Starting Pancakeswap pool addition...\n');

  // Initialize config manager
  ConfigManagerV2.getInstance();

  const results: any[] = [];
  let successCount = 0;
  let failedCount = 0;

  for (let i = 0; i < POOLS_TO_ADD.length; i++) {
    const pool = POOLS_TO_ADD[i];
    logger.info(`[${i + 1}/${POOLS_TO_ADD.length}] Processing: ${pool.baseSymbol}-${pool.quoteSymbol}`);
    logger.info(`  Address: ${pool.address}`);
    logger.info(`  Network: ${NETWORK}`);

    // Try CLMM first, then AMM
    let poolInfo = null;
    let poolType: 'amm' | 'clmm' = 'clmm';

    logger.info('  Trying CLMM (V3)...');
    poolInfo = await fetchPancakeswapPoolInfo(pool.address, 'clmm');

    if (!poolInfo) {
      logger.info('  CLMM failed, trying AMM (V2)...');
      poolType = 'amm';
      poolInfo = await fetchPancakeswapPoolInfo(pool.address, 'amm');
    }

    if (poolInfo) {
      logger.info(`  ✓ Success (${poolType.toUpperCase()})`);
      logger.info(`    Base Token: ${poolInfo.baseTokenAddress}`);
      logger.info(`    Quote Token: ${poolInfo.quoteTokenAddress}`);
      logger.info(`    Fee: ${poolInfo.feePct}%\n`);

      results.push({
        type: poolType,
        network: NETWORK,
        baseSymbol: pool.baseSymbol,
        quoteSymbol: pool.quoteSymbol,
        baseTokenAddress: poolInfo.baseTokenAddress,
        quoteTokenAddress: poolInfo.quoteTokenAddress,
        feePct: poolInfo.feePct,
        address: pool.address,
      });

      successCount++;
    } else {
      logger.error(`  ✗ Failed to fetch pool info\n`);
      failedCount++;
    }
  }

  // Write results to template file
  logger.info('========================================');
  logger.info('Writing updated pancakeswap.json');
  logger.info('========================================');

  fs.writeFileSync(TEMPLATE_PATH, JSON.stringify(results, null, 2));

  logger.info(`Completed: ${successCount} success, ${failedCount} failed`);
  logger.info(`Total pools in file: ${results.length}\n`);

  logger.info('========================================');
  logger.info('Pool Addition Complete!');
  logger.info('========================================');
  logger.info('Please review the updated pancakeswap.json file.');
}

addPools().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
