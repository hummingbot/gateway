import { CoinGeckoService, TopPoolInfo } from '../services/coingecko-service';
import { logger } from '../services/logger';
import { TokenService } from '../services/token-service';

/**
 * Find pools from GeckoTerminal based on query parameters
 * Shared logic used by both /pools/find and /pools/find-save routes
 */
export async function findPools(
  chainNetwork: string,
  options: {
    tokenA?: string;
    tokenB?: string;
    connector?: string;
    type?: 'amm' | 'clmm';
    page?: number;
  },
): Promise<TopPoolInfo[]> {
  const { tokenA, tokenB, connector, type = 'clmm', page = 10 } = options;

  // Parse chain-network parameter using CoinGeckoService
  const coinGeckoService = CoinGeckoService.getInstance();
  const { chain, network } = coinGeckoService.parseChainNetwork(chainNetwork);

  // Resolve token addresses from symbols if needed
  const tokenService = TokenService.getInstance();

  let tokenAAddress = tokenA;
  if (tokenA) {
    const token = await tokenService.getToken(chain, network, tokenA);
    if (token) {
      tokenAAddress = token.address;
      logger.info(`Resolved tokenA symbol ${tokenA} to address ${tokenAAddress}`);
    } else {
      // Not in token list, assume it's an address
      tokenAAddress = tokenA;
    }
  }

  let tokenBAddress = tokenB;
  if (tokenB) {
    const token = await tokenService.getToken(chain, network, tokenB);
    if (token) {
      tokenBAddress = token.address;
      logger.info(`Resolved tokenB symbol ${tokenB} to address ${tokenBAddress}`);
    } else {
      // Not in token list, assume it's an address
      tokenBAddress = tokenB;
    }
  }

  // If neither token is provided, fetch top pools by network
  if (!tokenAAddress && !tokenBAddress) {
    logger.info(
      `Finding top pools for network ${chainNetwork}${connector ? ` (connector: ${connector})` : ''}${type ? ` (type: ${type})` : ''}`,
    );

    const pools = await coinGeckoService.getTopPoolsByNetwork(chainNetwork, page, connector, type);

    if (pools.length === 0) {
      logger.warn(
        `No pools found for network ${chainNetwork}${connector ? ` (connector: ${connector})` : ''}${type ? ` (type: ${type})` : ''}`,
      );
    } else {
      logger.info(`Found ${pools.length} pools for network ${chainNetwork}`);
    }

    return pools;
  }

  // Determine primary token for fetching pools
  const primaryTokenAddress = tokenAAddress || tokenBAddress;
  const secondaryTokenAddress =
    tokenAAddress && tokenBAddress ? (tokenAAddress === primaryTokenAddress ? tokenBAddress : tokenAAddress) : null;

  // If both tokens are provided, find pools for the pair
  if (primaryTokenAddress && secondaryTokenAddress) {
    logger.info(
      `Finding pools for token pair ${primaryTokenAddress}/${secondaryTokenAddress} on ${chainNetwork}${connector ? ` (connector: ${connector})` : ''}${type ? ` (type: ${type})` : ''}`,
    );

    // Fetch pools for primary token
    const poolsForPrimary = await coinGeckoService.getTopPoolsForToken(
      chainNetwork,
      primaryTokenAddress,
      page,
      connector,
      type,
    );

    // Filter to only pools that contain the secondary token
    const pairPools = poolsForPrimary.filter(
      (pool: TopPoolInfo) =>
        pool.baseTokenAddress === secondaryTokenAddress || pool.quoteTokenAddress === secondaryTokenAddress,
    );

    if (pairPools.length === 0) {
      logger.warn(
        `No pools found for token pair ${primaryTokenAddress}/${secondaryTokenAddress} on ${chainNetwork}${connector ? ` (connector: ${connector})` : ''}${type ? ` (type: ${type})` : ''}`,
      );
    } else {
      logger.info(`Found ${pairPools.length} pools for token pair ${primaryTokenAddress}/${secondaryTokenAddress}`);
    }

    return pairPools;
  }

  // If only one token is provided, find all pools for that token
  if (primaryTokenAddress) {
    logger.info(
      `Finding pools for token ${primaryTokenAddress} on ${chainNetwork}${connector ? ` (connector: ${connector})` : ''}${type ? ` (type: ${type})` : ''}`,
    );

    const pools = await coinGeckoService.getTopPoolsForToken(chainNetwork, primaryTokenAddress, page, connector, type);

    if (pools.length === 0) {
      logger.warn(
        `No pools found for token ${primaryTokenAddress} on ${chainNetwork}${connector ? ` (connector: ${connector})` : ''}${type ? ` (type: ${type})` : ''}`,
      );
    } else {
      logger.info(`Found ${pools.length} pools for token ${primaryTokenAddress}`);
    }

    return pools;
  }

  // This should never happen since we validate at the start
  throw new Error('Unexpected error: no token provided');
}
