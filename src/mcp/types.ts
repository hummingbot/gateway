// MCP type definitions for Gateway
export interface ChainInfo {
  chain: string;
  networks: string[];
}

export interface ConnectorInfo {
  name: string;
  trading_types: string[];
  chain: string;
  networks: string[];
}

export interface WalletInfo {
  address: string;
  chain: string;
  name: string;
}

export interface TokenInfo {
  symbol: string;
  address: string;
  decimals: number;
  name: string;
}

export interface SwapQuote {
  poolAddress: string;
  estimatedAmountIn: number;
  estimatedAmountOut: number;
  minAmountOut: number;
  maxAmountIn: number;
  baseTokenBalanceChange: number;
  quoteTokenBalanceChange: number;
  price: number;
  gasPrice?: number;
  gasLimit?: number;
  gasCost?: number;
  computeUnits?: number;
}

export interface PoolInfo {
  address: string;
  baseTokenAddress: string;
  quoteTokenAddress: string;
  feePct: number;
  price: number;
  baseTokenAmount: number;
  quoteTokenAmount: number;
  binStep?: number;
  activeBinId?: number;
  poolType?: string;
}

export interface GatewayConfig {
  url: string;
  timeout?: number;
}

export interface PromptArgument {
  name: string;
  description: string;
  required: boolean;
}

export interface Prompt {
  name: string;
  description: string;
  arguments?: PromptArgument[];
  instructions: string;
}
