/**
 * ETCswap contract addresses for Ethereum Classic networks
 * This file contains the contract addresses for ETCswap V2 and V3 contracts
 * on Ethereum Classic (classic) and Mordor testnet (mordor).
 *
 * ETCswap is a fork of Uniswap deployed on Ethereum Classic.
 * Contracts are ABI-compatible with Uniswap V2 and V3.
 *
 * Last updated: January 2026
 * Source of truth: https://github.com/etcswap/sdks/blob/main/deployed-contracts.md
 *
 * NPM Packages (official):
 * - @etcswapv2/sdk-core: Core SDK utilities shared across V2/V3
 * - @etcswapv2/sdk: ETCswap V2 SDK for AMM operations
 * - @etcswapv3/sdk: ETCswap V3 CLMM SDK
 * - @etcswapv3/router-sdk: Universal Router SDK
 *
 * NOTE: The @_etcswap/* packages are DEPRECATED. Use @etcswapv2/* and @etcswapv3/* instead.
 *
 * Installation:
 *   pnpm add @etcswapv2/sdk-core @etcswapv2/sdk @etcswapv3/sdk @etcswapv3/router-sdk
 *
 * Key differences from Uniswap:
 * - V2 contracts are DIFFERENT on Classic vs Mordor
 * - V3 contracts are SAME on both networks
 * - INIT_CODE_HASH values differ from Uniswap
 */

export interface ETCswapContractAddresses {
  // V2 contracts
  etcswapV2RouterAddress: string;
  etcswapV2FactoryAddress: string;
  etcswapV2MulticallAddress: string;

  // V3 contracts
  etcswapV3SwapRouter02Address: string;
  etcswapV3NftManagerAddress: string;
  etcswapV3QuoterV2ContractAddress: string;
  etcswapV3FactoryAddress: string;

  // Universal Router
  universalRouterAddress: string;

  // Other V3 contracts
  permit2Address?: string;
  tickLensAddress?: string;

  // Wrapped native token
  wetcAddress: string;
}

export interface NetworkContractAddresses {
  [network: string]: ETCswapContractAddresses;
}

export const contractAddresses: NetworkContractAddresses = {
  classic: {
    // V2 contracts - ETCswap V2 on Ethereum Classic mainnet
    etcswapV2RouterAddress: '0x79Bf07555C34e68C4Ae93642d1007D7f908d60F5',
    etcswapV2FactoryAddress: '0x0307cd3D7DA98A29e6Ed0D2137be386Ec1e4Bc9C',
    etcswapV2MulticallAddress: '0x900cD941a2451471BC5760c3d69493Ac57aA9698',

    // V3 contracts - ETCswap V3 on Ethereum Classic mainnet
    etcswapV3SwapRouter02Address: '0xEd88EDD995b00956097bF90d39C9341BBde324d1',
    etcswapV3NftManagerAddress: '0x3CEDe6562D6626A04d7502CC35720901999AB699',
    etcswapV3QuoterV2ContractAddress: '0x4d8c163400CB87Cbe1bae76dBf36A09FED85d39B',
    etcswapV3FactoryAddress: '0x2624E907BcC04f93C8f29d7C7149a8700Ceb8cDC',

    // Universal Router
    universalRouterAddress: '0x9b676E761040D60C6939dcf5f582c2A4B51025F1',

    // Other V3 contracts
    permit2Address: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    tickLensAddress: '0x23B7Bab45c84fA8f68f813D844E8afD44eE8C315',

    // Wrapped ETC
    wetcAddress: '0x1953cab0E5bFa6D4a9BaD6E05fD46C1CC6527a5a',
  },
  mordor: {
    // V2 contracts - ETCswap V2 on Mordor testnet
    // Updated router address to match ETCswap UI mordor branch
    etcswapV2RouterAddress: '0x6d194227a9A1C11f144B35F96E6289c5602Da493',
    etcswapV2FactoryAddress: '0x212eE1B5c8C26ff5B2c4c14CD1C54486Fe23ce70',
    etcswapV2MulticallAddress: '0x41Fa0143ea4b4d91B41BF23d0A03ed3172725C4B',

    // V3 contracts - ETCswap V3 on Mordor testnet (same as classic)
    etcswapV3SwapRouter02Address: '0xEd88EDD995b00956097bF90d39C9341BBde324d1',
    etcswapV3NftManagerAddress: '0x3CEDe6562D6626A04d7502CC35720901999AB699',
    etcswapV3QuoterV2ContractAddress: '0x4d8c163400CB87Cbe1bae76dBf36A09FED85d39B',
    etcswapV3FactoryAddress: '0x2624E907BcC04f93C8f29d7C7149a8700Ceb8cDC',

    // Universal Router
    universalRouterAddress: '0x9b676E761040D60C6939dcf5f582c2A4B51025F1',

    // Other V3 contracts
    permit2Address: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    tickLensAddress: '0x23B7Bab45c84fA8f68f813D844E8afD44eE8C315',

    // Wrapped ETC
    wetcAddress: '0x1953cab0E5bFa6D4a9BaD6E05fD46C1CC6527a5a',
  },
};

/**
 * V2 Pair INIT_CODE_HASH for ETCswap
 * Used for computing pair addresses with CREATE2
 * Different for each network due to separate deployments
 */
export const ETCSWAP_V2_INIT_CODE_HASH_MAP: { [network: string]: string } = {
  classic: '0xb5e58237f3a44220ffc3dfb989e53735df8fcd9df82c94b13105be8380344e52',
  mordor: '0x4d8a51f257ed377a6ac3f829cd4226c892edbbbcb87622bcc232807b885b1303',
};

/**
 * Get V2 INIT_CODE_HASH for a network
 */
export function getETCswapV2InitCodeHash(network: string): string {
  const hash = ETCSWAP_V2_INIT_CODE_HASH_MAP[network];
  if (!hash) {
    throw new Error(`ETCswap V2 INIT_CODE_HASH not configured for network: ${network}`);
  }
  return hash;
}

/**
 * V3 Pool INIT_CODE_HASH for ETCswap
 * Used for computing pool addresses
 * Same for both Classic and Mordor networks
 */
export const ETCSWAP_V3_INIT_CODE_HASH = '0x7ea2da342810af3c5a9b47258f990aaac829fe1385a1398feb77d0126a85dbef';

/**
 * Helper functions to get contract addresses
 */

export function getETCswapV2RouterAddress(network: string): string {
  const address = contractAddresses[network]?.etcswapV2RouterAddress;

  if (!address) {
    throw new Error(`ETCswap V2 Router address not configured for network: ${network}`);
  }

  return address;
}

export function getETCswapV2FactoryAddress(network: string): string {
  const address = contractAddresses[network]?.etcswapV2FactoryAddress;

  if (!address) {
    throw new Error(`ETCswap V2 Factory address not configured for network: ${network}`);
  }

  return address;
}

export function getETCswapV3SwapRouter02Address(network: string): string {
  const address = contractAddresses[network]?.etcswapV3SwapRouter02Address;

  if (!address) {
    throw new Error(
      `ETCswap V3 SwapRouter02 address not configured for network: ${network}. V3 may not be deployed on this network.`,
    );
  }

  return address;
}

export function getUniversalRouterAddress(network: string): string {
  const address = contractAddresses[network]?.universalRouterAddress;

  if (!address) {
    throw new Error(
      `ETCswap Universal Router address not configured for network: ${network}. Universal Router may not be deployed on this network.`,
    );
  }

  return address;
}

export function getETCswapV3NftManagerAddress(network: string): string {
  const address = contractAddresses[network]?.etcswapV3NftManagerAddress;

  if (!address) {
    throw new Error(
      `ETCswap V3 NFT Manager address not configured for network: ${network}. V3 may not be deployed on this network.`,
    );
  }

  return address;
}

export function getETCswapV3QuoterV2ContractAddress(network: string): string {
  const address = contractAddresses[network]?.etcswapV3QuoterV2ContractAddress;

  if (!address) {
    throw new Error(
      `ETCswap V3 Quoter V2 contract address not configured for network: ${network}. V3 may not be deployed on this network.`,
    );
  }

  return address;
}

export function getETCswapV3FactoryAddress(network: string): string {
  const address = contractAddresses[network]?.etcswapV3FactoryAddress;

  if (!address) {
    throw new Error(
      `ETCswap V3 Factory address not configured for network: ${network}. V3 may not be deployed on this network.`,
    );
  }

  return address;
}

export function getWETCAddress(network: string): string {
  const address = contractAddresses[network]?.wetcAddress;

  if (!address) {
    throw new Error(`WETC address not configured for network: ${network}`);
  }

  return address;
}

/**
 * Returns the appropriate spender address based on the connector name
 * @param network The network name (e.g. 'classic', 'mordor')
 * @param connectorName The connector name (etcswap/clmm, etcswap/amm, etcswap/router, etcswap)
 * @returns The address of the contract that should be approved to spend tokens
 */
export function getSpender(network: string, connectorName: string): string {
  // Check for AMM (V2) connector pattern
  if (connectorName.includes('/amm')) {
    return getETCswapV2RouterAddress(network);
  }

  // Check for CLMM swap-specific pattern - use SwapRouter02
  if (connectorName.includes('/clmm/swap')) {
    return getETCswapV3SwapRouter02Address(network);
  }

  // Check for CLMM (V3) connector pattern
  if (connectorName.includes('/clmm')) {
    return getETCswapV3NftManagerAddress(network);
  }

  // For router connector pattern or regular etcswap connector, use Universal Router
  if (connectorName.includes('/router') || connectorName === 'etcswap') {
    return getUniversalRouterAddress(network);
  }

  // Default to V2 Router for any other case (most compatible)
  return getETCswapV2RouterAddress(network);
}

/**
 * Check if V3 is available on the given network
 */
export function isV3Available(network: string): boolean {
  const addresses = contractAddresses[network];
  return !!(
    addresses?.etcswapV3FactoryAddress &&
    addresses?.etcswapV3SwapRouter02Address &&
    addresses?.etcswapV3NftManagerAddress
  );
}

/**
 * Check if Universal Router is available on the given network
 */
export function isUniversalRouterAvailable(network: string): boolean {
  return !!contractAddresses[network]?.universalRouterAddress;
}

/**
 * ABI Definitions
 *
 * NOTE: ETCswap V3 contracts are ABI-compatible with Uniswap V3.
 * However, ETCswap V2 Router uses different function names:
 * - addLiquidityETC instead of addLiquidityETH
 * - removeLiquidityETC instead of removeLiquidityETH
 * - swapExactETCForTokens instead of swapExactETHForTokens
 * - swapTokensForExactETC instead of swapTokensForExactETH
 * - swapExactTokensForETC instead of swapExactTokensForETH
 * - swapETCForExactTokens instead of swapETHForExactTokens
 *
 * The token-to-token functions (swapExactTokensForTokens, addLiquidity, removeLiquidity)
 * have the same names in both Uniswap and ETCswap.
 */

// Re-export V3 ABIs from uniswap.contracts.ts since ETCswap V3 is ABI-compatible
export {
  IQuoterV2ABI,
  ISwapRouter02ABI,
  IUniswapV2PairABI,
  IUniswapV2FactoryABI,
  POSITION_MANAGER_ABI,
  ERC20_ABI,
} from '../uniswap/uniswap.contracts';

/**
 * ETCswap V2 Router ABI for swap and liquidity methods
 * Uses ETC function names instead of ETH (e.g., addLiquidityETC instead of addLiquidityETH)
 */
export const IEtcswapV2Router02ABI = {
  abi: [
    // Router methods for swapping with native ETC
    {
      inputs: [
        { internalType: 'uint256', name: 'amountOutMin', type: 'uint256' },
        { internalType: 'address[]', name: 'path', type: 'address[]' },
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'deadline', type: 'uint256' },
      ],
      name: 'swapExactETCForTokens',
      outputs: [{ internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' }],
      stateMutability: 'payable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
        { internalType: 'uint256', name: 'amountOutMin', type: 'uint256' },
        { internalType: 'address[]', name: 'path', type: 'address[]' },
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'deadline', type: 'uint256' },
      ],
      name: 'swapExactTokensForETC',
      outputs: [{ internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' }],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
        { internalType: 'uint256', name: 'amountOutMin', type: 'uint256' },
        { internalType: 'address[]', name: 'path', type: 'address[]' },
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'deadline', type: 'uint256' },
      ],
      name: 'swapExactTokensForTokens',
      outputs: [{ internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' }],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: 'amountOut', type: 'uint256' },
        { internalType: 'address[]', name: 'path', type: 'address[]' },
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'deadline', type: 'uint256' },
      ],
      name: 'swapETCForExactTokens',
      outputs: [{ internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' }],
      stateMutability: 'payable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: 'amountOut', type: 'uint256' },
        { internalType: 'uint256', name: 'amountInMax', type: 'uint256' },
        { internalType: 'address[]', name: 'path', type: 'address[]' },
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'deadline', type: 'uint256' },
      ],
      name: 'swapTokensForExactETC',
      outputs: [{ internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' }],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: 'amountOut', type: 'uint256' },
        { internalType: 'uint256', name: 'amountInMax', type: 'uint256' },
        { internalType: 'address[]', name: 'path', type: 'address[]' },
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'deadline', type: 'uint256' },
      ],
      name: 'swapTokensForExactTokens',
      outputs: [{ internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' }],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    // Router methods for adding/removing liquidity
    {
      inputs: [
        { internalType: 'address', name: 'tokenA', type: 'address' },
        { internalType: 'address', name: 'tokenB', type: 'address' },
        { internalType: 'uint256', name: 'amountADesired', type: 'uint256' },
        { internalType: 'uint256', name: 'amountBDesired', type: 'uint256' },
        { internalType: 'uint256', name: 'amountAMin', type: 'uint256' },
        { internalType: 'uint256', name: 'amountBMin', type: 'uint256' },
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'deadline', type: 'uint256' },
      ],
      name: 'addLiquidity',
      outputs: [
        { internalType: 'uint256', name: 'amountA', type: 'uint256' },
        { internalType: 'uint256', name: 'amountB', type: 'uint256' },
        { internalType: 'uint256', name: 'liquidity', type: 'uint256' },
      ],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'address', name: 'token', type: 'address' },
        {
          internalType: 'uint256',
          name: 'amountTokenDesired',
          type: 'uint256',
        },
        { internalType: 'uint256', name: 'amountTokenMin', type: 'uint256' },
        { internalType: 'uint256', name: 'amountETCMin', type: 'uint256' },
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'deadline', type: 'uint256' },
      ],
      name: 'addLiquidityETC',
      outputs: [
        { internalType: 'uint256', name: 'amountToken', type: 'uint256' },
        { internalType: 'uint256', name: 'amountETC', type: 'uint256' },
        { internalType: 'uint256', name: 'liquidity', type: 'uint256' },
      ],
      stateMutability: 'payable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'address', name: 'tokenA', type: 'address' },
        { internalType: 'address', name: 'tokenB', type: 'address' },
        { internalType: 'uint256', name: 'liquidity', type: 'uint256' },
        { internalType: 'uint256', name: 'amountAMin', type: 'uint256' },
        { internalType: 'uint256', name: 'amountBMin', type: 'uint256' },
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'deadline', type: 'uint256' },
      ],
      name: 'removeLiquidity',
      outputs: [
        { internalType: 'uint256', name: 'amountA', type: 'uint256' },
        { internalType: 'uint256', name: 'amountB', type: 'uint256' },
      ],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'address', name: 'token', type: 'address' },
        { internalType: 'uint256', name: 'liquidity', type: 'uint256' },
        { internalType: 'uint256', name: 'amountTokenMin', type: 'uint256' },
        { internalType: 'uint256', name: 'amountETCMin', type: 'uint256' },
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'deadline', type: 'uint256' },
      ],
      name: 'removeLiquidityETC',
      outputs: [
        { internalType: 'uint256', name: 'amountToken', type: 'uint256' },
        { internalType: 'uint256', name: 'amountETC', type: 'uint256' },
      ],
      stateMutability: 'nonpayable',
      type: 'function',
    },
  ],
};
