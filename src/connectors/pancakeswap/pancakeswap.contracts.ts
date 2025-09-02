/**
 * Pancakeswap contract addresses for various networks
 * This file contains the contract addresses for Pancakeswap V2, V3, and Universal Router contracts
 * on different networks. These are not meant to be edited by users.
 *
 * Last updated: January 2025
 * Sources:
 * - V2: https://developer.pancakeswap.finance/contracts/v2/addresses
 * - V3: https://developer.pancakeswap.finance/contracts/v3/addresses
 * - Universal Router: https://developer.pancakeswap.finance/contracts/v3/addresses#smart-router
 */

import { Address } from 'viem';

export interface PancakeswapContractAddresses {
  // V2 contracts
  pancakeswapV2RouterAddress: Address;
  pancakeswapV2FactoryAddress: Address;

  // V3 contracts
  pancakeswapV3SwapRouter02Address: Address; // SwapRouter02 for V3 direct swaps
  pancakeswapV3NftManagerAddress: Address;
  pancakeswapV3QuoterV2ContractAddress: Address;
  pancakeswapV3FactoryAddress: Address;

  // Universal Router V2 (unified router for all protocols)
  universalRouterV2Address: Address;
}

export interface NetworkContractAddresses {
  [network: string]: PancakeswapContractAddresses;
}

export const contractAddresses: NetworkContractAddresses = {
  mainnet: {
    // V2 contracts - Official Pancakeswap addresses
    pancakeswapV2RouterAddress: '0xEfF92A263d31888d860bD50809A8D171709b7b1c',
    pancakeswapV2FactoryAddress: '0x1097053Fd2ea711dad45caCcc45EfF7548fCB362',
    // V3 contracts - Official Pancakeswap addresses
    pancakeswapV3SwapRouter02Address: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
    pancakeswapV3NftManagerAddress: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364',
    pancakeswapV3QuoterV2ContractAddress: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
    pancakeswapV3FactoryAddress: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
    // Universal Router V2 - Official Pancakeswap address
    universalRouterV2Address: '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4',
  },
  arbitrum: {
    // V2 contracts - Official Pancakeswap addresses
    pancakeswapV2RouterAddress: '0x8cFe327CEc66d1C090Dd72bd0FF11d690C33a2Eb',
    pancakeswapV2FactoryAddress: '0x02a84c1b3BBD7401a5f7fa98a384EBC70bB5749E',
    // V3 contracts - Official Pancakeswap addresses
    pancakeswapV3SwapRouter02Address: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
    pancakeswapV3NftManagerAddress: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364',
    pancakeswapV3QuoterV2ContractAddress: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
    pancakeswapV3FactoryAddress: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
    // Universal Router V2 - Official Pancakeswap address
    universalRouterV2Address: '0x32226588378236Fd0c7c4053999F88aC0e5cAc77',
  },
  base: {
    // V2 contracts - Official Pancakeswap addresses
    pancakeswapV2RouterAddress: '0x8cFe327CEc66d1C090Dd72bd0FF11d690C33a2Eb',
    pancakeswapV2FactoryAddress: '0x02a84c1b3BBD7401a5f7fa98a384EBC70bB5749E',
    // V3 contracts - Official Pancakeswap addresses
    pancakeswapV3SwapRouter02Address: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
    pancakeswapV3NftManagerAddress: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364',
    pancakeswapV3QuoterV2ContractAddress: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
    pancakeswapV3FactoryAddress: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
    // Universal Router V2 - Official Pancakeswap address
    universalRouterV2Address: '0x678Aa4bF4E210cf2166753e054d5b7c31cc7fa86',
  },
  bsc: {
    // V2 contracts - Official Pancakeswap addresses
    pancakeswapV2RouterAddress: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    pancakeswapV2FactoryAddress: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
    // V3 contracts - Official Pancakeswap addresses
    pancakeswapV3SwapRouter02Address: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
    pancakeswapV3NftManagerAddress: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364',
    pancakeswapV3QuoterV2ContractAddress: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
    pancakeswapV3FactoryAddress: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
    // Universal Router V2 - Official Pancakeswap address
    universalRouterV2Address: '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4',
  },
};

/**
 * Helper functions to get contract addresses
 */

export function getPancakeswapV2RouterAddress(network: string): string {
  const address = contractAddresses[network]?.pancakeswapV2RouterAddress;

  if (address === null) {
    throw new Error(
      `Pancakeswap V2 is not deployed on ${network} network. Please use Pancakeswap V3 for this network.`,
    );
  }

  if (!address) {
    throw new Error(`Pancakeswap V2 Router address not configured for network: ${network}`);
  }

  return address;
}

export function getPancakeswapV2FactoryAddress(network: string): Address {
  const address = contractAddresses[network]?.pancakeswapV2FactoryAddress;

  if (address === null) {
    throw new Error(
      `Pancakeswap V2 is not deployed on ${network} network. Please use Pancakeswap V3 for this network.`,
    );
  }

  if (!address) {
    throw new Error(`Pancakeswap V2 Factory address not configured for network: ${network}`);
  }

  return address;
}

export function getPancakeswapV3SwapRouter02Address(network: string): string {
  const address = contractAddresses[network]?.pancakeswapV3SwapRouter02Address;

  if (!address) {
    throw new Error(`Pancakeswap V3 SwapRouter02 address not configured for network: ${network}`);
  }

  return address;
}

export function getUniversalRouterV2Address(network: string): string {
  const address = contractAddresses[network]?.universalRouterV2Address;

  if (!address) {
    throw new Error(`Universal Router V2 address not configured for network: ${network}`);
  }

  return address;
}

export function getPancakeswapV3NftManagerAddress(network: string): string {
  const address = contractAddresses[network]?.pancakeswapV3NftManagerAddress;

  if (!address) {
    throw new Error(`Pancakeswap V3 NFT Manager address not configured for network: ${network}`);
  }

  return address;
}

export function getPancakeswapV3QuoterV2ContractAddress(network: string): string {
  const address = contractAddresses[network]?.pancakeswapV3QuoterV2ContractAddress;

  if (!address) {
    throw new Error(`Pancakeswap V3 Quoter V2 contract address not configured for network: ${network}`);
  }

  return address;
}

export function getPancakeswapV3FactoryAddress(network: string): Address {
  const address = contractAddresses[network]?.pancakeswapV3FactoryAddress;

  if (!address) {
    throw new Error(`Pancakeswap V3 Factory address not configured for network: ${network}`);
  }

  return address;
}

/**
 * Returns the appropriate spender address based on the connector name
 * @param network The network name (e.g. 'mainnet', 'base')
 * @param connectorName The connector name (pancakeswap/clmm, pancakeswap/amm, pancakeswap/router, pancakeswap)
 * @returns The address of the contract that should be approved to spend tokens
 */
export function getSpender(network: string, connectorName: string): string {
  // Check for AMM (V2) connector pattern
  if (connectorName.includes('/amm')) {
    return getPancakeswapV2RouterAddress(network);
  }

  // Check for CLMM (V3) connector pattern
  if (connectorName.includes('/clmm')) {
    return getPancakeswapV3NftManagerAddress(network);
  }

  // For router connector pattern or regular pancakeswap connector, use Universal Router V2
  if (connectorName.includes('/router') || connectorName === 'pancakeswap') {
    return getUniversalRouterV2Address(network);
  }

  // Default to Universal Router V2 for any other case
  return getUniversalRouterV2Address(network);
}

/**
 * ABI Definitions for Pancakeswap contracts
 */

/**
 * Pancakeswap V3 SwapRouter02 ABI for swap methods
 */
export const ISwapRouter02ABI = [
  {
    inputs: [
      { internalType: 'address', name: '_factoryV2', type: 'address' },
      { internalType: 'address', name: '_deployer', type: 'address' },
      { internalType: 'address', name: '_factoryV3', type: 'address' },
      { internalType: 'address', name: '_positionManager', type: 'address' },
      { internalType: 'address', name: '_stableFactory', type: 'address' },
      { internalType: 'address', name: '_stableInfo', type: 'address' },
      { internalType: 'address', name: '_WETH9', type: 'address' },
    ],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'previousOwner', type: 'address' },
      { indexed: true, internalType: 'address', name: 'newOwner', type: 'address' },
    ],
    name: 'OwnershipTransferred',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'factory', type: 'address' },
      { indexed: true, internalType: 'address', name: 'info', type: 'address' },
    ],
    name: 'SetStableSwap',
    type: 'event',
  },
  {
    inputs: [],
    name: 'WETH9',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'token', type: 'address' }],
    name: 'approveMax',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'token', type: 'address' }],
    name: 'approveMaxMinusOne',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'token', type: 'address' }],
    name: 'approveZeroThenMax',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'token', type: 'address' }],
    name: 'approveZeroThenMaxMinusOne',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'bytes', name: 'data', type: 'bytes' }],
    name: 'callPositionManager',
    outputs: [{ internalType: 'bytes', name: 'result', type: 'bytes' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'bytes[]', name: 'paths', type: 'bytes[]' },
      { internalType: 'uint128[]', name: 'amounts', type: 'uint128[]' },
      { internalType: 'uint24', name: 'maximumTickDivergence', type: 'uint24' },
      { internalType: 'uint32', name: 'secondsAgo', type: 'uint32' },
    ],
    name: 'checkOracleSlippage',
    outputs: [],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'bytes', name: 'path', type: 'bytes' },
      { internalType: 'uint24', name: 'maximumTickDivergence', type: 'uint24' },
      { internalType: 'uint32', name: 'secondsAgo', type: 'uint32' },
    ],
    name: 'checkOracleSlippage',
    outputs: [],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'deployer',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          { internalType: 'bytes', name: 'path', type: 'bytes' },
          { internalType: 'address', name: 'recipient', type: 'address' },
          { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
          { internalType: 'uint256', name: 'amountOutMinimum', type: 'uint256' },
        ],
        internalType: 'struct IV3SwapRouter.ExactInputParams',
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'exactInput',
    outputs: [{ internalType: 'uint256', name: 'amountOut', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          { internalType: 'address', name: 'tokenIn', type: 'address' },
          { internalType: 'address', name: 'tokenOut', type: 'address' },
          { internalType: 'uint24', name: 'fee', type: 'uint24' },
          { internalType: 'address', name: 'recipient', type: 'address' },
          { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
          { internalType: 'uint256', name: 'amountOutMinimum', type: 'uint256' },
          { internalType: 'uint160', name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
        internalType: 'struct IV3SwapRouter.ExactInputSingleParams',
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'exactInputSingle',
    outputs: [{ internalType: 'uint256', name: 'amountOut', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address[]', name: 'path', type: 'address[]' },
      { internalType: 'uint256[]', name: 'flag', type: 'uint256[]' },
      { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
      { internalType: 'uint256', name: 'amountOutMin', type: 'uint256' },
      { internalType: 'address', name: 'to', type: 'address' },
    ],
    name: 'exactInputStableSwap',
    outputs: [{ internalType: 'uint256', name: 'amountOut', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          { internalType: 'bytes', name: 'path', type: 'bytes' },
          { internalType: 'address', name: 'recipient', type: 'address' },
          { internalType: 'uint256', name: 'amountOut', type: 'uint256' },
          { internalType: 'uint256', name: 'amountInMaximum', type: 'uint256' },
        ],
        internalType: 'struct IV3SwapRouter.ExactOutputParams',
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'exactOutput',
    outputs: [{ internalType: 'uint256', name: 'amountIn', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          { internalType: 'address', name: 'tokenIn', type: 'address' },
          { internalType: 'address', name: 'tokenOut', type: 'address' },
          { internalType: 'uint24', name: 'fee', type: 'uint24' },
          { internalType: 'address', name: 'recipient', type: 'address' },
          { internalType: 'uint256', name: 'amountOut', type: 'uint256' },
          { internalType: 'uint256', name: 'amountInMaximum', type: 'uint256' },
          { internalType: 'uint160', name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
        internalType: 'struct IV3SwapRouter.ExactOutputSingleParams',
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'exactOutputSingle',
    outputs: [{ internalType: 'uint256', name: 'amountIn', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address[]', name: 'path', type: 'address[]' },
      { internalType: 'uint256[]', name: 'flag', type: 'uint256[]' },
      { internalType: 'uint256', name: 'amountOut', type: 'uint256' },
      { internalType: 'uint256', name: 'amountInMax', type: 'uint256' },
      { internalType: 'address', name: 'to', type: 'address' },
    ],
    name: 'exactOutputStableSwap',
    outputs: [{ internalType: 'uint256', name: 'amountIn', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'factory',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'factoryV2',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'getApprovalType',
    outputs: [{ internalType: 'enum IApproveAndCall.ApprovalType', name: '', type: 'uint8' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          { internalType: 'address', name: 'token0', type: 'address' },
          { internalType: 'address', name: 'token1', type: 'address' },
          { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
          { internalType: 'uint256', name: 'amount0Min', type: 'uint256' },
          { internalType: 'uint256', name: 'amount1Min', type: 'uint256' },
        ],
        internalType: 'struct IApproveAndCall.IncreaseLiquidityParams',
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'increaseLiquidity',
    outputs: [{ internalType: 'bytes', name: 'result', type: 'bytes' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          { internalType: 'address', name: 'token0', type: 'address' },
          { internalType: 'address', name: 'token1', type: 'address' },
          { internalType: 'uint24', name: 'fee', type: 'uint24' },
          { internalType: 'int24', name: 'tickLower', type: 'int24' },
          { internalType: 'int24', name: 'tickUpper', type: 'int24' },
          { internalType: 'uint256', name: 'amount0Min', type: 'uint256' },
          { internalType: 'uint256', name: 'amount1Min', type: 'uint256' },
          { internalType: 'address', name: 'recipient', type: 'address' },
        ],
        internalType: 'struct IApproveAndCall.MintParams',
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'mint',
    outputs: [{ internalType: 'bytes', name: 'result', type: 'bytes' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'bytes32', name: 'previousBlockhash', type: 'bytes32' },
      { internalType: 'bytes[]', name: 'data', type: 'bytes[]' },
    ],
    name: 'multicall',
    outputs: [{ internalType: 'bytes[]', name: '', type: 'bytes[]' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'deadline', type: 'uint256' },
      { internalType: 'bytes[]', name: 'data', type: 'bytes[]' },
    ],
    name: 'multicall',
    outputs: [{ internalType: 'bytes[]', name: '', type: 'bytes[]' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'bytes[]', name: 'data', type: 'bytes[]' }],
    name: 'multicall',
    outputs: [{ internalType: 'bytes[]', name: 'results', type: 'bytes[]' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'int256', name: 'amount0Delta', type: 'int256' },
      { internalType: 'int256', name: 'amount1Delta', type: 'int256' },
      { internalType: 'bytes', name: '_data', type: 'bytes' },
    ],
    name: 'pancakeV3SwapCallback',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'positionManager',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'uint256', name: 'value', type: 'uint256' },
    ],
    name: 'pull',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  { inputs: [], name: 'refundETH', outputs: [], stateMutability: 'payable', type: 'function' },
  { inputs: [], name: 'renounceOwnership', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  {
    inputs: [
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'uint256', name: 'value', type: 'uint256' },
      { internalType: 'uint256', name: 'deadline', type: 'uint256' },
      { internalType: 'uint8', name: 'v', type: 'uint8' },
      { internalType: 'bytes32', name: 'r', type: 'bytes32' },
      { internalType: 'bytes32', name: 's', type: 'bytes32' },
    ],
    name: 'selfPermit',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'uint256', name: 'nonce', type: 'uint256' },
      { internalType: 'uint256', name: 'expiry', type: 'uint256' },
      { internalType: 'uint8', name: 'v', type: 'uint8' },
      { internalType: 'bytes32', name: 'r', type: 'bytes32' },
      { internalType: 'bytes32', name: 's', type: 'bytes32' },
    ],
    name: 'selfPermitAllowed',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'uint256', name: 'nonce', type: 'uint256' },
      { internalType: 'uint256', name: 'expiry', type: 'uint256' },
      { internalType: 'uint8', name: 'v', type: 'uint8' },
      { internalType: 'bytes32', name: 'r', type: 'bytes32' },
      { internalType: 'bytes32', name: 's', type: 'bytes32' },
    ],
    name: 'selfPermitAllowedIfNecessary',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'uint256', name: 'value', type: 'uint256' },
      { internalType: 'uint256', name: 'deadline', type: 'uint256' },
      { internalType: 'uint8', name: 'v', type: 'uint8' },
      { internalType: 'bytes32', name: 'r', type: 'bytes32' },
      { internalType: 'bytes32', name: 's', type: 'bytes32' },
    ],
    name: 'selfPermitIfNecessary',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: '_factory', type: 'address' },
      { internalType: 'address', name: '_info', type: 'address' },
    ],
    name: 'setStableSwap',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'stableSwapFactory',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'stableSwapInfo',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
      { internalType: 'uint256', name: 'amountOutMin', type: 'uint256' },
      { internalType: 'address[]', name: 'path', type: 'address[]' },
      { internalType: 'address', name: 'to', type: 'address' },
    ],
    name: 'swapExactTokensForTokens',
    outputs: [{ internalType: 'uint256', name: 'amountOut', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'amountOut', type: 'uint256' },
      { internalType: 'uint256', name: 'amountInMax', type: 'uint256' },
      { internalType: 'address[]', name: 'path', type: 'address[]' },
      { internalType: 'address', name: 'to', type: 'address' },
    ],
    name: 'swapTokensForExactTokens',
    outputs: [{ internalType: 'uint256', name: 'amountIn', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'uint256', name: 'amountMinimum', type: 'uint256' },
      { internalType: 'address', name: 'recipient', type: 'address' },
    ],
    name: 'sweepToken',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'uint256', name: 'amountMinimum', type: 'uint256' },
    ],
    name: 'sweepToken',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'uint256', name: 'amountMinimum', type: 'uint256' },
      { internalType: 'uint256', name: 'feeBips', type: 'uint256' },
      { internalType: 'address', name: 'feeRecipient', type: 'address' },
    ],
    name: 'sweepTokenWithFee',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'uint256', name: 'amountMinimum', type: 'uint256' },
      { internalType: 'address', name: 'recipient', type: 'address' },
      { internalType: 'uint256', name: 'feeBips', type: 'uint256' },
      { internalType: 'address', name: 'feeRecipient', type: 'address' },
    ],
    name: 'sweepTokenWithFee',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'newOwner', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'amountMinimum', type: 'uint256' },
      { internalType: 'address', name: 'recipient', type: 'address' },
    ],
    name: 'unwrapWETH9',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'amountMinimum', type: 'uint256' },
      { internalType: 'address', name: 'recipient', type: 'address' },
      { internalType: 'uint256', name: 'feeBips', type: 'uint256' },
      { internalType: 'address', name: 'feeRecipient', type: 'address' },
    ],
    name: 'unwrapWETH9WithFee',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'amountMinimum', type: 'uint256' },
      { internalType: 'uint256', name: 'feeBips', type: 'uint256' },
      { internalType: 'address', name: 'feeRecipient', type: 'address' },
    ],
    name: 'unwrapWETH9WithFee',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'value', type: 'uint256' }],
    name: 'wrapETH',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  { stateMutability: 'payable', type: 'receive' },
];

/**
 * Pancakeswap V2 Router ABI for swap methods
 */
export const IPancakeswapV2Router02ABI = {
  abi: [
    {
      inputs: [
        { internalType: 'address', name: '_factory', type: 'address' },
        { internalType: 'address', name: '_WETH', type: 'address' },
      ],
      stateMutability: 'nonpayable',
      type: 'constructor',
    },
    {
      inputs: [],
      name: 'WETH',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
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
        { internalType: 'uint256', name: 'amountTokenDesired', type: 'uint256' },
        { internalType: 'uint256', name: 'amountTokenMin', type: 'uint256' },
        { internalType: 'uint256', name: 'amountETHMin', type: 'uint256' },
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'deadline', type: 'uint256' },
      ],
      name: 'addLiquidityETH',
      outputs: [
        { internalType: 'uint256', name: 'amountToken', type: 'uint256' },
        { internalType: 'uint256', name: 'amountETH', type: 'uint256' },
        { internalType: 'uint256', name: 'liquidity', type: 'uint256' },
      ],
      stateMutability: 'payable',
      type: 'function',
    },
    {
      inputs: [],
      name: 'factory',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: 'amountOut', type: 'uint256' },
        { internalType: 'uint256', name: 'reserveIn', type: 'uint256' },
        { internalType: 'uint256', name: 'reserveOut', type: 'uint256' },
      ],
      name: 'getAmountIn',
      outputs: [{ internalType: 'uint256', name: 'amountIn', type: 'uint256' }],
      stateMutability: 'pure',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
        { internalType: 'uint256', name: 'reserveIn', type: 'uint256' },
        { internalType: 'uint256', name: 'reserveOut', type: 'uint256' },
      ],
      name: 'getAmountOut',
      outputs: [{ internalType: 'uint256', name: 'amountOut', type: 'uint256' }],
      stateMutability: 'pure',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: 'amountOut', type: 'uint256' },
        { internalType: 'address[]', name: 'path', type: 'address[]' },
      ],
      name: 'getAmountsIn',
      outputs: [{ internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
        { internalType: 'address[]', name: 'path', type: 'address[]' },
      ],
      name: 'getAmountsOut',
      outputs: [{ internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: 'amountA', type: 'uint256' },
        { internalType: 'uint256', name: 'reserveA', type: 'uint256' },
        { internalType: 'uint256', name: 'reserveB', type: 'uint256' },
      ],
      name: 'quote',
      outputs: [{ internalType: 'uint256', name: 'amountB', type: 'uint256' }],
      stateMutability: 'pure',
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
        { internalType: 'uint256', name: 'amountETHMin', type: 'uint256' },
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'deadline', type: 'uint256' },
      ],
      name: 'removeLiquidityETH',
      outputs: [
        { internalType: 'uint256', name: 'amountToken', type: 'uint256' },
        { internalType: 'uint256', name: 'amountETH', type: 'uint256' },
      ],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'address', name: 'token', type: 'address' },
        { internalType: 'uint256', name: 'liquidity', type: 'uint256' },
        { internalType: 'uint256', name: 'amountTokenMin', type: 'uint256' },
        { internalType: 'uint256', name: 'amountETHMin', type: 'uint256' },
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'deadline', type: 'uint256' },
      ],
      name: 'removeLiquidityETHSupportingFeeOnTransferTokens',
      outputs: [{ internalType: 'uint256', name: 'amountETH', type: 'uint256' }],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'address', name: 'token', type: 'address' },
        { internalType: 'uint256', name: 'liquidity', type: 'uint256' },
        { internalType: 'uint256', name: 'amountTokenMin', type: 'uint256' },
        { internalType: 'uint256', name: 'amountETHMin', type: 'uint256' },
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'deadline', type: 'uint256' },
        { internalType: 'bool', name: 'approveMax', type: 'bool' },
        { internalType: 'uint8', name: 'v', type: 'uint8' },
        { internalType: 'bytes32', name: 'r', type: 'bytes32' },
        { internalType: 'bytes32', name: 's', type: 'bytes32' },
      ],
      name: 'removeLiquidityETHWithPermit',
      outputs: [
        { internalType: 'uint256', name: 'amountToken', type: 'uint256' },
        { internalType: 'uint256', name: 'amountETH', type: 'uint256' },
      ],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'address', name: 'token', type: 'address' },
        { internalType: 'uint256', name: 'liquidity', type: 'uint256' },
        { internalType: 'uint256', name: 'amountTokenMin', type: 'uint256' },
        { internalType: 'uint256', name: 'amountETHMin', type: 'uint256' },
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'deadline', type: 'uint256' },
        { internalType: 'bool', name: 'approveMax', type: 'bool' },
        { internalType: 'uint8', name: 'v', type: 'uint8' },
        { internalType: 'bytes32', name: 'r', type: 'bytes32' },
        { internalType: 'bytes32', name: 's', type: 'bytes32' },
      ],
      name: 'removeLiquidityETHWithPermitSupportingFeeOnTransferTokens',
      outputs: [{ internalType: 'uint256', name: 'amountETH', type: 'uint256' }],
      stateMutability: 'nonpayable',
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
        { internalType: 'bool', name: 'approveMax', type: 'bool' },
        { internalType: 'uint8', name: 'v', type: 'uint8' },
        { internalType: 'bytes32', name: 'r', type: 'bytes32' },
        { internalType: 'bytes32', name: 's', type: 'bytes32' },
      ],
      name: 'removeLiquidityWithPermit',
      outputs: [
        { internalType: 'uint256', name: 'amountA', type: 'uint256' },
        { internalType: 'uint256', name: 'amountB', type: 'uint256' },
      ],
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
      name: 'swapETHForExactTokens',
      outputs: [{ internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' }],
      stateMutability: 'payable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: 'amountOutMin', type: 'uint256' },
        { internalType: 'address[]', name: 'path', type: 'address[]' },
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'deadline', type: 'uint256' },
      ],
      name: 'swapExactETHForTokens',
      outputs: [{ internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' }],
      stateMutability: 'payable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: 'amountOutMin', type: 'uint256' },
        { internalType: 'address[]', name: 'path', type: 'address[]' },
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'deadline', type: 'uint256' },
      ],
      name: 'swapExactETHForTokensSupportingFeeOnTransferTokens',
      outputs: [],
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
      name: 'swapExactTokensForETH',
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
      name: 'swapExactTokensForETHSupportingFeeOnTransferTokens',
      outputs: [],
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
        { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
        { internalType: 'uint256', name: 'amountOutMin', type: 'uint256' },
        { internalType: 'address[]', name: 'path', type: 'address[]' },
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'deadline', type: 'uint256' },
      ],
      name: 'swapExactTokensForTokensSupportingFeeOnTransferTokens',
      outputs: [],
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
      name: 'swapTokensForExactETH',
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
    { stateMutability: 'payable', type: 'receive' },
  ],
};

/**
 * Pancakeswap V2 Pair ABI for liquidity operations
 */
export const IPancakeswapV2PairABI = {
  abi: [
    {
      inputs: [{ internalType: 'address', name: '_feeToSetter', type: 'address' }],
      payable: false,
      stateMutability: 'nonpayable',
      type: 'constructor',
    },
    {
      anonymous: false,
      inputs: [
        { indexed: true, internalType: 'address', name: 'token0', type: 'address' },
        { indexed: true, internalType: 'address', name: 'token1', type: 'address' },
        { indexed: false, internalType: 'address', name: 'pair', type: 'address' },
        { indexed: false, internalType: 'uint256', name: '', type: 'uint256' },
      ],
      name: 'PairCreated',
      type: 'event',
    },
    {
      constant: true,
      inputs: [],
      name: 'INIT_CODE_PAIR_HASH',
      outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: true,
      inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      name: 'allPairs',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: true,
      inputs: [],
      name: 'allPairsLength',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: false,
      inputs: [
        { internalType: 'address', name: 'tokenA', type: 'address' },
        { internalType: 'address', name: 'tokenB', type: 'address' },
      ],
      name: 'createPair',
      outputs: [{ internalType: 'address', name: 'pair', type: 'address' }],
      payable: false,
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      constant: true,
      inputs: [],
      name: 'feeTo',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: true,
      inputs: [],
      name: 'feeToSetter',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: true,
      inputs: [
        { internalType: 'address', name: '', type: 'address' },
        { internalType: 'address', name: '', type: 'address' },
      ],
      name: 'getPair',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: false,
      inputs: [{ internalType: 'address', name: '_feeTo', type: 'address' }],
      name: 'setFeeTo',
      outputs: [],
      payable: false,
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      constant: false,
      inputs: [{ internalType: 'address', name: '_feeToSetter', type: 'address' }],
      name: 'setFeeToSetter',
      outputs: [],
      payable: false,
      stateMutability: 'nonpayable',
      type: 'function',
    },
  ],
};

/**
 * Pancakeswap V3 Position Manager ABI for CLMM operations
 */
export const POSITION_MANAGER_ABI = [
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'positions',
    outputs: [
      { internalType: 'uint96', name: 'nonce', type: 'uint96' },
      { internalType: 'address', name: 'operator', type: 'address' },
      { internalType: 'address', name: 'token0', type: 'address' },
      { internalType: 'address', name: 'token1', type: 'address' },
      { internalType: 'uint24', name: 'fee', type: 'uint24' },
      { internalType: 'int24', name: 'tickLower', type: 'int24' },
      { internalType: 'int24', name: 'tickUpper', type: 'int24' },
      { internalType: 'uint128', name: 'liquidity', type: 'uint128' },
      {
        internalType: 'uint256',
        name: 'feeGrowthInside0LastX128',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'feeGrowthInside1LastX128',
        type: 'uint256',
      },
      { internalType: 'uint128', name: 'tokensOwed0', type: 'uint128' },
      { internalType: 'uint128', name: 'tokensOwed1', type: 'uint128' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];

/**
 * Pancakeswap V2 Factory ABI for pair operations
 */
export const IPancakeswapV2FactoryABI = {
  abi: [
    {
      constant: true,
      inputs: [
        { internalType: 'address', name: 'tokenA', type: 'address' },
        { internalType: 'address', name: 'tokenB', type: 'address' },
      ],
      name: 'getPair',
      outputs: [{ internalType: 'address', name: 'pair', type: 'address' }],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
  ],
};

/**
 * Standard ERC20 ABI for token operations
 */
export const ERC20_ABI = [
  {
    constant: false,
    inputs: [
      { name: '_spender', type: 'address' },
      { name: '_value', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
];
