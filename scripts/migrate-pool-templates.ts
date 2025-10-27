import fs from 'fs/promises';
import path from 'path';

import { Ethereum } from '../src/chains/ethereum/ethereum';
import { Solana } from '../src/chains/solana/solana';
import { Meteora } from '../src/connectors/meteora/meteora';
import { Raydium } from '../src/connectors/raydium/raydium';
import { Uniswap } from '../src/connectors/uniswap/uniswap';
import { logger } from '../src/services/logger';

interface OldPool {
  type: 'amm' | 'clmm';
  network: string;
  baseSymbol: string;
  quoteSymbol: string;
  address: string;
}

interface NewPool {
  type: 'amm' | 'clmm';
  network: string;
  baseSymbol: string;
  quoteSymbol: string;
  baseTokenAddress: string;
  quoteTokenAddress: string;
  feePct: number;
  address: string;
}

interface PoolInfo {
  baseTokenAddress: string;
  quoteTokenAddress: string;
  feePct: number;
}

async function fetchRaydiumPoolInfo(type: 'amm' | 'clmm', network: string, poolAddress: string): Promise<PoolInfo | null> {
  try {
    const raydium = await Raydium.getInstance(network);

    if (type === 'clmm') {
      const poolInfo = await raydium.getClmmPoolInfo(poolAddress);
      return {
        baseTokenAddress: poolInfo.baseTokenAddress,
        quoteTokenAddress: poolInfo.quoteTokenAddress,
        feePct: poolInfo.feePct,
      };
    } else {
      const poolInfo = await raydium.getAmmPoolInfo(poolAddress);
      return {
        baseTokenAddress: poolInfo.baseTokenAddress,
        quoteTokenAddress: poolInfo.quoteTokenAddress,
        feePct: poolInfo.feePct,
      };
    }
  } catch (error) {
    logger.error(`Error fetching Raydium pool info for ${poolAddress}: ${error.message}`);
    return null;
  }
}

async function fetchMeteoraPoolInfo(network: string, poolAddress: string): Promise<PoolInfo | null> {
  try {
    const meteora = await Meteora.getInstance(network);
    const poolInfo = await meteora.getPoolInfo(poolAddress);
    return {
      baseTokenAddress: poolInfo.baseTokenAddress,
      quoteTokenAddress: poolInfo.quoteTokenAddress,
      feePct: poolInfo.feePct,
    };
  } catch (error) {
    logger.error(`Error fetching Meteora pool info for ${poolAddress}: ${error.message}`);
    return null;
  }
}

async function fetchUniswapPoolInfo(type: 'amm' | 'clmm', network: string, poolAddress: string): Promise<PoolInfo | null> {
  try {
    const uniswap = await Uniswap.getInstance(network);
    const ethereum = await Ethereum.getInstance(network);

    // Import pool info utilities
    const uniswapUtils = await import('../src/connectors/uniswap/uniswap.utils');

    if (type === 'clmm') {
      // For CLMM (V3)
      const poolInfo = await uniswapUtils.getV3PoolInfo(poolAddress, network);
      if (!poolInfo) {
        return null;
      }

      // Get fee from pool contract
      const Contract = (await import('@ethersproject/contracts')).Contract;
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
      const fee = await poolContract.fee();
      const feePct = fee / 10000; // Convert from basis points to percentage

      return {
        baseTokenAddress: poolInfo.baseTokenAddress,
        quoteTokenAddress: poolInfo.quoteTokenAddress,
        feePct: feePct,
      };
    } else {
      // For AMM (V2)
      const poolInfo = await uniswapUtils.getV2PoolInfo(poolAddress, network);
      if (!poolInfo) {
        return null;
      }

      // Uniswap V2 has fixed 0.3% fee
      return {
        baseTokenAddress: poolInfo.baseTokenAddress,
        quoteTokenAddress: poolInfo.quoteTokenAddress,
        feePct: 0.3,
      };
    }
  } catch (error) {
    logger.error(`Error fetching Uniswap pool info for ${poolAddress}: ${error.message}`);
    return null;
  }
}

async function fetchPoolInfo(
  connector: string,
  type: 'amm' | 'clmm',
  network: string,
  poolAddress: string,
): Promise<PoolInfo | null> {
  if (connector === 'raydium') {
    return fetchRaydiumPoolInfo(type, network, poolAddress);
  } else if (connector === 'meteora') {
    return fetchMeteoraPoolInfo(network, poolAddress);
  } else if (connector === 'uniswap') {
    return fetchUniswapPoolInfo(type, network, poolAddress);
  }
  return null;
}

async function migrateTemplateFile(connector: string, templatePath: string): Promise<void> {
  logger.info(`\n========================================`);
  logger.info(`Migrating template file: ${templatePath}`);
  logger.info(`========================================\n`);

  // Read existing template
  const fileContent = await fs.readFile(templatePath, 'utf-8');
  const oldPools: OldPool[] = JSON.parse(fileContent);

  logger.info(`Found ${oldPools.length} pools to migrate\n`);

  const newPools: NewPool[] = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < oldPools.length; i++) {
    const oldPool = oldPools[i];
    logger.info(`[${i + 1}/${oldPools.length}] Processing: ${oldPool.baseSymbol}-${oldPool.quoteSymbol}`);
    logger.info(`  Address: ${oldPool.address}`);
    logger.info(`  Type: ${oldPool.type}`);
    logger.info(`  Network: ${oldPool.network}`);

    const poolInfo = await fetchPoolInfo(connector, oldPool.type, oldPool.network, oldPool.address);

    if (poolInfo) {
      newPools.push({
        ...oldPool,
        baseTokenAddress: poolInfo.baseTokenAddress,
        quoteTokenAddress: poolInfo.quoteTokenAddress,
        feePct: poolInfo.feePct,
      });
      logger.info(`  ✓ Success`);
      logger.info(`    Base Token: ${poolInfo.baseTokenAddress}`);
      logger.info(`    Quote Token: ${poolInfo.quoteTokenAddress}`);
      logger.info(`    Fee: ${poolInfo.feePct}%\n`);
      successCount++;
    } else {
      logger.error(`  ✗ Failed to fetch pool info\n`);
      failCount++;
      // Skip failed pools - don't add to newPools
    }
  }

  // Write updated template
  await fs.writeFile(templatePath, JSON.stringify(newPools, null, 2) + '\n', 'utf-8');

  logger.info(`========================================`);
  logger.info(`Completed ${templatePath}`);
  logger.info(`  Success: ${successCount}`);
  logger.info(`  Failed: ${failCount}`);
  logger.info(`  Total pools in new file: ${newPools.length}`);
  logger.info(`========================================\n`);
}

async function main() {
  logger.info('Starting pool template migration...\n');

  const templatesDir = path.join(__dirname, '..', 'src', 'templates', 'pools');

  const connectors = [
    { name: 'raydium', file: 'raydium.json' },
    { name: 'meteora', file: 'meteora.json' },
    { name: 'uniswap', file: 'uniswap.json' },
  ];

  let totalSuccess = 0;
  let totalFail = 0;

  for (const connector of connectors) {
    const templatePath = path.join(templatesDir, connector.file);

    // Check if file exists
    try {
      await fs.access(templatePath);
      await migrateTemplateFile(connector.name, templatePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.warn(`Template file not found: ${templatePath}\n`);
      } else {
        logger.error(`Error processing ${templatePath}: ${error.message}\n`);
        totalFail++;
      }
    }
  }

  logger.info('\n========================================');
  logger.info('Migration Complete!');
  logger.info('========================================');
  logger.info('Please review the migrated template files before committing.');
}

main().catch((error) => {
  logger.error(`\nMigration failed with error: ${error.message}`);
  logger.error(error.stack);
  process.exit(1);
});
