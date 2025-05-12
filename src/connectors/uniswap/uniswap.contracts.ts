/**
 * Uniswap contract addresses for various networks
 * This file contains the contract addresses for Uniswap V2 and V3 contracts
 * on different networks. These are not meant to be edited by users.
 *
 * Last updated: May 2025
 * Source: https://docs.uniswap.org/contracts/v3/reference/deployments/
 */

export interface UniswapContractAddresses {
  // V2 contracts
  uniswapV2RouterAddress: string;
  uniswapV2FactoryAddress: string;

  // V3 contracts
  uniswapV3SmartOrderRouterAddress: string; // This refers to SwapRouter02
  uniswapV3NftManagerAddress: string;
  uniswapV3QuoterV2ContractAddress: string;
  uniswapV3FactoryAddress: string;
}

export interface NetworkContractAddresses {
  [network: string]: UniswapContractAddresses;
}

export const contractAddresses: NetworkContractAddresses = {
  mainnet: {
    // V2 contracts - Official Uniswap addresses
    uniswapV2RouterAddress: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    uniswapV2FactoryAddress: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    // V3 contracts - Official Uniswap addresses
    uniswapV3SmartOrderRouterAddress:
      '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', // SwapRouter02
    uniswapV3NftManagerAddress: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    uniswapV3QuoterV2ContractAddress:
      '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    uniswapV3FactoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  },
  arbitrum: {
    // V2 contracts - Official Uniswap addresses
    uniswapV2RouterAddress: '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24',
    uniswapV2FactoryAddress: '0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9',
    // V3 contracts - Official Uniswap addresses
    uniswapV3SmartOrderRouterAddress:
      '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', // SwapRouter02
    uniswapV3NftManagerAddress: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    uniswapV3QuoterV2ContractAddress:
      '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    uniswapV3FactoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  },
  optimism: {
    // V2 contracts - Official Uniswap addresses
    uniswapV2RouterAddress: '0x4A7b5Da61326A6379179b40d00F57E5bbDC962c2',
    uniswapV2FactoryAddress: '0x0c3c1c532F1e39EdF36BE9Fe0bE1410313E074Bf',
    // V3 contracts - Official Uniswap addresses
    uniswapV3SmartOrderRouterAddress:
      '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', // SwapRouter02
    uniswapV3NftManagerAddress: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    uniswapV3QuoterV2ContractAddress:
      '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    uniswapV3FactoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  },
  base: {
    // V2 contracts - Official Uniswap addresses
    uniswapV2RouterAddress: '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24',
    uniswapV2FactoryAddress: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
    // V3 contracts - Official Uniswap addresses
    uniswapV3SmartOrderRouterAddress:
      '0x2626664c2603336E57B271c5C0b26F421741e481', // SwapRouter02
    uniswapV3NftManagerAddress: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
    uniswapV3QuoterV2ContractAddress:
      '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
    uniswapV3FactoryAddress: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
  },
  sepolia: {
    // V2 contracts - Official Uniswap addresses for Sepolia testnet
    uniswapV2RouterAddress: '0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3',
    uniswapV2FactoryAddress: '0xF62c03E08ada871A0bEb309762E260a7a6a880E6',
    // V3 contracts - Note: Using mainnet addresses as fallback for Sepolia testnet
    uniswapV3SmartOrderRouterAddress:
      '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', // Default mainnet SwapRouter02
    uniswapV3NftManagerAddress: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88', // Default mainnet NonfungiblePositionManager
    uniswapV3QuoterV2ContractAddress:
      '0x61fFE014bA17989E743c5F6cB21bF9697530B21e', // Default mainnet QuoterV2
    uniswapV3FactoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984', // Default mainnet factory
  },
  bsc: {
    // V2 contracts - Official Uniswap addresses
    uniswapV2RouterAddress: '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24',
    uniswapV2FactoryAddress: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
    // V3 contracts - Official Uniswap addresses
    uniswapV3SmartOrderRouterAddress:
      '0xB971eF87ede563556b2ED4b1C0b0019111Dd85d2', // SwapRouter02
    uniswapV3NftManagerAddress: '0x7b8A01B39D58278b5DE7e48c8449c9f4F5170613',
    uniswapV3QuoterV2ContractAddress:
      '0x78D78E420Da98ad378D7799bE8f4AF69033EB077',
    uniswapV3FactoryAddress: '0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7',
  },
  avalanche: {
    // V2 contracts - Official Uniswap addresses
    uniswapV2RouterAddress: '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24',
    uniswapV2FactoryAddress: '0x9e5A52f57b3038F1B8EeE45F28b3C1967e22799C',
    // V3 contracts - Official Uniswap addresses
    uniswapV3SmartOrderRouterAddress:
      '0xbb00FF08d01D300023C629E8fFfFcb65A5a578cE', // SwapRouter02
    uniswapV3NftManagerAddress: '0x655C406EBFa14EE2006250925e54ec43AD184f8B',
    uniswapV3QuoterV2ContractAddress:
      '0xbe0F5544EC67e9B3b2D979aaA43f18Fd87E6257F',
    uniswapV3FactoryAddress: '0x740b1c1de25031C31FF4fC9A62f554A55cdC1baD',
  },
  celo: {
    // V2 contracts - No official Uniswap V2 deployment for Celo network
    uniswapV2RouterAddress: null, // Will use default from helper function
    uniswapV2FactoryAddress: null, // Will use default from helper function
    // V3 contracts - Official Uniswap addresses
    uniswapV3SmartOrderRouterAddress:
      '0x5615CDAb10dc425a742d643d949a7F474C01abc4', // SwapRouter02
    uniswapV3NftManagerAddress: '0x3d79EdAaBC0EaB6F08ED885C05Fc0B014290D95A',
    uniswapV3QuoterV2ContractAddress:
      '0x82825d0554fA07f7FC52Ab63c961F330fdEFa8E8',
    uniswapV3FactoryAddress: '0xAfE208a311B21f13EF87E33A90049fC17A7acDEc',
  },
  polygon: {
    // V2 contracts - Official Uniswap addresses
    uniswapV2RouterAddress: '0xedf6066a2b290C185783862C7F4776A2C8077AD1',
    uniswapV2FactoryAddress: '0x9e5A52f57b3038F1B8EeE45F28b3C1967e22799C',
    // V3 contracts - Official Uniswap addresses
    uniswapV3SmartOrderRouterAddress:
      '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', // SwapRouter02
    uniswapV3NftManagerAddress: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    uniswapV3QuoterV2ContractAddress:
      '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    uniswapV3FactoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  },
  blast: {
    // V2 contracts - Official Uniswap addresses
    uniswapV2RouterAddress: '0xBB66Eb1c5e875933D44DAe661dbD80e5D9B03035',
    uniswapV2FactoryAddress: '0x5C346464d33F90bABaf70dB6388507CC889C1070',
    // V3 contracts - Using Ethereum mainnet addresses as fallback
    uniswapV3SmartOrderRouterAddress:
      '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', // Default mainnet SwapRouter02
    uniswapV3NftManagerAddress: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88', // Default mainnet NonfungiblePositionManager
    uniswapV3QuoterV2ContractAddress:
      '0x61fFE014bA17989E743c5F6cB21bF9697530B21e', // Default mainnet QuoterV2
    uniswapV3FactoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984', // Default mainnet factory
  },
  zora: {
    // V2 contracts - Official Uniswap addresses
    uniswapV2RouterAddress: '0xa00F34A632630EFd15223B1968358bA4845bEEC7',
    uniswapV2FactoryAddress: '0x0F797dC7efaEA995bB916f268D919d0a1950eE3C',
    // V3 contracts - Using Ethereum mainnet addresses as fallback
    uniswapV3SmartOrderRouterAddress:
      '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', // Default mainnet SwapRouter02
    uniswapV3NftManagerAddress: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88', // Default mainnet NonfungiblePositionManager
    uniswapV3QuoterV2ContractAddress:
      '0x61fFE014bA17989E743c5F6cB21bF9697530B21e', // Default mainnet QuoterV2
    uniswapV3FactoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984', // Default mainnet factory
  },
  worldchain: {
    // V2 contracts - Official Uniswap addresses
    uniswapV2RouterAddress: '0x541aB7c31A119441eF3575F6973277DE0eF460bd',
    uniswapV2FactoryAddress: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    // V3 contracts - Using Ethereum mainnet addresses as fallback
    uniswapV3SmartOrderRouterAddress:
      '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', // Default mainnet SwapRouter02
    uniswapV3NftManagerAddress: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88', // Default mainnet NonfungiblePositionManager
    uniswapV3QuoterV2ContractAddress:
      '0x61fFE014bA17989E743c5F6cB21bF9697530B21e', // Default mainnet QuoterV2
    uniswapV3FactoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984', // Default mainnet factory
  },
};

/**
 * Helper functions to get contract addresses
 */

export function getUniswapV2RouterAddress(network: string): string {
  const address = contractAddresses[network]?.uniswapV2RouterAddress;

  if (address === null) {
    throw new Error(
      `Uniswap V2 is not deployed on ${network} network. Please use Uniswap V3 for this network.`,
    );
  }

  if (!address) {
    throw new Error(
      `Uniswap V2 Router address not configured for network: ${network}`,
    );
  }

  return address;
}

export function getUniswapV2FactoryAddress(network: string): string {
  const address = contractAddresses[network]?.uniswapV2FactoryAddress;

  if (address === null) {
    throw new Error(
      `Uniswap V2 is not deployed on ${network} network. Please use Uniswap V3 for this network.`,
    );
  }

  if (!address) {
    throw new Error(
      `Uniswap V2 Factory address not configured for network: ${network}`,
    );
  }

  return address;
}

export function getUniswapV3SmartOrderRouterAddress(network: string): string {
  const address = contractAddresses[network]?.uniswapV3SmartOrderRouterAddress;

  if (!address) {
    throw new Error(
      `Uniswap V3 Smart Order Router address not configured for network: ${network}`,
    );
  }

  return address;
}

export function getUniswapV3NftManagerAddress(network: string): string {
  const address = contractAddresses[network]?.uniswapV3NftManagerAddress;

  if (!address) {
    throw new Error(
      `Uniswap V3 NFT Manager address not configured for network: ${network}`,
    );
  }

  return address;
}

export function getUniswapV3QuoterV2ContractAddress(network: string): string {
  const address = contractAddresses[network]?.uniswapV3QuoterV2ContractAddress;

  if (!address) {
    throw new Error(
      `Uniswap V3 Quoter V2 contract address not configured for network: ${network}`,
    );
  }

  return address;
}

export function getUniswapV3FactoryAddress(network: string): string {
  const address = contractAddresses[network]?.uniswapV3FactoryAddress;

  if (!address) {
    throw new Error(
      `Uniswap V3 Factory address not configured for network: ${network}`,
    );
  }

  return address;
}

/**
 * Returns the appropriate spender address based on the connector name
 * @param network The network name (e.g. 'mainnet', 'base')
 * @param connectorName The connector name (uniswap/clmm, uniswap/amm, uniswap)
 * @returns The address of the contract that should be approved to spend tokens
 */
export function getSpender(network: string, connectorName: string): string {
  // Check for AMM (V2) connector pattern
  if (connectorName.includes('/amm')) {
    return getUniswapV2RouterAddress(network);
  }

  // Check for CLMM (V3) connector pattern
  if (connectorName.includes('/clmm')) {
    return getUniswapV3NftManagerAddress(network);
  }

  // For regular uniswap connector or any other case, use the V3 Smart Order Router
  return getUniswapV3SmartOrderRouterAddress(network);
}

/**
 * ABI Definitions for Uniswap contracts
 */

/**
 * Uniswap V2 Router ABI for swap methods
 */
export const IUniswapV2Router02ABI = {
  abi: [
    // Router methods for swapping
    {
      inputs: [
        { internalType: 'uint256', name: 'amountOutMin', type: 'uint256' },
        { internalType: 'address[]', name: 'path', type: 'address[]' },
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'deadline', type: 'uint256' },
      ],
      name: 'swapExactETHForTokens',
      outputs: [
        { internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' },
      ],
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
      outputs: [
        { internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' },
      ],
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
      outputs: [
        { internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' },
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
      outputs: [
        { internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' },
      ],
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
      name: 'swapTokensForExactETH',
      outputs: [
        { internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' },
      ],
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
      outputs: [
        { internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' },
      ],
      stateMutability: 'nonpayable',
      type: 'function',
    },
  ],
};
