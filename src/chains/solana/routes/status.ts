import { FastifyInstance } from 'fastify';

import { StatusResponseType } from '../../../schemas/chain-schema';
import { logger, redactUrl } from '../../../services/logger';
import { Solana } from '../solana';
import { getSolanaChainConfig } from '../solana.config';

export async function getSolanaStatus(fastify: FastifyInstance, network: string): Promise<StatusResponseType> {
  try {
    const solana = await Solana.getInstance(network);
    const chainConfig = getSolanaChainConfig();
    const chain = 'solana';
    const rpcProvider = chainConfig.rpcProvider || 'url';

    // Get the actual RPC URL based on provider
    let rpcUrl = solana.config.nodeURL; // Default to nodeURL
    const rpcProviderService = solana.getRpcProviderService();
    if (rpcProviderService) {
      try {
        rpcUrl = rpcProviderService.getHttpUrl() ?? rpcUrl;
      } catch (error) {
        // If provider URL generation fails, fall back to nodeURL
        logger.warn(`Failed to get RPC provider URL, using nodeURL: ${redactUrl(error.message)}`);
      }
    }
    // A provider URL carries its API key (Helius in the query, Infura and Chainstack in
    // the path), and this route is not behind the API token.
    rpcUrl = redactUrl(rpcUrl);

    const nativeCurrency = solana.config.nativeCurrencySymbol;
    const swapProvider = solana.config.swapProvider || '';
    const currentBlockNumber = await solana.getCurrentBlockNumber();

    return {
      chain,
      network,
      rpcUrl,
      rpcProvider,
      currentBlockNumber,
      nativeCurrency,
      swapProvider,
    };
  } catch (error) {
    const message = redactUrl(error.message);
    logger.error(`Error getting Solana status: ${message}`);
    throw fastify.httpErrors.internalServerError(`Failed to get Solana status: ${message}`);
  }
}
