import { Connection } from '@solana/web3.js';
import { ethers } from 'ethers';

import { Ethereum } from '../chains/ethereum/ethereum';
import { getEthereumNetworkConfig } from '../chains/ethereum/ethereum.config';
import { InfuraService } from '../chains/ethereum/infura-service';
import { HeliusService } from '../chains/solana/helius-service';
import { Solana } from '../chains/solana/solana';
import { getSolanaNetworkConfig } from '../chains/solana/solana.config';

import { ConfigManagerV2 } from './config-manager-v2';
import { logger, redactUrl } from './logger';

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
        const useWebSocket = config.get('helius.useWebSocket') || false;

        const networkConfig = getSolanaNetworkConfig(defaultNetwork);
        const heliusService = new HeliusService(
          { apiKey: heliusApiKey, useWebSocket },
          { chain: 'solana', network: defaultNetwork, chainId: networkConfig.chainID },
        );
        nodeURL = heliusService.getHttpUrl();
      } catch (error: any) {
        logger.debug(`Unable to get Helius URL: ${error.message}`);
      }
    }

    if (!nodeURL) {
      logger.debug('Solana configuration not available');
      return;
    }

    // Initialize Solana instance (this triggers auto-subscription to wallets if WebSocket enabled)
    try {
      const solana = await Solana.getInstance(defaultNetwork);
      const slot = await solana.connection.getSlot();

      logger.info(
        `   📡 Solana (defaultNetwork: ${defaultNetwork}): Block #${slot.toLocaleString()} - ${redactUrl(nodeURL)}`,
      );
    } catch (error: any) {
      logger.info(
        `   📡 Solana (defaultNetwork: ${defaultNetwork}): Unable to fetch block number - ${redactUrl(nodeURL)}`,
      );
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
        const infuraService = new InfuraService(
          { apiKey: infuraApiKey, useWebSocket },
          { chain: 'ethereum', network: defaultNetwork, chainId: networkConfig.chainID },
        );
        nodeURL = infuraService.getHttpUrl();
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
        `   📡 Ethereum (defaultNetwork: ${defaultNetwork}): Block #${blockNumber.toLocaleString()} - ${redactUrl(nodeURL)}`,
      );
    } catch (error: any) {
      logger.info(
        `   📡 Ethereum (defaultNetwork: ${defaultNetwork}): Unable to fetch block number - ${redactUrl(nodeURL)}`,
      );
      logger.debug(`Ethereum block fetch error: ${error.message}`);
    }
  } catch (error: any) {
    logger.debug(`Ethereum configuration not available: ${error.message}`);
  }
}
