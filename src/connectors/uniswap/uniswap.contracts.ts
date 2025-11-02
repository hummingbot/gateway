/**
 * Uniswap contract addresses for various networks
 * This file contains the contract addresses for Uniswap V2, V3, V4, and Universal Router contracts
 * on different networks. These are not meant to be edited by users.
 *
 * Last updated: January 2025
 * Sources:
 * - V3: https://docs.uniswap.org/contracts/v3/reference/deployments/
 * - V4: https://docs.uniswap.org/contracts/v4/deployments
 * - Universal Router: https://github.com/Uniswap/universal-router/tree/main/deploy-addresses
 */

export interface UniswapContractAddresses {
  // V2 contracts
  uniswapV2RouterAddress: string;
  uniswapV2FactoryAddress: string;

  // V3 contracts
  uniswapV3SwapRouter02Address: string; // SwapRouter02 for V3 direct swaps
  uniswapV3NftManagerAddress: string;
  uniswapV3QuoterV2ContractAddress: string;
  uniswapV3FactoryAddress: string;

  // Universal Router V2 (unified router for all protocols)
  universalRouterV2Address: string;

  // V4 contracts
  uniswapV4PoolManagerAddress?: string;
  uniswapV4StateViewAddress?: string;
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
    uniswapV3SwapRouter02Address: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    uniswapV3NftManagerAddress: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    uniswapV3QuoterV2ContractAddress: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    uniswapV3FactoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    // Universal Router V2 - Official Uniswap address
    universalRouterV2Address: '0x66a9893cc07d91d95644aedd05d03f95e1dba8af',
    // V4 contracts - Official Uniswap addresses
    uniswapV4PoolManagerAddress: '0x000000000004444c5dc75cB358380D2e3dE08A90',
    uniswapV4StateViewAddress: '0x7ffe42c4a5deea5b0fec41c94c136cf115597227',
  },
  arbitrum: {
    // V2 contracts - Official Uniswap addresses
    uniswapV2RouterAddress: '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24',
    uniswapV2FactoryAddress: '0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9',
    // V3 contracts - Official Uniswap addresses
    uniswapV3SwapRouter02Address: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    uniswapV3NftManagerAddress: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    uniswapV3QuoterV2ContractAddress: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    uniswapV3FactoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    // Universal Router V2 - Official Uniswap address
    universalRouterV2Address: '0xa51afafe0263b40edaef0df8781ea9aa03e381a3',
    // V4 contracts - Official Uniswap addresses
    uniswapV4PoolManagerAddress: '0x360e68faccca8ca495c1b759fd9eee466db9fb32',
    uniswapV4StateViewAddress: '0x76fd297e2d437cd7f76d50f01afe6160f86e9990',
  },
  optimism: {
    // V2 contracts - Official Uniswap addresses
    uniswapV2RouterAddress: '0x4A7b5Da61326A6379179b40d00F57E5bbDC962c2',
    uniswapV2FactoryAddress: '0x0c3c1c532F1e39EdF36BE9Fe0bE1410313E074Bf',
    // V3 contracts - Official Uniswap addresses
    uniswapV3SwapRouter02Address: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    uniswapV3NftManagerAddress: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    uniswapV3QuoterV2ContractAddress: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    uniswapV3FactoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    // Universal Router V2 - Official Uniswap address
    universalRouterV2Address: '0x851116d9223fabed8e56c0e6b8ad0c31d98b3507',
    // V4 contracts - Official Uniswap addresses
    uniswapV4PoolManagerAddress: '0x9a13f98cb987694c9f086b1f5eb990eea8264ec3',
    uniswapV4StateViewAddress: '0xc18a3169788f4f75a170290584eca6395c75ecdb',
  },
  base: {
    // V2 contracts - Official Uniswap addresses
    uniswapV2RouterAddress: '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24',
    uniswapV2FactoryAddress: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
    // V3 contracts - Official Uniswap addresses
    uniswapV3SwapRouter02Address: '0x2626664c2603336E57B271c5C0b26F421741e481',
    uniswapV3NftManagerAddress: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
    uniswapV3QuoterV2ContractAddress: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
    uniswapV3FactoryAddress: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    // Universal Router V2 - Official Uniswap address
    universalRouterV2Address: '0x6ff5693b99212da76ad316178a184ab56d299b43',
    // V4 contracts - Official Uniswap addresses
    uniswapV4PoolManagerAddress: '0x498581ff718922c3f8e6a244956af099b2652b2b',
    uniswapV4StateViewAddress: '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71',
  },
  sepolia: {
    // V2 contracts - Official Uniswap addresses for Sepolia testnet
    uniswapV2RouterAddress: '0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3',
    uniswapV2FactoryAddress: '0xF62c03E08ada871A0bEb309762E260a7a6a880E6',
    // V3 contracts - Official Uniswap addresses for Sepolia testnet
    uniswapV3SwapRouter02Address: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
    uniswapV3NftManagerAddress: '0x1238536071E1c677A632429e3655c799b22cDA52',
    uniswapV3QuoterV2ContractAddress: '0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3',
    uniswapV3FactoryAddress: '0x0227628f3F023bb0B980b67D528571c95c6DaC1c',
    // Universal Router V2 - Official Uniswap address for Sepolia
    universalRouterV2Address: '0x3a9d48ab9751398bbfa63ad67599bb04e4bdf98b',
  },
  bsc: {
    // V2 contracts - Official Uniswap addresses
    uniswapV2RouterAddress: '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24',
    uniswapV2FactoryAddress: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
    // V3 contracts - Official Uniswap addresses
    uniswapV3SwapRouter02Address: '0xB971eF87ede563556b2ED4b1C0b0019111Dd85d2',
    uniswapV3NftManagerAddress: '0x7b8A01B39D58278b5DE7e48c8449c9f4F5170613',
    uniswapV3QuoterV2ContractAddress: '0x78D78E420Da98ad378D7799bE8f4AF69033EB077',
    uniswapV3FactoryAddress: '0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7',
    // Universal Router V2 - Official Uniswap address
    universalRouterV2Address: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
  },
  avalanche: {
    // V2 contracts - Official Uniswap addresses
    uniswapV2RouterAddress: '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24',
    uniswapV2FactoryAddress: '0x9e5A52f57b3038F1B8EeE45F28b3C1967e22799C',
    // V3 contracts - Official Uniswap addresses
    uniswapV3SwapRouter02Address: '0xbb00FF08d01D300023C629E8fFfFcb65A5a578cE',
    uniswapV3NftManagerAddress: '0x655C406EBFa14EE2006250925e54ec43AD184f8B',
    uniswapV3QuoterV2ContractAddress: '0xbe0F5544EC67e9B3b2D979aaA43f18Fd87E6257F',
    uniswapV3FactoryAddress: '0x740b1c1de25031C31FF4fC9A62f554A55cdC1baD',
    // Universal Router V2 - Official Uniswap address
    universalRouterV2Address: '0x94b75331ae8d42c1b61065089b7d48fe14aa73b7',
  },
  celo: {
    // V2 contracts - No official Uniswap V2 deployment for Celo network
    uniswapV2RouterAddress: null, // Will use default from helper function
    uniswapV2FactoryAddress: null, // Will use default from helper function
    // V3 contracts - Official Uniswap addresses
    uniswapV3SwapRouter02Address: '0x5615CDAb10dc425a742d643d949a7F474C01abc4',
    uniswapV3NftManagerAddress: '0x3d79EdAaBC0EaB6F08ED885C05Fc0B014290D95A',
    uniswapV3QuoterV2ContractAddress: '0x82825d0554fA07f7FC52Ab63c961F330fdEFa8E8',
    uniswapV3FactoryAddress: '0xAfE208a311B21f13EF87E33A90049fC17A7acDEc',
    // Universal Router V2 - Official Uniswap address
    universalRouterV2Address: '0x643770e279d5d0733f21d6dc03a8efbabf3255b4',
  },
  polygon: {
    // V2 contracts - Official Uniswap addresses
    uniswapV2RouterAddress: '0xedf6066a2b290C185783862C7F4776A2C8077AD1',
    uniswapV2FactoryAddress: '0x9e5A52f57b3038F1B8EeE45F28b3C1967e22799C',
    // V3 contracts - Official Uniswap addresses
    uniswapV3SwapRouter02Address: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    uniswapV3NftManagerAddress: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    uniswapV3QuoterV2ContractAddress: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    uniswapV3FactoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    // Universal Router V2 - Official Uniswap address
    universalRouterV2Address: '0x1095692a6237d83c6a72f3f5efedb9a670c49223',
    // V4 contracts - Official Uniswap addresses
    uniswapV4PoolManagerAddress: '0x67366782805870060151383f4bbff9dab53e5cd6',
    uniswapV4StateViewAddress: '0x5ea1bd7974c8a611cbab0bdcafcb1d9cc9b3ba5a',
  },
  blast: {
    // V2 contracts - Official Uniswap addresses
    uniswapV2RouterAddress: '0x44889b52b71E60De6ed7dE82E2939fcc52fB2B4E',
    uniswapV2FactoryAddress: '0x5C346464d33F90bABaf70dB6388507CC889C1070',
    // V3 contracts - Official Uniswap addresses
    uniswapV3SwapRouter02Address: '0x549FEB8c9bd4c12Ad2AB27022dA12492aC452B66',
    uniswapV3NftManagerAddress: '0xB218e4f7cF0533d4696fDfC419A0023D33345F28',
    uniswapV3QuoterV2ContractAddress: '0x6Cdcd65e03c1CEc3730AeeCd45bc140D57A25C77',
    uniswapV3FactoryAddress: '0x792edAdE80af5fC680d96a2eD80A44247D2Cf6Fd',
    // Universal Router V2 - Official Uniswap address
    universalRouterV2Address: '0xeabbcb3e8e415306207ef514f660a3f820025be3',
    // V4 contracts - Official Uniswap addresses
    uniswapV4PoolManagerAddress: '0xbb39d4eca714e8058c4b09d45f53df68a1502285',
    uniswapV4StateViewAddress: '0xa7dd9240eee60f0302f14c5f3f26ddfda43e0743',
  },
  zora: {
    // V2 contracts - No official Uniswap V2 deployment for Zora network
    uniswapV2RouterAddress: null,
    uniswapV2FactoryAddress: null,
    // V3 contracts - Official Uniswap addresses
    uniswapV3SwapRouter02Address: '0x7De04c96BE5159c3b5CeffC82aa176dc81281557',
    uniswapV3NftManagerAddress: '0xbC91e8DfA3fF18De43853372A3d7dfe585137D78',
    uniswapV3QuoterV2ContractAddress: '0x11867e1b3348F3ce4FcC170BC5af3d23E07E64Df',
    uniswapV3FactoryAddress: '0x7145F8aeef1f6510E92164038E1B6F8cB2c42Cbb',
    // Universal Router V2 - Official Uniswap address
    universalRouterV2Address: '0x3315ef7ca28db74abadc6c44570efdf06b04b020',
  },
  worldchain: {
    // V2 contracts - No official Uniswap V2 deployment for Worldchain network
    uniswapV2RouterAddress: null,
    uniswapV2FactoryAddress: null,
    // V3 contracts - Official Uniswap addresses
    uniswapV3SwapRouter02Address: '0x091AD9e2e6e5eD44c1c66dB50e49A601F9f36cF6',
    uniswapV3NftManagerAddress: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    uniswapV3QuoterV2ContractAddress: '0x4e0c6e1fF9ee77eC10D2E43baCe225aB37276369',
    uniswapV3FactoryAddress: '0x7a5028BDa40e7B173C278C5342087826455ea25a',
    // Universal Router V2 - Official Uniswap address
    universalRouterV2Address: '0x8ac7bee993bb44dab564ea4bc9ea67bf9eb5e743',
  },
};

/**
 * Helper functions to get contract addresses
 */

export function getUniswapV2RouterAddress(network: string): string {
  const address = contractAddresses[network]?.uniswapV2RouterAddress;

  if (address === null) {
    throw new Error(`Uniswap V2 is not deployed on ${network} network. Please use Uniswap V3 for this network.`);
  }

  if (!address) {
    throw new Error(`Uniswap V2 Router address not configured for network: ${network}`);
  }

  return address;
}

export function getUniswapV2FactoryAddress(network: string): string {
  const address = contractAddresses[network]?.uniswapV2FactoryAddress;

  if (address === null) {
    throw new Error(`Uniswap V2 is not deployed on ${network} network. Please use Uniswap V3 for this network.`);
  }

  if (!address) {
    throw new Error(`Uniswap V2 Factory address not configured for network: ${network}`);
  }

  return address;
}

export function getUniswapV3SwapRouter02Address(network: string): string {
  const address = contractAddresses[network]?.uniswapV3SwapRouter02Address;

  if (!address) {
    throw new Error(`Uniswap V3 SwapRouter02 address not configured for network: ${network}`);
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

export function getUniswapV3NftManagerAddress(network: string): string {
  const address = contractAddresses[network]?.uniswapV3NftManagerAddress;

  if (!address) {
    throw new Error(`Uniswap V3 NFT Manager address not configured for network: ${network}`);
  }

  return address;
}

export function getUniswapV3QuoterV2ContractAddress(network: string): string {
  const address = contractAddresses[network]?.uniswapV3QuoterV2ContractAddress;

  if (!address) {
    throw new Error(`Uniswap V3 Quoter V2 contract address not configured for network: ${network}`);
  }

  return address;
}

export function getUniswapV3FactoryAddress(network: string): string {
  const address = contractAddresses[network]?.uniswapV3FactoryAddress;

  if (!address) {
    throw new Error(`Uniswap V3 Factory address not configured for network: ${network}`);
  }

  return address;
}

export function getUniswapV4PoolManagerAddress(network: string): string {
  const address = contractAddresses[network]?.uniswapV4PoolManagerAddress;

  if (!address) {
    throw new Error(`Uniswap V4 Pool Manager address not configured for network: ${network}`);
  }

  return address;
}

export function getUniswapV4StateViewAddress(network: string): string {
  const address = contractAddresses[network]?.uniswapV4StateViewAddress;

  if (!address) {
    throw new Error(`Uniswap V4 StateView address not configured for network: ${network}`);
  }

  return address;
}

/**
 * Returns the appropriate spender address based on the connector name
 * @param network The network name (e.g. 'mainnet', 'base')
 * @param connectorName The connector name (uniswap/clmm, uniswap/amm, uniswap/router, uniswap)
 * @returns The address of the contract that should be approved to spend tokens
 */
export function getSpender(network: string, connectorName: string): string {
  // Check for AMM (V2) connector pattern
  if (connectorName.includes('/amm')) {
    return getUniswapV2RouterAddress(network);
  }

  // Check for CLMM swap-specific pattern - use SwapRouter02
  if (connectorName.includes('/clmm/swap')) {
    return getUniswapV3SwapRouter02Address(network);
  }

  // Check for CLMM (V3) connector pattern
  if (connectorName.includes('/clmm')) {
    return getUniswapV3NftManagerAddress(network);
  }

  // For router connector pattern or regular uniswap connector, use Universal Router V2
  if (connectorName.includes('/router') || connectorName === 'uniswap') {
    return getUniversalRouterV2Address(network);
  }

  // Default to Universal Router V2 for any other case
  return getUniversalRouterV2Address(network);
}

/**
 * ABI Definitions for Uniswap contracts
 */

/**
 * Uniswap V3 QuoterV2 ABI for quote methods
 */
export const IQuoterV2ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'tokenIn', type: 'address' },
      { internalType: 'address', name: 'tokenOut', type: 'address' },
      { internalType: 'uint24', name: 'fee', type: 'uint24' },
      { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
      { internalType: 'uint160', name: 'sqrtPriceLimitX96', type: 'uint160' },
    ],
    name: 'quoteExactInputSingle',
    outputs: [
      { internalType: 'uint256', name: 'amountOut', type: 'uint256' },
      { internalType: 'uint160', name: 'sqrtPriceX96After', type: 'uint160' },
      {
        internalType: 'uint32',
        name: 'initializedTicksCrossed',
        type: 'uint32',
      },
      { internalType: 'uint256', name: 'gasEstimate', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'tokenIn', type: 'address' },
      { internalType: 'address', name: 'tokenOut', type: 'address' },
      { internalType: 'uint24', name: 'fee', type: 'uint24' },
      { internalType: 'uint256', name: 'amountOut', type: 'uint256' },
      { internalType: 'uint160', name: 'sqrtPriceLimitX96', type: 'uint160' },
    ],
    name: 'quoteExactOutputSingle',
    outputs: [
      { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
      { internalType: 'uint160', name: 'sqrtPriceX96After', type: 'uint160' },
      {
        internalType: 'uint32',
        name: 'initializedTicksCrossed',
        type: 'uint32',
      },
      { internalType: 'uint256', name: 'gasEstimate', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

/**
 * Uniswap V3 SwapRouter02 ABI for swap methods
 */
export const ISwapRouter02ABI = [
  {
    inputs: [
      {
        components: [
          { internalType: 'address', name: 'tokenIn', type: 'address' },
          { internalType: 'address', name: 'tokenOut', type: 'address' },
          { internalType: 'uint24', name: 'fee', type: 'uint24' },
          { internalType: 'address', name: 'recipient', type: 'address' },
          { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
          {
            internalType: 'uint256',
            name: 'amountOutMinimum',
            type: 'uint256',
          },
          {
            internalType: 'uint160',
            name: 'sqrtPriceLimitX96',
            type: 'uint160',
          },
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
      {
        components: [
          { internalType: 'address', name: 'tokenIn', type: 'address' },
          { internalType: 'address', name: 'tokenOut', type: 'address' },
          { internalType: 'uint24', name: 'fee', type: 'uint24' },
          { internalType: 'address', name: 'recipient', type: 'address' },
          { internalType: 'uint256', name: 'amountOut', type: 'uint256' },
          { internalType: 'uint256', name: 'amountInMaximum', type: 'uint256' },
          {
            internalType: 'uint160',
            name: 'sqrtPriceLimitX96',
            type: 'uint160',
          },
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
];

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
      name: 'swapETHForExactTokens',
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
  ],
};

/**
 * Uniswap V2 Pair ABI for liquidity operations
 */
export const IUniswapV2PairABI = {
  abi: [
    {
      constant: true,
      inputs: [],
      name: 'getReserves',
      outputs: [
        { internalType: 'uint112', name: '_reserve0', type: 'uint112' },
        { internalType: 'uint112', name: '_reserve1', type: 'uint112' },
        { internalType: 'uint32', name: '_blockTimestampLast', type: 'uint32' },
      ],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: true,
      inputs: [],
      name: 'token0',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: true,
      inputs: [],
      name: 'token1',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: true,
      inputs: [{ internalType: 'address', name: 'owner', type: 'address' }],
      name: 'balanceOf',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: true,
      inputs: [],
      name: 'totalSupply',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: false,
      inputs: [
        { internalType: 'address', name: 'spender', type: 'address' },
        { internalType: 'uint256', name: 'value', type: 'uint256' },
      ],
      name: 'approve',
      outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
      payable: false,
      stateMutability: 'nonpayable',
      type: 'function',
    },
  ],
};

/**
 * Uniswap V3 Position Manager ABI for CLMM operations
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
 * Uniswap V2 Factory ABI for pair operations
 */
export const IUniswapV2FactoryABI = {
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
 * Uniswap V4 StateView ABI for querying pool state
 */
export const IStateViewABI = [
  {
    inputs: [
      {
        components: [
          { internalType: 'Currency', name: 'currency0', type: 'address' },
          { internalType: 'Currency', name: 'currency1', type: 'address' },
          { internalType: 'uint24', name: 'fee', type: 'uint24' },
          { internalType: 'int24', name: 'tickSpacing', type: 'int24' },
          { internalType: 'contract IHooks', name: 'hooks', type: 'address' },
        ],
        internalType: 'struct PoolKey',
        name: 'key',
        type: 'tuple',
      },
    ],
    name: 'getSlot0',
    outputs: [
      { internalType: 'uint160', name: 'sqrtPriceX96', type: 'uint160' },
      { internalType: 'int24', name: 'tick', type: 'int24' },
      { internalType: 'uint24', name: 'protocolFee', type: 'uint24' },
      { internalType: 'uint24', name: 'lpFee', type: 'uint24' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          { internalType: 'Currency', name: 'currency0', type: 'address' },
          { internalType: 'Currency', name: 'currency1', type: 'address' },
          { internalType: 'uint24', name: 'fee', type: 'uint24' },
          { internalType: 'int24', name: 'tickSpacing', type: 'int24' },
          { internalType: 'contract IHooks', name: 'hooks', type: 'address' },
        ],
        internalType: 'struct PoolKey',
        name: 'key',
        type: 'tuple',
      },
    ],
    name: 'getLiquidity',
    outputs: [{ internalType: 'uint128', name: '', type: 'uint128' }],
    stateMutability: 'view',
    type: 'function',
  },
];

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
