import { Type, Static } from '@sinclair/typebox';

import * as Base from '../../schemas/router-schema';

import { ZeroXConfig } from './0x.config';

// Constants for examples
const BASE_TOKEN = 'WETH';
const QUOTE_TOKEN = 'USDC';
const SWAP_AMOUNT = 1;

// 0x-specific quote-swap request (superset of base QuoteSwapRequest)
export const ZeroXQuoteSwapRequest = Type.Object({
  network: Type.String({
    description: 'The blockchain network to use',
    default: 'mainnet',
    examples: ZeroXConfig.networks.mainnet.availableNetworks,
  }),
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
  indicativePrice: Type.Optional(
    Type.Boolean({
      description:
        'If true, returns indicative pricing only (no commitment). If false, returns firm quote ready for execution',
      default: true,
    }),
  ),
  takerAddress: Type.Optional(
    Type.String({
      description: 'Ethereum wallet address that will execute the swap (optional for quotes)',
    }),
  ),
});

// 0x-specific quote-swap response (superset of base QuoteSwapResponse)
export const ZeroXQuoteSwapResponse = Type.Object({
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
  slippagePct: Type.Number({
    description: 'Slippage percentage used for this quote',
  }),
  priceWithSlippage: Type.Number({
    description: 'Price including slippage (worst acceptable price)',
  }),
  minAmountOut: Type.Number({
    description: 'Minimum amount of tokenOut that will be accepted',
  }),
  maxAmountIn: Type.Number({
    description: 'Maximum amount of tokenIn that will be spent',
  }),
  priceImpactPct: Type.Number({
    description: 'Estimated price impact as a percentage (0-100)',
  }),
  expirationTime: Type.Optional(
    Type.Number({
      description: 'Unix timestamp when this quote expires (only for firm quotes)',
    }),
  ),
  gasEstimate: Type.String({
    description: 'Estimated gas required for the swap',
  }),
  sources: Type.Optional(
    Type.Array(Type.Any(), {
      description: 'Liquidity sources used for this quote',
    }),
  ),
  allowanceTarget: Type.Optional(
    Type.String({
      description: 'Contract address that needs token approval',
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
      description: 'ETH value to send with transaction',
    }),
  ),
});

// 0x-specific execute-quote request (superset of base ExecuteQuoteRequest)
export const ZeroXExecuteQuoteRequest = Type.Object({
  walletAddress: Type.String({
    description: 'Wallet address that will execute the swap',
  }),
  network: Type.String({
    description: 'The blockchain network to use',
    default: 'mainnet',
  }),
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
      examples: [300000],
    }),
  ),
});

// 0x-specific execute-swap request (superset of base ExecuteSwapRequest)
export const ZeroXExecuteSwapRequest = Type.Object({
  walletAddress: Type.String({
    description: 'Wallet address that will execute the swap',
  }),
  network: Type.String({
    description: 'The blockchain network to use',
    default: 'mainnet',
  }),
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
