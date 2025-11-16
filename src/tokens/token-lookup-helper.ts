/**
 * Helper function for fetching token information from GeckoTerminal
 * Shared logic between /tokens/find/:address and /tokens/save/:address
 */

import { CoinGeckoService } from '../services/coingecko-service';
import { ConfigManagerV2 } from '../services/config-manager-v2';
import { toTokenGeckoData } from '../services/gecko-types';

import { TokenInfo } from './schemas';

/**
 * Fetch token information with market data from GeckoTerminal
 * This is shared logic used by both /tokens/find/:address and /tokens/save/:address
 */
export async function fetchTokenInfo(chainNetwork: string, address: string): Promise<TokenInfo> {
  // Fetch token info with market data from GeckoTerminal
  const coinGeckoService = CoinGeckoService.getInstance();
  const tokenData = await coinGeckoService.getTokenInfoWithMarketData(chainNetwork, address);

  // Get chainId from chainNetwork
  const configManager = ConfigManagerV2.getInstance();
  const chainId = configManager.getChainId(chainNetwork);

  // Transform to typed geckoData using helper
  const geckoData = toTokenGeckoData({
    coingeckoCoinId: tokenData.coingeckoCoinId,
    imageUrl: tokenData.imageUrl,
    priceUsd: tokenData.priceUsd,
    volumeUsd24h: tokenData.volumeUsd24h,
    marketCapUsd: tokenData.marketCapUsd,
    fdvUsd: tokenData.fdvUsd,
    totalSupply: tokenData.totalSupply,
    topPools: tokenData.topPools,
  });

  // Return TokenInfo with geckoData populated
  return {
    chainId,
    name: tokenData.name,
    symbol: tokenData.symbol,
    address: tokenData.address,
    decimals: tokenData.decimals,
    geckoData,
  };
}
