import { Type } from '@sinclair/typebox';

import { getEthereumChainConfig } from '../../chains/ethereum/ethereum.config';

import { FibrousConfig } from './fibrous.config';

// Get chain config for defaults
const ethereumChainConfig = getEthereumChainConfig();

// Constants for examples
const BASE_TOKEN = 'WETH';
const QUOTE_TOKEN = 'USDC';
const SWAP_AMOUNT = 1;

// Fibrous-specific quote-swap request (superset of base QuoteSwapRequest)
export const FibrousQuoteSwapRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'The EVM network to use',
      default: ethereumChainConfig.defaultNetwork,
      enum: [...FibrousConfig.networks],
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
      examples: [1],
    }),
  ),
  indicativePrice: Type.Optional(
    Type.Boolean({
      description:
        'If true, returns indicative pricing only (no commitment). If false, returns firm quote ready for execution',
      default: true,
    }),
  ),
  takerAddress: Type.Optional(
    Type.String({
      description: 'Wallet address that will receive the output token (optional for quotes)',
    }),
  ),
  approximateIfNoExactOut: Type.Optional(
    Type.Boolean({
      description:
        'For BUY orders: Fibrous is ExactIn-only, so BUYs are approximated via a sell-leg ExactIn quote. If false, BUY requests fail with a clear error.',
      default: true,
    }),
  ),
});

// Fibrous-specific quote-swap response (superset of base QuoteSwapResponse)
export const FibrousQuoteSwapResponse = Type.Object({
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
  approximation: Type.Optional(
    Type.Boolean({
      description:
        'True when a BUY was approximated via a sell-leg ExactIn quote (Fibrous is ExactIn-only); amountOut is an estimate',
    }),
  ),
  expirationTime: Type.Optional(
    Type.Number({
      description: 'Unix timestamp when this quote expires (only for firm quotes)',
    }),
  ),
  gasEstimate: Type.String({
    description: 'Estimated gas required for the swap',
  }),
  routeId: Type.Optional(
    Type.String({
      description: 'Fibrous route identifier for this quote',
    }),
  ),
  route: Type.Optional(
    Type.Array(Type.Any(), {
      description: 'Liquidity sources and pool splits used for this route',
    }),
  ),
  allowanceTarget: Type.Optional(
    Type.String({
      description: 'Router contract address that needs token approval',
    }),
  ),
  to: Type.Optional(
    Type.String({
      description: 'Contract address to send transaction to',
    }),
  ),
  data: Type.Optional(
    Type.String({
      description: 'Encoded transaction data',
    }),
  ),
  value: Type.Optional(
    Type.String({
      description: 'Native coin value to send with transaction',
    }),
  ),
});

// Fibrous-specific execute-quote request (superset of base ExecuteQuoteRequest)
export const FibrousExecuteQuoteRequest = Type.Object({
  walletAddress: Type.Optional(
    Type.String({
      description: 'Wallet address that will execute the swap',
      default: ethereumChainConfig.defaultWallet,
    }),
  ),
  network: Type.Optional(
    Type.String({
      description: 'The blockchain network to use',
      default: ethereumChainConfig.defaultNetwork,
      enum: [...FibrousConfig.networks],
      examples: [...FibrousConfig.networks],
    }),
  ),
  quoteId: Type.String({
    description: 'ID of the quote to execute',
    examples: ['123e4567-e89b-12d3-a456-426614174000'],
  }),
  gasPrice: Type.Optional(
    Type.String({
      description: 'Gas price in wei for the transaction',
    }),
  ),
  maxGas: Type.Optional(
    Type.Number({
      description: 'Maximum gas limit for the transaction',
      examples: [1000000],
    }),
  ),
});

// Fibrous-specific execute-swap request (superset of base ExecuteSwapRequest)
export const FibrousExecuteSwapRequest = Type.Object({
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
      enum: [...FibrousConfig.networks],
      examples: [...FibrousConfig.networks],
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
      examples: [1],
    }),
  ),
  approximateIfNoExactOut: Type.Optional(
    Type.Boolean({
      description:
        'For BUY orders: Fibrous is ExactIn-only, so BUYs are approximated via a sell-leg ExactIn quote. If false, BUY requests fail with a clear error.',
      default: true,
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
      examples: [500000],
    }),
  ),
});
