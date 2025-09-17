/**
 * Pool types and interfaces
 */

export interface Pool {
  type: 'amm' | 'clmm';
  network: string;
  baseSymbol: string;
  quoteSymbol: string;
  address: string;
}

export type PoolFileFormat = Pool[];

export enum SupportedConnector {
  RAYDIUM = 'raydium',
  METEORA = 'meteora',
  UNISWAP = 'uniswap',
  PANCAKESWAP = 'pancakeswap',
  ZEROX = '0x',
  JUPITER = 'jupiter',
}

export function isSupportedConnector(connector: string): connector is SupportedConnector {
  return Object.values(SupportedConnector).includes(connector as SupportedConnector);
}

export interface PoolListRequest {
  connector: string;
  network?: string;
  type?: 'amm' | 'clmm';
  search?: string;
}

export interface PoolAddRequest {
  connector: string;
  type: 'amm' | 'clmm';
  network: string;
  baseSymbol: string;
  quoteSymbol: string;
  address: string;
}
