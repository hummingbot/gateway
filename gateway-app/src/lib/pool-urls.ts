/**
 * Pool URL Helper
 *
 * Provides URLs to view pools on their respective DEX platforms
 */

interface PoolUrlParams {
  connector: string;
  type: 'amm' | 'clmm';
  network: string;
  poolAddress: string;
}

/**
 * Get the DEX platform URL for a given pool
 */
export function getPoolUrl({ connector, type, network, poolAddress }: PoolUrlParams): string | null {
  const key = `${connector}/${type}`;

  switch (key) {
    case 'meteora/clmm':
      return `https://app.meteora.ag/dlmm/${poolAddress}`;

    case 'raydium/clmm':
      return `https://raydium.io/clmm/pool/?pool_id=${poolAddress}`;

    case 'raydium/amm':
      return `https://raydium.io/liquidity/pool/?pool_id=${poolAddress}`;

    case 'uniswap/clmm':
      // Uniswap V3 URLs vary by network
      const uniswapBase = getUniswapNetworkBase(network);
      return uniswapBase ? `${uniswapBase}/pool/${poolAddress}` : null;

    case 'uniswap/amm':
      // Uniswap V2
      const uniswapV2Base = getUniswapNetworkBase(network);
      return uniswapV2Base ? `${uniswapV2Base}/pool/${poolAddress}` : null;

    case 'pancakeswap/clmm':
      return `https://pancakeswap.finance/liquidity/pool/${poolAddress}`;

    case 'pancakeswap/amm':
      return `https://pancakeswap.finance/liquidity/${poolAddress}`;

    default:
      return null;
  }
}

/**
 * Get Uniswap base URL for different networks
 */
function getUniswapNetworkBase(network: string): string | null {
  switch (network) {
    case 'mainnet':
      return 'https://app.uniswap.org';
    case 'polygon':
      return 'https://app.uniswap.org';
    case 'arbitrum':
      return 'https://app.uniswap.org';
    case 'optimism':
      return 'https://app.uniswap.org';
    case 'base':
      return 'https://app.uniswap.org';
    default:
      return null;
  }
}

/**
 * Get a human-readable name for the DEX platform
 */
export function getDexName(connector: string): string {
  switch (connector) {
    case 'meteora':
      return 'Meteora';
    case 'raydium':
      return 'Raydium';
    case 'uniswap':
      return 'Uniswap';
    case 'pancakeswap':
      return 'PancakeSwap';
    case 'jupiter':
      return 'Jupiter';
    default:
      return connector.charAt(0).toUpperCase() + connector.slice(1);
  }
}
