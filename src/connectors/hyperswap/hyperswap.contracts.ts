import { Address } from 'viem';

export interface HyperswapContractAddresses {
  hyperswapV2RouterAddress: Address;
  hyperswapV2FactoryAddress: Address;
}

export interface NetworkContractAddresses {
  [network: string]: HyperswapContractAddresses;
}

export const contractAddresses: NetworkContractAddresses = {
  hyperevm: {
    // Source: https://docs.hyperswap.pro/technical-reference/contracts/deployment-addresses
    hyperswapV2FactoryAddress: '0x4df039804873717bff7d03694fb941cf0469b79e',
    hyperswapV2RouterAddress: '0xda0f518d521e0dE83fAdC8500C2D21b6a6C39bF9',
  },
};

export function getHyperswapV2RouterAddress(network: string): string {
  const address = contractAddresses[network]?.hyperswapV2RouterAddress;

  if (!address) {
    throw new Error(`Hyperswap V2 Router address not configured for network: ${network}`);
  }

  return address;
}

export function getHyperswapV2FactoryAddress(network: string): Address {
  const address = contractAddresses[network]?.hyperswapV2FactoryAddress;

  if (!address) {
    throw new Error(`Hyperswap V2 Factory address not configured for network: ${network}`);
  }

  return address;
}

export function getSpender(network: string, connectorName: string): string {
  if (connectorName.includes('/amm') || connectorName === 'hyperswap') {
    return getHyperswapV2RouterAddress(network);
  }

  throw new Error(`Unsupported Hyperswap connector type: ${connectorName}`);
}

export const IHyperswapV2Router02ABI = require('./hyperswap_v2_router_abi.json');

export const IHyperswapV2FactoryABI = {
  abi: [
    {
      inputs: [
        { internalType: 'address', name: 'tokenA', type: 'address' },
        { internalType: 'address', name: 'tokenB', type: 'address' },
      ],
      name: 'getPair',
      outputs: [{ internalType: 'address', name: 'pair', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
  ],
};

export const IHyperswapV2PairABI = {
  abi: [
    {
      inputs: [],
      name: 'getReserves',
      outputs: [
        { internalType: 'uint112', name: '_reserve0', type: 'uint112' },
        { internalType: 'uint112', name: '_reserve1', type: 'uint112' },
        { internalType: 'uint32', name: '_blockTimestampLast', type: 'uint32' },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'token0',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'token1',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
  ],
};
