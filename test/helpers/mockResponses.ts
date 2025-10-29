/**
 * Factory functions for creating standardized mock responses
 * These should be used instead of duplicating response objects in test files
 */

import { MOCK_TOKENS, MOCK_TRANSACTION_SIGNATURES } from '../constants/mockTokens';

interface CreateMockQuoteResponseOptions {
  tokenIn?: string;
  tokenOut?: string;
  amountIn?: number;
  amountOut?: number;
  price?: number;
  priceImpactPct?: number;
  slippagePct?: number;
}

interface CreateMockExecuteResponseOptions {
  signature?: string;
  status?: number;
  tokenIn?: string;
  tokenOut?: string;
  amountIn?: number;
  amountOut?: number;
  fee?: number;
  baseTokenBalanceChange?: number;
  quoteTokenBalanceChange?: number;
}

/**
 * Create a standardized Ethereum quote swap response
 */
export function createMockEthereumQuoteResponse(overrides: CreateMockQuoteResponseOptions = {}): any {
  const {
    tokenIn = MOCK_TOKENS.ETHEREUM.WETH.address,
    tokenOut = MOCK_TOKENS.ETHEREUM.USDC.address,
    amountIn = 1,
    amountOut = 3000,
    price = 3000,
    priceImpactPct = 0.1,
    slippagePct = 1,
  } = overrides;

  return {
    tokenIn,
    tokenOut,
    amountIn,
    amountOut,
    price,
    priceImpactPct,
    minAmountOut: amountOut * (1 - slippagePct / 100),
    maxAmountIn: amountIn * (1 + slippagePct / 100),
  };
}

/**
 * Create a standardized Solana quote swap response
 */
export function createMockSolanaQuoteResponse(overrides: CreateMockQuoteResponseOptions = {}): any {
  const {
    tokenIn = MOCK_TOKENS.SOLANA.SOL.address,
    tokenOut = MOCK_TOKENS.SOLANA.USDC.address,
    amountIn = 1,
    amountOut = 150,
    price = 150,
    priceImpactPct = 0.1,
    slippagePct = 1,
  } = overrides;

  return {
    tokenIn,
    tokenOut,
    amountIn,
    amountOut,
    price,
    priceImpactPct,
    minAmountOut: amountOut * (1 - slippagePct / 100),
    maxAmountIn: amountIn * (1 + slippagePct / 100),
  };
}

/**
 * Create a standardized Ethereum execute swap response
 */
export function createMockEthereumExecuteResponse(overrides: CreateMockExecuteResponseOptions = {}): any {
  const {
    signature = MOCK_TRANSACTION_SIGNATURES.ETHEREUM,
    status = 1,
    tokenIn = MOCK_TOKENS.ETHEREUM.WETH.address,
    tokenOut = MOCK_TOKENS.ETHEREUM.USDC.address,
    amountIn = 1,
    amountOut = 3000,
    fee = 0.01,
    baseTokenBalanceChange = -1,
    quoteTokenBalanceChange = 3000,
  } = overrides;

  return {
    signature,
    status,
    data: {
      tokenIn,
      tokenOut,
      amountIn,
      amountOut,
      fee,
      baseTokenBalanceChange,
      quoteTokenBalanceChange,
    },
  };
}

/**
 * Create a standardized Solana execute swap response
 */
export function createMockSolanaExecuteResponse(overrides: CreateMockExecuteResponseOptions = {}): any {
  const {
    signature = MOCK_TRANSACTION_SIGNATURES.SOLANA,
    status = 1,
    tokenIn = MOCK_TOKENS.SOLANA.SOL.address,
    tokenOut = MOCK_TOKENS.SOLANA.USDC.address,
    amountIn = 1,
    amountOut = 150,
    fee = 0.000005,
    baseTokenBalanceChange = -1,
    quoteTokenBalanceChange = 150,
  } = overrides;

  return {
    signature,
    status,
    data: {
      tokenIn,
      tokenOut,
      amountIn,
      amountOut,
      fee,
      baseTokenBalanceChange,
      quoteTokenBalanceChange,
    },
  };
}
