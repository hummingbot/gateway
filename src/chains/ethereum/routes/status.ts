import { StatusResponseType } from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { Ethereum } from '../ethereum';
import { getEthereumChainConfig } from '../ethereum.config';

export async function getEthereumStatus(network: string): Promise<StatusResponseType> {
  try {
    const ethereum = await Ethereum.getInstance(network);
    const chainConfig = getEthereumChainConfig();
    const chain = 'ethereum';
    const rpcProvider = chainConfig.rpcProvider || 'url';

    // Get the actual RPC URL from the active provider (if any)
    let rpcUrl = ethereum.rpcUrl; // Default to standard rpcUrl
    const rpcProviderService = ethereum.getRpcProviderService();
    if (rpcProviderService) {
      try {
        rpcUrl = rpcProviderService.getHttpUrl() ?? rpcUrl;
      } catch (error) {
        // If provider URL generation fails, fall back to standard rpcUrl
        logger.warn(`Failed to get RPC provider URL, using standard rpcUrl: ${error.message}`);
      }
    }

    const nativeCurrency = ethereum.nativeTokenSymbol;

    // Directly try to get the current block number with a timeout
    let currentBlockNumber = 0;
    try {
      // Set up a timeout promise to prevent hanging on unresponsive nodes
      const blockPromise = ethereum.provider.getBlockNumber();
      const timeoutPromise = new Promise<number>((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 5000);
      });

      // Race the block request against the timeout
      currentBlockNumber = await Promise.race([blockPromise, timeoutPromise]);
    } catch (blockError) {
      logger.warn(`Failed to get block number: ${blockError.message}`);
      // Continue with default block number
    }

    return {
      chain,
      network,
      rpcUrl,
      rpcProvider,
      currentBlockNumber,
      nativeCurrency,
      swapProvider: ethereum.swapProvider,
    };
  } catch (error) {
    logger.error(`Error getting Ethereum status: ${error.message}`);
    throw new Error(`Failed to get Ethereum status: ${error.message}`);
  }
}
