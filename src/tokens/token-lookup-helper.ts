/**
 * Helper function for fetching token information from GeckoTerminal
 * Shared logic between /tokens/find/:address and /tokens/save/:address
 */

import { CoinGeckoService } from '../services/coingecko-service';
import { ConfigManagerV2 } from '../services/config-manager-v2';

import { TokenInfo } from './schemas';

/**
 * Fetch token information from GeckoTerminal
 * This is shared logic used by both /tokens/find/:address and /tokens/save/:address
 */
export async function fetchTokenInfo(chainNetwork: string, address: string): Promise<TokenInfo> {
  // Fetch token info from GeckoTerminal
  const coinGeckoService = CoinGeckoService.getInstance();
  const tokenData = await coinGeckoService.getTokenInfo(chainNetwork, address);

  // Get chainId from chainNetwork
  const configManager = ConfigManagerV2.getInstance();
  const chainId = configManager.getChainId(chainNetwork);

  // Return TokenInfo
  return {
    chainId,
    name: tokenData.name,
    symbol: tokenData.symbol,
    address: tokenData.address,
    decimals: tokenData.decimals,
  };
}
