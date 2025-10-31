import { Connection } from '@solana/web3.js';
import { ethers } from 'ethers';

import { getEthereumNetworkConfig } from '../chains/ethereum/ethereum.config';
import { InfuraService } from '../chains/ethereum/infura-service';
import { HeliusService } from '../chains/solana/helius-service';
import { getSolanaNetworkConfig } from '../chains/solana/solana.config';

import { ConfigManagerV2 } from './config-manager-v2';
import { logger } from './logger';

/**
 * Display chain configuration information at startup
 */
export async function displayChainConfigurations(): Promise<void> {
  try {
    logger.info('🌐 Chain Configurations:');

    // Display Solana configuration
    await displaySolanaConfig();

    // Display Ethereum configuration
    await displayEthereumConfig();
  } catch (error: any) {
    logger.warn(`Failed to display chain configurations: ${error.message}`);
  }
}

/**
 * Display Solana chain configuration
 */
async function displaySolanaConfig(): Promise<void> {
  try {
    const config = ConfigManagerV2.getInstance();

    // Try to get chain config directly
    const defaultNetwork = config.get('solana.defaultNetwork') || 'mainnet-beta';
    const rpcProvider = config.get('solana.rpcProvider');

    // Get network config
    const namespaceId = `solana-${defaultNetwork}`;
    let nodeURL = config.get(`${namespaceId}.nodeURL`);

    // If using Helius, get the Helius URL from HeliusService
    if (rpcProvider === 'helius') {
      try {
        const heliusApiKey = config.get('helius.apiKey') || '';
        const useWebSocketRPC = config.get('helius.useWebSocketRPC') || false;
        const useSender = config.get('helius.useSender') || false;
        const regionCode = config.get('helius.regionCode') || '';
        const jitoTipSOL = config.get('helius.jitoTipSOL') || 0;

        const networkConfig = getSolanaNetworkConfig(defaultNetwork);
        const mergedConfig = {
          ...networkConfig,
          heliusAPIKey: heliusApiKey,
          useHeliusRestRPC: true,
          useHeliusWebSocketRPC: useWebSocketRPC,
          useHeliusSender: useSender,
          heliusRegionCode: regionCode,
          jitoTipSOL: jitoTipSOL,
        };

        const heliusService = new HeliusService(mergedConfig);
        nodeURL = heliusService.getUrlForNetwork(defaultNetwork);
      } catch (error: any) {
        logger.debug(`Unable to get Helius URL: ${error.message}`);
      }
    }

    if (!nodeURL) {
      logger.debug('Solana configuration not available');
      return;
    }

    // Fetch current block number
    try {
      const connection = new Connection(nodeURL, 'confirmed');
      const slot = await connection.getSlot();

      logger.info(`   📡 Solana (defaultNetwork: ${defaultNetwork}): Block #${slot.toLocaleString()} - ${nodeURL}`);
    } catch (error: any) {
      logger.info(`   📡 Solana (defaultNetwork: ${defaultNetwork}): Unable to fetch block number - ${nodeURL}`);
      logger.debug(`Solana block fetch error: ${error.message}`);
    }
  } catch (error: any) {
    logger.debug(`Solana configuration not available: ${error.message}`);
  }
}

/**
 * Display Ethereum chain configuration
 */
async function displayEthereumConfig(): Promise<void> {
  try {
    const config = ConfigManagerV2.getInstance();

    // Try to get chain config directly
    const defaultNetwork = config.get('ethereum.defaultNetwork') || 'mainnet';
    const rpcProvider = config.get('ethereum.rpcProvider');

    // Get network config
    const namespaceId = `ethereum-${defaultNetwork}`;
    let nodeURL = config.get(`${namespaceId}.nodeURL`);

    // If using Infura, get the Infura URL from InfuraService
    if (rpcProvider === 'infura') {
      try {
        const infuraApiKey = config.get('infura.apiKey') || '';
        const useWebSocket = config.get('infura.useWebSocket') || false;

        const networkConfig = getEthereumNetworkConfig(defaultNetwork);
        const mergedConfig = {
          ...networkConfig,
          infuraAPIKey: infuraApiKey,
          useInfuraWebSocket: useWebSocket,
        };

        const infuraService = new InfuraService(mergedConfig);
        nodeURL = infuraService.getUrlForNetwork(defaultNetwork);
      } catch (error: any) {
        logger.debug(`Unable to get Infura URL: ${error.message}`);
      }
    }

    if (!nodeURL) {
      logger.debug('Ethereum configuration not available');
      return;
    }

    // Fetch current block number
    try {
      const provider = new ethers.providers.JsonRpcProvider(nodeURL);
      const blockNumber = await provider.getBlockNumber();

      logger.info(
        `   📡 Ethereum (defaultNetwork: ${defaultNetwork}): Block #${blockNumber.toLocaleString()} - ${nodeURL}`,
      );
    } catch (error: any) {
      logger.info(`   📡 Ethereum (defaultNetwork: ${defaultNetwork}): Unable to fetch block number - ${nodeURL}`);
      logger.debug(`Ethereum block fetch error: ${error.message}`);
    }
  } catch (error: any) {
    logger.debug(`Ethereum configuration not available: ${error.message}`);
  }
}
