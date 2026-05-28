import { Type, Static } from '@sinclair/typebox';

import { getEthereumChainConfig } from '../../chains/ethereum/ethereum.config';

import { PancakeswapConfig } from './pancakeswap.config';

// Get chain config for defaults
const ethereumChainConfig = getEthereumChainConfig();

// Constants for examples
const BASE_TOKEN = 'USDT';
const QUOTE_TOKEN = 'WBNB';
const SWAP_AMOUNT = 10;
const AMM_POOL_ADDRESS_EXAMPLE = '0x88A43bbDF9D098eEC7bCEda4e2494615dfD9bB9C'; // Pancakeswap V2 WETH-USDC pool on Base
const CLMM_POOL_ADDRESS_EXAMPLE = '0x172fcd41e0913e95784454622d1c3724f546f849'; // Pancakeswap V3 USDT-WBNB pool on BSC

// ========================================
// AMM Request Schemas
// ========================================

export const PancakeswapAmmGetPoolInfoRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'The EVM network to use',
      default: ethereumChainConfig.defaultNetwork,
      enum: [...PancakeswapConfig.networks],
    }),
  ),
  poolAddress: Type.String({
    description: 'Pancakeswap V2 pool address',
    examples: [AMM_POOL_ADDRESS_EXAMPLE],
  }),
});

// ========================================
// CLMM Request Schemas
// ========================================

export const PancakeswapClmmGetPoolInfoRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'The EVM network to use',
      default: 'bsc',
      examples: ['bsc'],
      enum: [...PancakeswapConfig.networks],
    }),
  ),
  poolAddress: Type.String({
    description: 'Pancakeswap V3 pool address',
    examples: [CLMM_POOL_ADDRESS_EXAMPLE],
  }),
  binCount: Type.Optional(
    Type.Integer({
      description:
        'If > 0, include a `bins` array (per-tickSpacing token amounts around the current tick). ' +
        'Default 0 — pool-info skips the extra eth_call.',
      default: 0,
      minimum: 0,
      maximum: 401,
    }),
  ),
});
export type PancakeswapClmmGetPoolInfoRequestType = Static<typeof PancakeswapClmmGetPoolInfoRequest>;

// ========================================
// Router Request Schemas
// ========================================

// Pancakeswap-specific quote-swap request
export const PancakeswapQuoteSwapRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'The EVM network to use',
      default: ethereumChainConfig.defaultNetwork,
      enum: [...PancakeswapConfig.networks],
    }),
  ),
  baseToken: Type.String({
    description: 'First token in the trading pair',
    examples: [BASE_TOKEN],
  }),
  quoteToken: Type.String({
    description: 'Second token in the trading pair',
    examples: [QUOTE_TOKEN],
  }),
  amount: Type.Number({
    description: 'Amount of base token to trade',
    examples: [SWAP_AMOUNT],
  }),
  side: Type.String({
    description:
      'Trade direction - BUY means buying base token with quote token, SELL means selling base token for quote token',
    enum: ['BUY', 'SELL'],
  }),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      default: PancakeswapConfig.config.slippagePct,
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Wallet address for more accurate quotes (optional)',
      default: ethereumChainConfig.defaultWallet,
    }),
  ),
});

// Pancakeswap-specific quote-swap response
export const PancakeswapQuoteSwapResponse = Type.Object({
  quoteId: Type.String({
    description: 'Unique identifier for this quote',
  }),
  tokenIn: Type.String({
    description: 'Address of the token being swapped from',
  }),
  tokenOut: Type.String({
    description: 'Address of the token being swapped to',
  }),
  amountIn: Type.Number({
    description: 'Amount of tokenIn to be swapped',
  }),
  amountOut: Type.Number({
    description: 'Expected amount of tokenOut to receive',
  }),
  price: Type.Number({
    description: 'Exchange rate between tokenIn and tokenOut',
  }),
  priceImpactPct: Type.Number({
    description: 'Estimated price impact percentage (0-100)',
  }),
  minAmountOut: Type.Number({
    description: 'Minimum amount of tokenOut that will be accepted',
  }),
  maxAmountIn: Type.Number({
    description: 'Maximum amount of tokenIn that will be spent',
  }),
  routePath: Type.Optional(
    Type.String({
      description: 'Human-readable route path',
    }),
  ),
});

// Pancakeswap-specific execute-quote request
export const PancakeswapExecuteQuoteRequest = Type.Object({
  walletAddress: Type.Optional(
    Type.String({
      description: 'Wallet address that will execute the swap',
      default: ethereumChainConfig.defaultWallet,
      examples: [ethereumChainConfig.defaultWallet],
    }),
  ),
  network: Type.Optional(
    Type.String({
      description: 'The blockchain network to use',
      default: ethereumChainConfig.defaultNetwork,
      enum: [...PancakeswapConfig.networks],
    }),
  ),
  quoteId: Type.String({
    description: 'ID of the quote to execute',
    examples: ['123e4567-e89b-12d3-a456-426614174000'],
  }),
});

// Pancakeswap AMM Add Liquidity Request
export const PancakeswapAmmAddLiquidityRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'The EVM network to use',
      default: ethereumChainConfig.defaultNetwork,
      enum: [...PancakeswapConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Wallet address that will add liquidity',
      default: ethereumChainConfig.defaultWallet,
    }),
  ),
  poolAddress: Type.String({
    description: 'Address of the Pancakeswap V2 pool',
  }),
  baseTokenAmount: Type.Number({
    description: 'Amount of base token to add',
  }),
  quoteTokenAmount: Type.Number({
    description: 'Amount of quote token to add',
  }),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      default: PancakeswapConfig.config.slippagePct,
    }),
  ),
  gasPrice: Type.Optional(
    Type.String({
      description: 'Gas price in wei for the transaction',
    }),
  ),
  maxGas: Type.Optional(
    Type.Number({
      description: 'Maximum gas limit for the transaction',
      examples: [300000],
    }),
  ),
});

// Pancakeswap AMM Remove Liquidity Request
export const PancakeswapAmmRemoveLiquidityRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'The EVM network to use',
      default: ethereumChainConfig.defaultNetwork,
      enum: [...PancakeswapConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Wallet address that will remove liquidity',
      default: ethereumChainConfig.defaultWallet,
    }),
  ),
  poolAddress: Type.String({
    description: 'Address of the Pancakeswap V2 pool',
  }),
  percentageToRemove: Type.Number({
    minimum: 0,
    maximum: 100,
    description: 'Percentage of liquidity to remove',
  }),
  gasPrice: Type.Optional(
    Type.String({
      description: 'Gas price in wei for the transaction',
    }),
  ),
  maxGas: Type.Optional(
    Type.Number({
      description: 'Maximum gas limit for the transaction',
      examples: [300000],
    }),
  ),
});

// Pancakeswap AMM Execute Swap Request
export const PancakeswapAmmExecuteSwapRequest = Type.Object({
  walletAddress: Type.Optional(
    Type.String({
      description: 'Wallet address that will execute the swap',
      default: ethereumChainConfig.defaultWallet,
    }),
  ),
  network: Type.Optional(
    Type.String({
      description: 'The EVM network to use',
      default: ethereumChainConfig.defaultNetwork,
      enum: [...PancakeswapConfig.networks],
    }),
  ),
  poolAddress: Type.Optional(
    Type.String({
      description: 'Pool address (optional - can be looked up from tokens)',
      default: '',
    }),
  ),
  baseToken: Type.String({
    description: 'Base token symbol or address',
    examples: [BASE_TOKEN],
  }),
  quoteToken: Type.Optional(
    Type.String({
      description: 'Quote token symbol or address',
      examples: [QUOTE_TOKEN],
    }),
  ),
  amount: Type.Number({
    description: 'Amount to swap',
    examples: [SWAP_AMOUNT],
  }),
  side: Type.String({
    enum: ['BUY', 'SELL'],
    default: 'SELL',
  }),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      default: PancakeswapConfig.config.slippagePct,
    }),
  ),
});

// Pancakeswap-specific execute-swap request
export const PancakeswapExecuteSwapRequest = Type.Object({
  walletAddress: Type.Optional(
    Type.String({
      description: 'Wallet address that will execute the swap',
      default: ethereumChainConfig.defaultWallet,
      examples: [ethereumChainConfig.defaultWallet],
    }),
  ),
  network: Type.Optional(
    Type.String({
      description: 'The blockchain network to use',
      default: ethereumChainConfig.defaultNetwork,
      enum: [...PancakeswapConfig.networks],
    }),
  ),
  baseToken: Type.String({
    description: 'Token to determine swap direction',
    examples: [BASE_TOKEN],
  }),
  quoteToken: Type.String({
    description: 'The other token in the pair',
    examples: [QUOTE_TOKEN],
  }),
  amount: Type.Number({
    description: 'Amount of base token to trade',
    examples: [SWAP_AMOUNT],
  }),
  side: Type.String({
    description:
      'Trade direction - BUY means buying base token with quote token, SELL means selling base token for quote token',
    enum: ['BUY', 'SELL'],
  }),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      default: PancakeswapConfig.config.slippagePct,
      examples: [1],
    }),
  ),
});

// Pancakeswap CLMM Open Position Request
export const PancakeswapClmmOpenPositionRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'The EVM network to use',
      default: 'bsc',
      examples: ['bsc'],
      enum: [...PancakeswapConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Wallet address that will open the position',
      default: ethereumChainConfig.defaultWallet,
    }),
  ),
  lowerPrice: Type.Number({
    description: 'Lower price bound for the position',
  }),
  upperPrice: Type.Number({
    description: 'Upper price bound for the position',
  }),
  poolAddress: Type.String({
    description: 'Address of the Pancakeswap V3 pool',
  }),
  baseTokenAmount: Type.Optional(
    Type.Number({
      description: 'Amount of base token to deposit',
    }),
  ),
  quoteTokenAmount: Type.Optional(
    Type.Number({
      description: 'Amount of quote token to deposit',
    }),
  ),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      default: PancakeswapConfig.config.slippagePct,
    }),
  ),
  gasPrice: Type.Optional(
    Type.String({
      description: 'Gas price in wei for the transaction',
    }),
  ),
  maxGas: Type.Optional(
    Type.Number({
      description: 'Maximum gas limit for the transaction',
      examples: [300000],
    }),
  ),
});

// Pancakeswap CLMM Add Liquidity Request
export const PancakeswapClmmAddLiquidityRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'The EVM network to use',
      default: 'bsc',
      examples: ['bsc'],
      enum: [...PancakeswapConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Wallet address that will add liquidity',
      default: ethereumChainConfig.defaultWallet,
    }),
  ),
  positionAddress: Type.String({
    description: 'NFT token ID of the position',
  }),
  baseTokenAmount: Type.Number({
    description: 'Amount of base token to add',
  }),
  quoteTokenAmount: Type.Number({
    description: 'Amount of quote token to add',
  }),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      default: PancakeswapConfig.config.slippagePct,
    }),
  ),
  gasPrice: Type.Optional(
    Type.String({
      description: 'Gas price in wei for the transaction',
    }),
  ),
  maxGas: Type.Optional(
    Type.Number({
      description: 'Maximum gas limit for the transaction',
      examples: [300000],
    }),
  ),
});

// Pancakeswap CLMM Remove Liquidity Request
export const PancakeswapClmmRemoveLiquidityRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'The EVM network to use',
      default: 'bsc',
      examples: ['bsc'],
      enum: [...PancakeswapConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Wallet address that will remove liquidity',
      default: ethereumChainConfig.defaultWallet,
    }),
  ),
  positionAddress: Type.String({
    description: 'NFT token ID of the position',
  }),
  percentageToRemove: Type.Number({
    minimum: 0,
    maximum: 100,
    description: 'Percentage of liquidity to remove',
  }),
  gasPrice: Type.Optional(
    Type.String({
      description: 'Gas price in wei for the transaction',
    }),
  ),
  maxGas: Type.Optional(
    Type.Number({
      description: 'Maximum gas limit for the transaction',
      examples: [300000],
    }),
  ),
});

// Pancakeswap CLMM Close Position Request
export const PancakeswapClmmClosePositionRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'The EVM network to use',
      default: 'bsc',
      examples: ['bsc'],
      enum: [...PancakeswapConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Wallet address that will close the position',
      default: ethereumChainConfig.defaultWallet,
    }),
  ),
  positionAddress: Type.String({
    description: 'NFT token ID of the position to close',
  }),
  gasPrice: Type.Optional(
    Type.String({
      description: 'Gas price in wei for the transaction',
    }),
  ),
  maxGas: Type.Optional(
    Type.Number({
      description: 'Maximum gas limit for the transaction',
      examples: [300000],
    }),
  ),
});

// Pancakeswap CLMM Collect Fees Request
export const PancakeswapClmmCollectFeesRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'The EVM network to use',
      default: 'bsc',
      examples: ['bsc'],
      enum: [...PancakeswapConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Wallet address that will collect fees',
      default: ethereumChainConfig.defaultWallet,
    }),
  ),
  positionAddress: Type.String({
    description: 'NFT token ID of the position',
  }),
  gasPrice: Type.Optional(
    Type.String({
      description: 'Gas price in wei for the transaction',
    }),
  ),
  maxGas: Type.Optional(
    Type.Number({
      description: 'Maximum gas limit for the transaction',
      examples: [300000],
    }),
  ),
});

// Pancakeswap CLMM Execute Swap Request
export const PancakeswapClmmExecuteSwapRequest = Type.Object({
  walletAddress: Type.Optional(
    Type.String({
      description: 'Wallet address that will execute the swap',
      default: ethereumChainConfig.defaultWallet,
    }),
  ),
  network: Type.Optional(
    Type.String({
      description: 'The EVM network to use',
      default: 'bsc',
      examples: ['bsc'],
      enum: [...PancakeswapConfig.networks],
    }),
  ),
  poolAddress: Type.Optional(
    Type.String({
      description: 'Pool address (optional - can be looked up from tokens)',
    }),
  ),
  baseToken: Type.String({
    description: 'Base token symbol or address',
    examples: [BASE_TOKEN],
  }),
  quoteToken: Type.Optional(
    Type.String({
      description: 'Quote token symbol or address',
      examples: [QUOTE_TOKEN],
    }),
  ),
  amount: Type.Number({
    description: 'Amount to swap',
    examples: [SWAP_AMOUNT],
  }),
  side: Type.String({
    enum: ['BUY', 'SELL'],
    default: 'SELL',
  }),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      default: PancakeswapConfig.config.slippagePct,
    }),
  ),
  gasPrice: Type.Optional(
    Type.String({
      description: 'Gas price in wei for the transaction',
    }),
  ),
  maxGas: Type.Optional(
    Type.Number({
      description: 'Maximum gas limit for the transaction',
      examples: [300000],
    }),
  ),
});

const POSITION_ID_EXAMPLE = '1234';

export const MasterchefKnowsPoolRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'The EVM network to use',
      default: 'bsc',
      examples: ['bsc'],
      enum: [...PancakeswapConfig.networks],
    }),
  ),
  poolAddress: Type.String({
    description: 'PancakeSwap V3 pool address to check against MasterChef',
    examples: ['0x172fcd41e0913e95784454622d1c3724f546f849'],
  }),
});
export type MasterchefKnowsPoolRequestType = Static<typeof MasterchefKnowsPoolRequest>;

export const MasterchefKnowsPoolResponse = Type.Object({
  registered: Type.Boolean({ description: 'Whether the pool is registered in MasterChef V3' }),
  pid: Type.Optional(Type.Number({ description: 'MasterChef pool ID (present when registered)' })),
});
export type MasterchefKnowsPoolResponseType = Static<typeof MasterchefKnowsPoolResponse>;

export const MasterchefStakeRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'The EVM network to use',
      default: 'bsc',
      examples: ['bsc'],
      enum: [...PancakeswapConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(Type.String({ description: 'Wallet address that owns the NFT position' })),
  tokenId: Type.String({ description: 'NFT position token ID to stake', examples: [POSITION_ID_EXAMPLE] }),
});
export type MasterchefStakeRequestType = Static<typeof MasterchefStakeRequest>;

export const MasterchefStakeResponse = Type.Object({
  signature: Type.String({ description: 'Transaction hash of the stake transaction' }),
  status: Type.Number({ description: 'Transaction status (1 = success)' }),
  tokenId: Type.String({ description: 'NFT position token ID that was staked' }),
  fee: Type.String({ description: 'Gas fee paid for the transaction in native token' }),
});
export type MasterchefStakeResponseType = Static<typeof MasterchefStakeResponse>;

export const MasterchefUnstakeRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'The EVM network to use',
      default: 'bsc',
      examples: ['bsc'],
      enum: [...PancakeswapConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(Type.String({ description: 'Wallet address that owns the staked NFT position' })),
  tokenId: Type.String({ description: 'NFT position token ID to unstake', examples: [POSITION_ID_EXAMPLE] }),
});
export type MasterchefUnstakeRequestType = Static<typeof MasterchefUnstakeRequest>;

export const MasterchefUnstakeResponse = Type.Object({
  signature: Type.String({ description: 'Transaction hash of the unstake transaction' }),
  status: Type.Number({ description: 'Transaction status (1 = success)' }),
  tokenId: Type.String({ description: 'NFT position token ID that was unstaked' }),
  fee: Type.String({ description: 'Gas fee paid for the transaction in native token' }),
});
export type MasterchefUnstakeResponseType = Static<typeof MasterchefUnstakeResponse>;

export const MasterchefUnstakeAndCloseRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'The EVM network to use',
      default: 'bsc',
      examples: ['bsc'],
      enum: [...PancakeswapConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(Type.String({ description: 'Wallet address that owns the staked NFT position' })),
  tokenId: Type.String({ description: 'NFT position token ID to unstake and close', examples: [POSITION_ID_EXAMPLE] }),
});
export type MasterchefUnstakeAndCloseRequestType = Static<typeof MasterchefUnstakeAndCloseRequest>;

export const MasterchefUnstakeAndCloseResponse = Type.Object({
  unstakeSignature: Type.String({ description: 'Transaction hash of the unstake transaction' }),
  closeSignature: Type.String({ description: 'Transaction hash of the close transaction' }),
  status: Type.Number({ description: 'Final transaction status (1 = success)' }),
  tokenId: Type.String({ description: 'NFT position token ID that was unstaked and closed' }),
  fee: Type.String({ description: 'Total gas fee paid for both transactions in native token' }),
});
export type MasterchefUnstakeAndCloseResponseType = Static<typeof MasterchefUnstakeAndCloseResponse>;
