# Swap Schema Refactor Plan

## Implementation Status: ✅ COMPLETED

### Overview of Changes

This refactor has been successfully implemented with the following high-level changes:

1. **Schema Separation**: 
   - Aggregators (0x, Jupiter, Uniswap Smart Order Router) now use enhanced `swap-schema.ts` with 4 endpoints
   - Pool-based DEXs use simplified schemas in `amm-schema.ts` and `clmm-schema.ts` with 2 endpoints

2. **New Route Structure**:
   - Created `/swap-routes-v2/` directories for 0x, Jupiter, and Uniswap
   - Updated existing pool-based routes to use new schemas
   - Implemented quote caching for aggregators

3. **Preserved Naming Convention**:
   - Kept `baseToken`/`quoteToken` terminology throughout
   - Added computed `tokenIn`/`tokenOut` fields in responses for clarity

### Key Differences: Old vs New

| Aspect | Old Approach | New Approach |
|--------|--------------|---------------|
| **Schema Organization** | All DEXs used unified `swap-schema.ts` | Aggregators use `swap-schema.ts`, pools use `amm/clmm-schema.ts` |
| **Aggregator Endpoints** | 2 endpoints (quote-swap, execute-swap) | 4 endpoints (get-price, get-quote, execute-quote, execute-swap) |
| **Pool Endpoints** | 2 endpoints in swap schema | 2 endpoints in their respective type schemas |
| **Quote Handling** | Direct execution only | Quote caching with TTL for aggregators |
| **Type Safety** | Generic types for all | Connector-specific schema extensions |
| **Response Fields** | Only swap direction fields | Both pool reference (base/quote) and computed swap fields (tokenIn/tokenOut) |

## Executive Summary

This document outlines a comprehensive refactor plan that recognizes the fundamental differences between aggregator-based and pool-based DEX connectors. The plan proposes separate schema designs: enhanced swap endpoints for aggregators (Jupiter, 0x, Uniswap Smart Order Router) in `swap-schema.ts`, while maintaining simpler swap interfaces within `amm-schema.ts` and `clmm-schema.ts` for pool-based connectors (Raydium AMM/CLMM, Meteora, Uniswap V2/V3 pools).

### Key Insight
- **Aggregators** benefit from 4 separate endpoints (get-price, get-quote, execute-quote, execute-swap) due to their API-based architecture or smart routing capabilities
- **Pool-based DEXs** only need 2 endpoints (quote-swap, execute-swap) as they calculate everything on-demand using pool math
- This separation provides cleaner code organization and type safety without over-engineering
- **Note**: Uniswap's Smart Order Router (swap connector) acts as an aggregator, while Uniswap V2/V3 (amm/clmm connectors) are pool-based

## Current State Analysis

### Existing Patterns

1. **Two-Step Process**: All connectors currently implement separate quote and execute endpoints
2. **Unified Schema**: All connectors use the same `swap-schema.ts` for request/response types
3. **Multiple Trading Types**: Connectors support swap (aggregator), AMM, and CLMM operations
4. **Consistent Structure**: Route files follow a predictable pattern across connectors

### DEX-Specific Patterns

| DEX | Quote Endpoint | Execute Endpoint | Special Features |
|-----|----------------|------------------|------------------|
| **Jupiter** | Fetches route via API | Submits transaction from API | Aggregator with priority fees |
| **Raydium** | Calculates via SDK | Builds transaction locally | AMM/CLMM/CPMM support |
| **Uniswap (swap)** | Uses AlphaRouter | Builds transaction locally | Smart Order Router aggregator |
| **Uniswap (amm/clmm)** | Uses pool SDK | Builds transaction locally | Direct pool swaps |
| **0x** | Price API endpoint | Quote API endpoint | Separate price vs quote |
| **Meteora** | Calculates via SDK | Builds transaction locally | CLMM only |

## Proposed Architecture

### Schema Separation by Connector Type

1. **Aggregators** (Jupiter, 0x, Uniswap Smart Order Router) → Use enhanced `swap-schema.ts`
   - Support 4 endpoints: get-price, get-quote, execute-quote, execute-swap
   - Benefit from quote caching and separate price discovery
   - Natural fit for their API structure or routing algorithms

2. **AMM Pools** (Raydium AMM/CPMM, Uniswap V2) → Add swap types to `amm-schema.ts`
   - Keep 2 endpoints: quote-swap, execute-swap
   - No need for separate price endpoint (quote is fast enough)
   - No need for execute-quote (transactions built on-demand)

3. **CLMM Pools** (Raydium CLMM, Meteora, Uniswap V3) → Add swap types to `clmm-schema.ts`
   - Keep 2 endpoints: quote-swap, execute-swap
   - Same reasoning as AMM pools
   - Schema can include CLMM-specific fields

### Aggregator Endpoints (swap-schema.ts)

#### 1. Get Price
```
GET /connectors/{dex}/swap/get-price
```
- Lightweight price discovery via API
- No transaction building or gas estimation
- Sub-100ms response time

#### 2. Get Quote
```
GET /connectors/{dex}/swap/get-quote
```
- Full quote with routing details via API
- Returns quoteId for later execution
- Includes gas estimates and route visualization

#### 3. Execute Quote
```
POST /connectors/{dex}/swap/execute-quote
```
- Execute a previously fetched quote using quoteId
- Allows users to review before executing
- Quote cached server-side

#### 4. Execute Swap
```
POST /connectors/{dex}/swap/execute-swap
```
- One-step quote and execute
- Convenience endpoint for programmatic trading

### Pool-Based Endpoints (amm-schema.ts / clmm-schema.ts)

#### 1. Quote Swap
```
GET /connectors/{dex}/{type}/quote-swap
```
- Calculate swap amounts using pool math
- Fast enough to serve as both price and quote
- No external API calls needed

#### 2. Execute Swap
```
POST /connectors/{dex}/{type}/execute-swap
```
- Build and execute transaction
- No quote caching needed (built fresh each time)
- Direct pool interaction

## Schema Design

### 1. Base Aggregator Schemas (swap-schema.ts)

```typescript
// Base schemas contain only required fields common to all aggregators

// Get Price Request - Base
export const GetPriceRequest = Type.Object({
  network: Type.String(),
  baseToken: Type.String(),
  quoteToken: Type.String(),
  amount: Type.Number(),
  side: Type.Enum({ BUY: 'BUY', SELL: 'SELL' }),
}, { $id: 'GetPriceRequest' });

// Get Price Response - Base
export const GetPriceResponse = Type.Object({
  baseToken: Type.String(),
  quoteToken: Type.String(),
  side: Type.String(),
  tokenIn: Type.String(),
  tokenOut: Type.String(),
  amountIn: Type.Number(),
  amountOut: Type.Number(),
  price: Type.Number(),
}, { $id: 'GetPriceResponse' });

// Get Quote Request - Base
export const GetQuoteRequest = Type.Object({
  network: Type.String(),
  baseToken: Type.String(),
  quoteToken: Type.String(),
  amount: Type.Number(),
  side: Type.Enum({ 
    BUY: 'BUY',   // Buy baseToken with quoteToken
    SELL: 'SELL'  // Sell baseToken for quoteToken
  }),
  slippagePct: Type.Number({ default: 1.0 }),
}, { $id: 'GetQuoteRequest' });

// Get Quote Response - Base
export const GetQuoteResponse = Type.Object({
  quoteId: Type.String(),
  baseToken: Type.String(),
  quoteToken: Type.String(),
  side: Type.String(),
  tokenIn: Type.String(),
  tokenOut: Type.String(),
  amountIn: Type.Number(),
  amountOut: Type.Number(),
  minAmountOut: Type.Number(),
  maxAmountIn: Type.Number(),
  price: Type.Number(),
  priceImpact: Type.Number(),
  route: Type.Array(Type.Object({
    pool: Type.String(),
    poolType: Type.String(),
    tokenIn: Type.String(),
    tokenOut: Type.String(),
    amountIn: Type.Number(),
    amountOut: Type.Number(),
  })),
  estimatedGas: Type.Object({
    units: Type.Number(),
    costNative: Type.Number(),
  }),
  validUntil: Type.Number(),
}, { $id: 'GetQuoteResponse' });

// Execute Quote Request - Base
export const ExecuteQuoteRequest = Type.Object({
  walletAddress: Type.String(),
  quoteId: Type.String(),
}, { $id: 'ExecuteQuoteRequest' });

// Execute Swap Request - Base
export const ExecuteSwapRequest = Type.Object({
  walletAddress: Type.String(),
  network: Type.String(),
  baseToken: Type.String(),
  quoteToken: Type.String(),
  amount: Type.Number(),
  side: Type.Enum({ 
    BUY: 'BUY',   // Buy baseToken with quoteToken
    SELL: 'SELL'  // Sell baseToken for quoteToken
  }),
  slippagePct: Type.Number({ default: 1.0 }),
}, { $id: 'ExecuteSwapRequest' });

// Swap Response - Base
export const SwapResponse = Type.Object({
  transactionHash: Type.String(),
  status: Type.Enum({ 
    PENDING: 'PENDING', 
    CONFIRMED: 'CONFIRMED', 
    FAILED: 'FAILED' 
  }),
}, { $id: 'SwapResponse' });
```

### Connector-Specific Extensions

#### Jupiter (Solana)
```typescript
// jupiter-schemas.ts
import { Type } from '@sinclair/typebox';
import * as Base from '@/schemas/swap-schema';

// Extend base request with Jupiter-specific fields
export const JupiterGetQuoteRequest = Type.Intersect([
  Base.GetQuoteRequest,
  Type.Object({
    onlyDirectRoutes: Type.Optional(Type.Boolean()),
    asLegacyTransaction: Type.Optional(Type.Boolean()),
    maxAccounts: Type.Optional(Type.Number()),
  })
]);

export const JupiterGetQuoteResponse = Type.Intersect([
  Base.GetQuoteResponse,
  Type.Object({
    priceImpactPct: Type.Number(),
    contextSlot: Type.Number(),
    timeTaken: Type.Number(),
    route: Type.Array(Type.Object({
      pool: Type.String(),
      poolType: Type.String(),
      tokenIn: Type.String(),
      tokenOut: Type.String(),
      amountIn: Type.Number(),
      amountOut: Type.Number(),
      fee: Type.Number(),
      swapInfo: Type.Any(), // Jupiter-specific routing info
    })),
  })
]);

export const JupiterExecuteQuoteRequest = Type.Intersect([
  Base.ExecuteQuoteRequest,
  Type.Object({
    priorityLevel: Type.Optional(Type.Enum({ 
      none: 'none',
      low: 'low',
      medium: 'medium',
      high: 'high',
      veryHigh: 'veryHigh'
    })),
    computeUnitPrice: Type.Optional(Type.Number()),
    jitoTipAmount: Type.Optional(Type.Number()),
  })
]);

export const JupiterSwapResponse = Type.Intersect([
  Base.SwapResponse,
  Type.Object({
    executionDetails: Type.Optional(Type.Object({
      baseToken: Type.String(),
      quoteToken: Type.String(),
      side: Type.String(),
      tokenIn: Type.String(),
      tokenOut: Type.String(),
      amountIn: Type.Number(),
      amountOut: Type.Number(),
      price: Type.Number(),
      priceImpact: Type.Number(),
      computeUnitsUsed: Type.Number(),
      priorityFee: Type.Number(),
      blockHeight: Type.Number(),
      slot: Type.Number(),
    })),
  })
]);
```

#### 0x (Ethereum)
```typescript
// 0x-schemas.ts
import { Type } from '@sinclair/typebox';
import * as Base from '@/schemas/swap-schema';

// 0x has distinct price vs quote endpoints
export const ZeroExGetPriceResponse = Type.Intersect([
  Base.GetPriceResponse,
  Type.Object({
    priceImpact: Type.Number(),
    sources: Type.Array(Type.Object({
      name: Type.String(),
      proportion: Type.Number(),
    })),
    fees: Type.Object({
      zeroExFee: Type.Number(),
    }),
  })
]);

export const ZeroExGetQuoteRequest = Type.Intersect([
  Base.GetQuoteRequest,
  Type.Object({
    walletAddress: Type.String(), // Required for 0x
    skipValidation: Type.Optional(Type.Boolean()),
    enableSlippageProtection: Type.Optional(Type.Boolean()),
    affiliateAddress: Type.Optional(Type.String()),
  })
]);

export const ZeroExGetQuoteResponse = Type.Intersect([
  Base.GetQuoteResponse,
  Type.Object({
    to: Type.String(),
    data: Type.String(),
    value: Type.String(),
    allowanceTarget: Type.String(),
    gasPrice: Type.String(),
    estimatedGas: Type.Object({
      units: Type.Number(),
      costNative: Type.Number(),
      costUSD: Type.Number(),
    }),
    sources: Type.Array(Type.Object({
      name: Type.String(),
      proportion: Type.Number(),
    })),
  })
]);

export const ZeroExExecuteSwapRequest = Type.Intersect([
  Base.ExecuteSwapRequest,
  Type.Object({
    gasPrice: Type.Optional(Type.String()),
    maxFeePerGas: Type.Optional(Type.String()),
    maxPriorityFeePerGas: Type.Optional(Type.String()),
    nonce: Type.Optional(Type.Number()),
  })
]);
```
```

### 2. Base AMM Pool Schemas (amm-schema.ts)

```typescript
// Base AMM schemas contain only core swap fields

// AMM Quote Swap Request - Base
export const QuoteSwapRequest = Type.Object({
  network: Type.String(),
  poolAddress: Type.String(),
  baseToken: Type.String({ description: 'Base token of the pool' }),
  quoteToken: Type.String({ description: 'Quote token of the pool' }),
  amount: Type.Number(),
  side: Type.Enum({ 
    BUY: 'BUY',   // Buy baseToken using quoteToken
    SELL: 'SELL'  // Sell baseToken for quoteToken
  }),
  slippagePct: Type.Number({ default: 1.0 }),
}, { $id: 'AMM_QuoteSwapRequest' });

// AMM Quote Swap Response - Base
export const QuoteSwapResponse = Type.Object({
  poolAddress: Type.String(),
  baseToken: Type.String(),
  quoteToken: Type.String(),
  side: Type.String(),
  tokenIn: Type.String(),
  tokenOut: Type.String(),
  amountIn: Type.Number(),
  amountOut: Type.Number(),
  minAmountOut: Type.Number(),
  maxAmountIn: Type.Number(),
  price: Type.Number(),
  priceImpact: Type.Number(),
  fee: Type.Number(),
}, { $id: 'AMM_QuoteSwapResponse' });

// AMM Execute Swap Request - Base
export const ExecuteSwapRequest = Type.Object({
  walletAddress: Type.String(),
  network: Type.String(),
  poolAddress: Type.String(),
  baseToken: Type.String(),
  quoteToken: Type.String(),
  amount: Type.Number(),
  side: Type.Enum({ 
    BUY: 'BUY',   // Buy baseToken using quoteToken
    SELL: 'SELL'  // Sell baseToken for quoteToken
  }),
  slippagePct: Type.Number({ default: 1.0 }),
}, { $id: 'AMM_ExecuteSwapRequest' });

// AMM Execute Swap Response - Base
export const ExecuteSwapResponse = Type.Object({
  signature: Type.String(),
  status: Type.Number({ description: 'TransactionStatus enum value' }),
}, { $id: 'AMM_ExecuteSwapResponse' });
```

### AMM Connector Extensions

#### Raydium AMM/CPMM
```typescript
// raydium-amm-schemas.ts
import { Type } from '@sinclair/typebox';
import * as BaseAMM from '@/schemas/amm-schema';

// Raydium-specific response extensions
export const RaydiumQuoteSwapResponse = Type.Intersect([
  BaseAMM.QuoteSwapResponse,
  Type.Object({
    poolType: Type.String(), // 'AMM' | 'CPMM'
    computeUnits: Type.Number({ default: 300000 }),
    poolVersion: Type.Number(),
  })
]);

export const RaydiumExecuteSwapRequest = Type.Intersect([
  BaseAMM.ExecuteSwapRequest,
  Type.Object({
    priorityFeePerCU: Type.Optional(Type.Number()),
    computeUnits: Type.Optional(Type.Number({ default: 300000 })),
    jitoTipAmount: Type.Optional(Type.Number()),
  })
]);

export const RaydiumExecuteSwapResponse = Type.Intersect([
  BaseAMM.ExecuteSwapResponse,
  Type.Object({
    data: Type.Optional(Type.Object({
      baseToken: Type.String(),
      quoteToken: Type.String(),
      side: Type.String(),
      tokenIn: Type.String(),
      tokenOut: Type.String(),
      amountIn: Type.Number(),
      amountOut: Type.Number(),
      fee: Type.Number(),
      price: Type.Number(),
      computeUnitsUsed: Type.Number(),
      slot: Type.Number(),
    })),
  })
]);
```

#### Uniswap V2
```typescript
// uniswap-v2-schemas.ts
import { Type } from '@sinclair/typebox';
import * as BaseAMM from '@/schemas/amm-schema';

export const UniswapV2ExecuteSwapRequest = Type.Intersect([
  BaseAMM.ExecuteSwapRequest,
  Type.Object({
    gasPrice: Type.Optional(Type.String()),
    maxFeePerGas: Type.Optional(Type.String()),
    maxPriorityFeePerGas: Type.Optional(Type.String()),
    nonce: Type.Optional(Type.Number()),
    deadline: Type.Optional(Type.Number()),
  })
]);

export const UniswapV2ExecuteSwapResponse = Type.Intersect([
  BaseAMM.ExecuteSwapResponse,
  Type.Object({
    data: Type.Optional(Type.Object({
      baseToken: Type.String(),
      quoteToken: Type.String(),
      side: Type.String(),
      tokenIn: Type.String(),
      tokenOut: Type.String(),
      amountIn: Type.Number(),
      amountOut: Type.Number(),
      fee: Type.Number(),
      price: Type.Number(),
      gasUsed: Type.String(),
      effectiveGasPrice: Type.String(),
      blockNumber: Type.Number(),
    })),
  })
]);
```

### 3. Base CLMM Pool Schemas (clmm-schema.ts)

```typescript
// Base CLMM schemas with core fields

// CLMM Quote Swap Request - Base
export const QuoteSwapRequest = Type.Object({
  network: Type.String(),
  poolAddress: Type.String(),
  baseToken: Type.String({ description: 'Base token of the pool' }),
  quoteToken: Type.String({ description: 'Quote token of the pool' }),
  amount: Type.Number(),
  side: Type.Enum({ 
    BUY: 'BUY',   // Buy baseToken using quoteToken
    SELL: 'SELL'  // Sell baseToken for quoteToken
  }),
  slippagePct: Type.Number({ default: 1.0 }),
}, { $id: 'CLMM_QuoteSwapRequest' });

// CLMM Quote Swap Response - Base
export const QuoteSwapResponse = Type.Object({
  poolAddress: Type.String(),
  baseToken: Type.String(),
  quoteToken: Type.String(),
  side: Type.String(),
  tokenIn: Type.String(),
  tokenOut: Type.String(),
  amountIn: Type.Number(),
  amountOut: Type.Number(),
  minAmountOut: Type.Number(),
  maxAmountIn: Type.Number(),
  price: Type.Number(),
  priceImpact: Type.Number(),
  fee: Type.Number(),
}, { $id: 'CLMM_QuoteSwapResponse' });

// CLMM Execute Swap Request - Base
export const ExecuteSwapRequest = Type.Object({
  walletAddress: Type.String(),
  network: Type.String(),
  poolAddress: Type.String(),
  baseToken: Type.String(),
  quoteToken: Type.String(),
  amount: Type.Number(),
  side: Type.Enum({ 
    BUY: 'BUY',   // Buy baseToken using quoteToken
    SELL: 'SELL'  // Sell baseToken for quoteToken
  }),
  slippagePct: Type.Number({ default: 1.0 }),
}, { $id: 'CLMM_ExecuteSwapRequest' });

// CLMM Execute Swap Response - Base
export const ExecuteSwapResponse = Type.Object({
  signature: Type.String(),
  status: Type.Number({ description: 'TransactionStatus enum value' }),
}, { $id: 'CLMM_ExecuteSwapResponse' });
```

### CLMM Connector Extensions

#### Raydium CLMM
```typescript
// raydium-clmm-schemas.ts
import { Type } from '@sinclair/typebox';
import * as BaseCLMM from '@/schemas/clmm-schema';

export const RaydiumCLMMQuoteSwapResponse = Type.Intersect([
  BaseCLMM.QuoteSwapResponse,
  Type.Object({
    computeUnits: Type.Number({ default: 600000 }),
    ticksCrossed: Type.Number(),
    currentTick: Type.Number(),
    sqrtPriceX64: Type.String(),
    remainingAccounts: Type.Array(Type.String()),
  })
]);

export const RaydiumCLMMExecuteSwapRequest = Type.Intersect([
  BaseCLMM.ExecuteSwapRequest,
  Type.Object({
    priorityFeePerCU: Type.Optional(Type.Number()),
    computeUnits: Type.Optional(Type.Number({ default: 600000 })),
  })
]);

export const RaydiumCLMMExecuteSwapResponse = Type.Intersect([
  BaseCLMM.ExecuteSwapResponse,
  Type.Object({
    data: Type.Optional(Type.Object({
      baseToken: Type.String(),
      quoteToken: Type.String(),
      side: Type.String(),
      tokenIn: Type.String(),
      tokenOut: Type.String(),
      amountIn: Type.Number(),
      amountOut: Type.Number(),
      fee: Type.Number(),
      price: Type.Number(),
      finalTick: Type.Number(),
      ticksCrossed: Type.Number(),
      computeUnitsUsed: Type.Number(),
    })),
  })
]);
```

#### Meteora DLMM
```typescript
// meteora-dlmm-schemas.ts
import { Type } from '@sinclair/typebox';
import * as BaseCLMM from '@/schemas/clmm-schema';

export const MeteoraQuoteSwapResponse = Type.Intersect([
  BaseCLMM.QuoteSwapResponse,
  Type.Object({
    computeUnits: Type.Number({ default: 150000 }),
    activeBinId: Type.Number(),
    binsCrossed: Type.Number(),
    protocolFee: Type.Number(),
    volatilityAccumulated: Type.Number(),
  })
]);

export const MeteoraExecuteSwapRequest = Type.Intersect([
  BaseCLMM.ExecuteSwapRequest,
  Type.Object({
    priorityFeePerCU: Type.Optional(Type.Number()),
    computeUnits: Type.Optional(Type.Number({ default: 150000 })),
  })
]);

export const MeteoraExecuteSwapResponse = Type.Intersect([
  BaseCLMM.ExecuteSwapResponse,
  Type.Object({
    data: Type.Optional(Type.Object({
      baseToken: Type.String(),
      quoteToken: Type.String(),
      side: Type.String(),
      tokenIn: Type.String(),
      tokenOut: Type.String(),
      amountIn: Type.Number(),
      amountOut: Type.Number(),
      fee: Type.Number(),
      price: Type.Number(),
      finalBinId: Type.Number(),
      binsCrossed: Type.Number(),
    })),
  })
]);
```

#### Uniswap V3
```typescript
// uniswap-v3-schemas.ts
import { Type } from '@sinclair/typebox';
import * as BaseCLMM from '@/schemas/clmm-schema';

export const UniswapV3QuoteSwapResponse = Type.Intersect([
  BaseCLMM.QuoteSwapResponse,
  Type.Object({
    ticksCrossed: Type.Number(),
    currentTick: Type.Number(),
    sqrtPriceX96: Type.String(),
    liquidity: Type.String(),
    estimatedGasUsed: Type.String(),
  })
]);

export const UniswapV3ExecuteSwapRequest = Type.Intersect([
  BaseCLMM.ExecuteSwapRequest,
  Type.Object({
    recipient: Type.Optional(Type.String()),
    deadline: Type.Optional(Type.Number()),
    sqrtPriceLimitX96: Type.Optional(Type.String()),
    gasPrice: Type.Optional(Type.String()),
    maxFeePerGas: Type.Optional(Type.String()),
    maxPriorityFeePerGas: Type.Optional(Type.String()),
  })
]);

export const UniswapV3ExecuteSwapResponse = Type.Intersect([
  BaseCLMM.ExecuteSwapResponse,
  Type.Object({
    data: Type.Optional(Type.Object({
      baseToken: Type.String(),
      quoteToken: Type.String(),
      side: Type.String(),
      tokenIn: Type.String(),
      tokenOut: Type.String(),
      amountIn: Type.Number(),
      amountOut: Type.Number(),
      fee: Type.Number(),
      price: Type.Number(),
      finalTick: Type.Number(),
      ticksCrossed: Type.Number(),
      gasUsed: Type.String(),
    })),
  })
]);
```


## Implementation Details

### Route Handler Examples

#### Jupiter Route Handler
```typescript
// jupiter/swap-routes/getPrice.ts
import { Type } from '@sinclair/typebox';
import { GetPriceRequest, GetPriceResponse } from '@/schemas/swap-schema';
import { JupiterGetPriceResponse } from '../jupiter-schemas';

export const getPrice = {
  method: 'GET',
  url: '/get-price',
  schema: {
    querystring: GetPriceRequest,
    response: {
      200: JupiterGetPriceResponse, // Extended response
    },
  },
  handler: async (request, reply) => {
    const jupiter = Jupiter.getInstance(request.query.network);
    const result = await jupiter.getPrice(request.query);
    reply.send(result);
  },
};

// jupiter/swap-routes/executeQuote.ts
import { JupiterExecuteQuoteRequest, JupiterSwapResponse } from '../jupiter-schemas';

export const executeQuote = {
  method: 'POST',
  url: '/execute-quote',
  schema: {
    body: JupiterExecuteQuoteRequest, // Extended request
    response: {
      200: JupiterSwapResponse, // Extended response
    },
  },
  handler: async (request, reply) => {
    const jupiter = Jupiter.getInstance(request.body.network);
    const result = await jupiter.executeQuote(request.body);
    reply.send(result);
  },
};
```

#### Raydium AMM Route Handler
```typescript
// raydium/amm-routes/quoteSwap.ts
import { Type } from '@sinclair/typebox';
import { QuoteSwapRequest } from '@/schemas/amm-schema';
import { RaydiumQuoteSwapResponse } from '../raydium-amm-schemas';

export const quoteSwap = {
  method: 'GET',
  url: '/quote-swap',
  schema: {
    querystring: QuoteSwapRequest, // Base request
    response: {
      200: RaydiumQuoteSwapResponse, // Extended response
    },
  },
  handler: async (request, reply) => {
    const raydium = Raydium.getInstance(request.query.network);
    const result = await raydium.quoteAMMSwap(request.query);
    reply.send(result);
  },
};
```

### Aggregator Implementation (Jupiter)

```typescript
// jupiter/jupiter.ts
class JupiterConnector {
  // Uses base schema types internally
  async getPrice(request: GetPriceRequestType): Promise<any> {
    const tokenIn = request.side === 'SELL' ? request.baseToken : request.quoteToken;
    const tokenOut = request.side === 'SELL' ? request.quoteToken : request.baseToken;
    
    const response = await this.api.get('/quote', {
      inputMint: tokenIn,
      outputMint: tokenOut,
      amount: request.amount,
      onlyDirectRoutes: true,
      asLegacyTransaction: false
    });
    
    // Return extended response type
    return {
      baseToken: request.baseToken,
      quoteToken: request.quoteToken,
      side: request.side,
      tokenIn,
      tokenOut,
      price: response.outAmount / response.inAmount,
      amountIn: response.inAmount,
      amountOut: response.outAmount,
      // Jupiter-specific fields
      priceImpactPct: response.priceImpactPct,
      contextSlot: response.contextSlot,
    };
  }
  
  async executeQuote(request: JupiterExecuteQuoteRequestType): Promise<any> {
    const cachedQuote = this.quoteCache.get(request.quoteId);
    if (!cachedQuote) throw new Error('Quote expired');
    
    // Handle Jupiter-specific priority fees
    if (request.priorityLevel) {
      cachedQuote.computeUnitPrice = this.getPriorityFee(request.priorityLevel);
    }
    
    const swapTransaction = await this.api.post('/swap', {
      quoteResponse: cachedQuote,
      userPublicKey: request.walletAddress,
      wrapAndUnwrapSol: true,
      computeUnitPriceMicroLamports: request.computeUnitPrice,
    });
    
    return await this.signAndSend(swapTransaction);
  }
}
```

### Pool Implementation (Raydium, Meteora, Uniswap)

These connectors will only implement 2 endpoints in their respective type folders:

```typescript
// Raydium AMM Implementation
class RaydiumAMM {
  // Quote serves as both price and executable quote
  async quoteSwap(request: AMM.QuoteSwapRequest) {
    const pool = await this.getPool(request.poolAddress);
    
    // Simple AMM calculation
    const quote = this.sdk.liquidity.computeAmountOut({
      poolInfo: pool,
      amountIn: request.amount,
      slippage: request.slippagePct
    });
    
    return {
      amountIn: quote.amountIn,
      amountOut: quote.amountOut,
      minAmountOut: quote.minAmountOut,
      price: quote.executionPrice,
      priceImpact: quote.priceImpact,
      fee: pool.fees,
      computeUnits: 300000
    };
  }
  
  // Direct execution without caching
  async executeSwap(request: AMM.ExecuteSwapRequest) {
    const quote = await this.quoteSwap(request);
    
    const { transaction } = await this.sdk.liquidity.swap({
      poolInfo: pool,
      ...quote,
      fixedSide: request.side
    });
    
    return await this.signAndSend(transaction);
  }
}

// Meteora CLMM Implementation
class MeteoraClMM {
  async quoteSwap(request: CLMM.QuoteSwapRequest) {
    const dlmmPool = await this.getDLMMPool(request.poolAddress);
    
    // CLMM calculation with tick traversal
    const quote = request.side === 'SELL' 
      ? await dlmmPool.swapQuote(request.amount)
      : await dlmmPool.swapQuoteExactOut(request.amount);
    
    return {
      ...formatCLMMQuote(quote),
      ticksCrossed: quote.ticksCrossed,
      currentTick: dlmmPool.activeId,
      sqrtPriceX64: dlmmPool.sqrtPriceX64
    };
  }
  
  async executeSwap(request: CLMM.ExecuteSwapRequest) {
    const dlmmPool = await this.getDLMMPool(request.poolAddress);
    
    const tx = request.side === 'SELL'
      ? await dlmmPool.swap(request.amount)
      : await dlmmPool.swapExactOut(request.amount);
      
    return await this.signAndSend(tx);
  }
}
```

### Key Architecture Benefits

1. **Clear Separation**: Aggregators and pools have different needs and capabilities
2. **Type Safety**: Each connector type uses schemas specific to its operations
3. **No Over-Engineering**: Pool connectors don't implement unnecessary endpoints
4. **Simpler Routes**: Pool routes stay in their type folders (amm/, clmm/)
5. **Future Flexibility**: Easy to add pool-specific features to respective schemas

## Implementation Strategy

### Phase 1: Schema Updates (Week 1)
1. **Update `swap-schema.ts`**: 
   - Add new types for aggregators (GetPrice, GetQuote, ExecuteQuote, ExecuteSwap)
   - Keep backward compatibility temporarily
   
2. **Update `amm-schema.ts`**:
   - Add QuoteSwapRequest/Response
   - Add ExecuteSwapRequest/Response
   - Ensure compatibility with existing AMM operations
   
3. **Update `clmm-schema.ts`**:
   - Add QuoteSwapRequest/Response with CLMM-specific fields
   - Add ExecuteSwapRequest/Response with CLMM-specific data
   - Maintain consistency with position management schemas

### Phase 2: Aggregator Updates (Week 2)
1. **Jupiter (`/connectors/jupiter/swap/`)**:
   - Implement 4 new endpoints
   - Add quote caching with Redis/in-memory fallback
   - Update route registration in `jupiter.routes.ts`

2. **0x (`/connectors/0x/swap/`)**:
   - Map existing price/quote APIs to new endpoints
   - Implement quote caching
   - Update route registration

### Phase 3: Pool Connector Updates (Week 3)
1. **Raydium**:
   - Move swap routes from using `swap-schema.ts` to `amm-schema.ts` (AMM)
   - Move swap routes from using `swap-schema.ts` to `clmm-schema.ts` (CLMM)
   - No new endpoints needed
   
2. **Meteora**:
   - Update imports to use `clmm-schema.ts` for swap operations
   - Add CLMM-specific response fields
   
3. **Uniswap**:
   - Keep Universal Router in `/swap/` with aggregator pattern
   - Move V2 routes to use `amm-schema.ts`
   - Move V3 routes to use `clmm-schema.ts`

### Phase 4: Migration & Cleanup (Week 4)
1. Remove old schemas from `swap-schema.ts`
2. Update all tests to use new schemas
3. Update API documentation
4. Deploy with clear migration guide

## Critical Design Decision: baseToken/quoteToken vs tokenIn/tokenOut

### The Fundamental Tension

1. **Pool Perspective**: Pools have fixed `baseToken` and `quoteToken` properties
   - SOL/USDC pool: SOL is always base, USDC is always quote
   - All pool operations (liquidity, positions) use this fixed reference
   - Configuration files, pool info, and SDK methods all use base/quote

2. **Swap Perspective**: Swaps have dynamic `tokenIn` and `tokenOut` based on direction
   - SELL: tokenIn = baseToken, tokenOut = quoteToken
   - BUY: tokenIn = quoteToken, tokenOut = baseToken
   - More intuitive for swap operations

### Options Analysis

#### Option 1: Full Migration to tokenIn/tokenOut ❌
```typescript
// Everything uses tokenIn/tokenOut
pool.tokenIn = "SOL"     // What does this mean for a pool?
pool.tokenOut = "USDC"   // Pools don't have direction!
```
**Problems**: Pools lose semantic meaning, liquidity operations become nonsensical

#### Option 2: Split Approach (Original Plan) ⚠️
```typescript
// Pools keep base/quote
pool.baseToken = "SOL"
pool.quoteToken = "USDC"

// Swaps use tokenIn/tokenOut
swap.tokenIn = "SOL"
swap.tokenOut = "USDC"
```
**Problems**: 
- Mental mapping overhead
- Confusion when baseToken ≠ tokenIn
- Two naming conventions in one codebase

#### Option 3: Keep baseToken/quoteToken Everywhere ✅ (Recommended)
```typescript
// Everything uses base/quote with clear side semantics
swap.baseToken = "SOL"
swap.quoteToken = "USDC"
swap.side = "SELL"  // Selling base for quote
```
**Benefits**:
- Consistent with DEX standards (Uniswap, Serum, etc.)
- Minimal breaking changes
- One mental model for entire codebase
- Pool structure remains clear

### Recommendation: Keep baseToken/quoteToken

Instead of changing terminology, we should:

1. **Enhance Clarity with Documentation**
   ```typescript
   side: Type.Enum({ 
     BUY: 'BUY',   // Buy baseToken with quoteToken
     SELL: 'SELL'  // Sell baseToken for quoteToken
   }, { description: 'BUY: purchase baseToken, SELL: sell baseToken' })
   ```

2. **Add Computed Helpers**
   ```typescript
   // Helper functions for swap operations
   function getTokenIn(baseToken: string, quoteToken: string, side: string) {
     return side === 'SELL' ? baseToken : quoteToken;
   }
   
   function getTokenOut(baseToken: string, quoteToken: string, side: string) {
     return side === 'SELL' ? quoteToken : baseToken;
   }
   ```

3. **Enhanced Response Fields**
   ```typescript
   // Swap responses can include both for clarity
   SwapResponse = {
     baseToken: "SOL",
     quoteToken: "USDC",
     side: "SELL",
     // Computed for convenience
     tokenIn: "SOL",    // = baseToken when SELL
     tokenOut: "USDC",  // = quoteToken when SELL
     amountIn: 10,
     amountOut: 980
   }
   ```

### Downstream Implications of Keeping base/quote

✅ **No Changes Needed**:
- Pool configurations (YAML files)
- Token lists
- Existing SDK integrations  
- Position management
- Liquidity operations
- Database schemas

⚠️ **Minor Updates**:
- Add helper functions for token direction
- Enhance documentation
- Include computed tokenIn/tokenOut in responses

### Why This is the Right Choice

1. **Industry Standard**: Every major DEX uses base/quote terminology
2. **Conceptual Integrity**: Pools have fixed base/quote pairs
3. **Minimize Breaking Changes**: Existing integrations continue working
4. **Clear Mental Model**: One consistent paradigm across all operations
5. **Backwards Compatible**: Can add tokenIn/tokenOut as computed fields

### Updated Schema Approach

```typescript
// AMM Schema - Preserves base/quote
export const QuoteSwapRequest = Type.Object({
  network: Type.String(),
  poolAddress: Type.String(),
  baseToken: Type.String({ description: 'Base token of the pool' }),
  quoteToken: Type.String({ description: 'Quote token of the pool' }),
  amount: Type.Number(),
  side: Type.Enum({ 
    BUY: 'BUY',   // Buy baseToken using quoteToken
    SELL: 'SELL'  // Sell baseToken for quoteToken
  }),
  slippagePct: Type.Optional(Type.Number()),
});

// Response includes computed fields for clarity
export const QuoteSwapResponse = Type.Object({
  // Core pool reference
  poolAddress: Type.String(),
  baseToken: Type.String(),
  quoteToken: Type.String(),
  
  // Swap specifics
  side: Type.String(),
  tokenIn: Type.String(),    // Computed from baseToken/quoteToken + side
  tokenOut: Type.String(),   // Computed from baseToken/quoteToken + side
  amountIn: Type.Number(),
  amountOut: Type.Number(),
  
  // Rest of response...
});
```

## Breaking Changes

### Aggregator Connectors (Jupiter, 0x)
1. **New Endpoints**:
   - ADD: `/connectors/{dex}/swap/get-price`
   - ADD: `/connectors/{dex}/swap/get-quote`  
   - ADD: `/connectors/{dex}/swap/execute-quote`
   - CHANGE: `/connectors/{dex}/swap/execute-swap` (enhanced schema)
   - REMOVE: `/connectors/{dex}/swap/quote-swap`

2. **Schema Changes**:
   - Responses now include computed `tokenIn`/`tokenOut` fields alongside `baseToken`/`quoteToken`
   - New response structures with route details
   - Quote caching via `quoteId`
   - Enhanced documentation for `side` parameter

### Pool Connectors (Raydium, Meteora, Uniswap AMM/CLMM)
1. **Endpoint Changes**:
   - KEEP: `/connectors/{dex}/{type}/quote-swap`
   - KEEP: `/connectors/{dex}/{type}/execute-swap`
   - Schema location moves from `swap-schema.ts` to `amm-schema.ts` or `clmm-schema.ts`

2. **Schema Changes**:
   - Responses now include computed `tokenIn`/`tokenOut` fields alongside `baseToken`/`quoteToken`
   - Pool-specific fields added (e.g., ticksCrossed for CLMM)
   - Enhanced documentation for `side` parameter

### Uniswap Special Case
- Universal Router (swap/) follows aggregator pattern (4 endpoints)
- V2 (amm/) uses `amm-schema.ts` (2 endpoints)
- V3 (clmm/) uses `clmm-schema.ts` (2 endpoints)

## Migration Path

### Current State → Future State

| Connector | Current | Future | Changes |
|-----------|---------|--------|---------|
| **Jupiter** | `/swap/quote-swap`<br>`/swap/execute-swap` | `/swap/get-price`<br>`/swap/get-quote`<br>`/swap/execute-quote`<br>`/swap/execute-swap` | Add 3 new endpoints<br>Update execute-swap schema |
| **0x** | `/swap/quote-swap`<br>`/swap/execute-swap` | `/swap/get-price`<br>`/swap/get-quote`<br>`/swap/execute-quote`<br>`/swap/execute-swap` | Add 3 new endpoints<br>Update execute-swap schema |
| **Raydium AMM** | `/amm/quote-swap`<br>`/amm/execute-swap` | `/amm/quote-swap`<br>`/amm/execute-swap` | Change schema import only |
| **Raydium CLMM** | `/clmm/quote-swap`<br>`/clmm/execute-swap` | `/clmm/quote-swap`<br>`/clmm/execute-swap` | Change schema import only |
| **Meteora** | `/clmm/quote-swap`<br>`/clmm/execute-swap` | `/clmm/quote-swap`<br>`/clmm/execute-swap` | Change schema import only |
| **Uniswap Router** | `/swap/quote-swap`<br>`/swap/execute-swap` | `/swap/get-price`<br>`/swap/get-quote`<br>`/swap/execute-quote`<br>`/swap/execute-swap` | Add 3 new endpoints<br>Update execute-swap schema |
| **Uniswap V2** | `/amm/quote-swap`<br>`/amm/execute-swap` | `/amm/quote-swap`<br>`/amm/execute-swap` | Change schema import only |
| **Uniswap V3** | `/clmm/quote-swap`<br>`/clmm/execute-swap` | `/clmm/quote-swap`<br>`/clmm/execute-swap` | Change schema import only |

## Technical Considerations

### Quote Caching
- Implement Redis/in-memory cache for quotes
- TTL based on blockchain (Solana: 30s, Ethereum: 2min)
- Quote ID generation: `{dex}_{network}_{timestamp}_{hash}`

### Performance Optimization
- Price endpoint should be <100ms response time
- Reuse connections and instances
- Implement request coalescing for popular pairs

### Error Handling
- Standardize error codes across all endpoints
- Provide clear messages for quote expiration
- Handle slippage violations gracefully

## Testing Strategy

1. **Unit Tests**: Schema validation, quote caching
2. **Integration Tests**: Each endpoint for each DEX
3. **E2E Tests**: Full flow from price to execution
4. **Performance Tests**: Response time requirements

## API Examples

### Aggregator Examples (Jupiter, 0x)

```typescript
// 1. Get Price - Fast indicative pricing
const price = await gateway.get('/connectors/jupiter/swap/get-price', {
  network: 'mainnet',
  baseToken: 'SOL',
  quoteToken: 'USDC',
  amount: 10,
  side: 'SELL'  // Selling SOL for USDC
});
// Response: { 
//   baseToken: 'SOL', quoteToken: 'USDC', side: 'SELL',
//   tokenIn: 'SOL', tokenOut: 'USDC',  // Computed fields
//   price: 98.5, amountIn: 10, amountOut: 985, priceImpact: 0.1 
// }

// 2. Get Quote - Full executable quote
const quote = await gateway.get('/connectors/jupiter/swap/get-quote', {
  network: 'mainnet',
  baseToken: 'SOL',
  quoteToken: 'USDC',
  amount: 10,
  side: 'SELL',  // Selling SOL for USDC
  slippagePct: 0.5
});
// Response includes: quoteId, route details, gas estimates, validUntil
// Plus computed tokenIn='SOL', tokenOut='USDC'

// 3. Execute Quote - Execute pre-fetched quote
const result = await gateway.post('/connectors/jupiter/swap/execute-quote', {
  walletAddress: '7EH...3Xf',
  quoteId: quote.quoteId,
  priorityFee: { level: 'high' }
});

// 4. Execute Swap - One-step quote and execute
const result = await gateway.post('/connectors/0x/swap/execute-swap', {
  walletAddress: '0x123...',
  network: 'ethereum',
  baseToken: 'WETH',
  quoteToken: 'USDC',
  amount: 1,
  side: 'SELL',  // Selling WETH for USDC
  slippagePct: 1.0
});
```

### Pool Examples (Raydium, Meteora, Uniswap)

```typescript
// AMM Example (Raydium)
// 1. Quote Swap
const quote = await gateway.get('/connectors/raydium/amm/quote-swap', {
  network: 'mainnet',
  poolAddress: 'HZ1...8jY',
  baseToken: 'SOL',    // Pool's base token
  quoteToken: 'USDC',  // Pool's quote token
  amount: 10,
  side: 'SELL'  // Selling SOL for USDC
});
// Response includes computed tokenIn='SOL', tokenOut='USDC'

// 2. Execute Swap
const result = await gateway.post('/connectors/raydium/amm/execute-swap', {
  walletAddress: '7EH...3Xf',
  network: 'mainnet',
  poolAddress: 'HZ1...8jY',
  baseToken: 'SOL',
  quoteToken: 'USDC',
  amount: 10,
  side: 'SELL',
  slippagePct: 0.5
});

// CLMM Example (Meteora) - BUY side
// 1. Quote Swap
const quote = await gateway.get('/connectors/meteora/clmm/quote-swap', {
  network: 'mainnet',
  poolAddress: 'LBU...oti',
  baseToken: 'USDC',   // Pool's base token
  quoteToken: 'USDT',  // Pool's quote token
  amount: 1000,
  side: 'BUY'  // Buying USDC with USDT
});
// Response includes:
// - computed tokenIn='USDT', tokenOut='USDC' 
// - CLMM-specific fields: ticksCrossed, currentTick

// 2. Execute Swap
const result = await gateway.post('/connectors/meteora/clmm/execute-swap', {
  walletAddress: '7EH...3Xf',
  network: 'mainnet',
  poolAddress: 'LBU...oti',
  baseToken: 'USDC',
  quoteToken: 'USDT',
  amount: 1000,
  side: 'BUY'
});
```

## Benefits

1. **Proper Separation**: Aggregators and pools have fundamentally different architectures
2. **Type Safety**: Each connector type uses schemas designed for its operations
3. **No Over-Engineering**: Pool connectors don't implement endpoints they don't need
4. **Cleaner Organization**: Swap operations stay within their type-specific schemas
5. **Better Performance**: Aggregators can optimize their API usage patterns
6. **Future Flexibility**: Easy to add type-specific features without affecting others

## Risks and Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking changes | High | Dual support, clear migration path |
| Quote staleness | Medium | Implement TTL, validation on execute |
| Increased complexity | Medium | Comprehensive documentation, examples |
| Performance regression | Low | Benchmark all changes, optimize critical paths |

## Implementation Details

### Files Changed/Created

#### New Schema Files
- `/src/schemas/swap-schema.ts` - Refactored with 4 aggregator endpoint schemas
- `/src/schemas/amm-schema.ts` - Added AMM swap schemas (QuoteSwapRequest/Response, ExecuteSwapRequest/Response)
- `/src/schemas/clmm-schema.ts` - Added CLMM swap schemas with CLMM-specific fields

#### New Aggregator Routes (v2)
- `/src/connectors/0x/swap-routes-v2/`
  - `get-price.ts` - Lightweight price discovery
  - `get-quote.ts` - Full quote with caching
  - `execute-quote.ts` - Execute cached quote
  - `execute-swap.ts` - One-step quote and execute
  - `schemas.ts` - 0x-specific extensions

- `/src/connectors/jupiter/swap-routes-v2/`
  - `get-price.ts` - Fast price endpoint
  - `get-quote.ts` - Quote with route details
  - `execute-quote.ts` - Execute from cache
  - `execute-swap.ts` - Direct swap
  - `schemas.ts` - Jupiter-specific extensions

#### Updated Pool Routes
- `/src/connectors/raydium/amm-routes/`
  - `quoteSwap.ts` - Updated to use AMM schema
  - `executeSwap.ts` - Updated imports and types
  - `schemas.ts` - Raydium AMM extensions

- `/src/connectors/raydium/clmm-routes/`
  - `quoteSwap.ts` - Updated to use CLMM schema
  - `executeSwap.ts` - Updated with CLMM fields
  - `schemas.ts` - Raydium CLMM extensions

- `/src/connectors/uniswap/`
  - `amm-routes/` - Updated to use AMM schemas
  - `clmm-routes/` - Updated to use CLMM schemas
  - `swap-routes/` - Kept for Universal Router (aggregator pattern)

- `/src/connectors/meteora/clmm-routes/`
  - `executeSwap.ts` - Updated to use CLMM schema
  - `schemas.ts` - Meteora-specific extensions

### Technical Implementation Highlights

1. **Quote Caching**: Implemented in-memory cache with 30-second TTL for aggregators
   ```typescript
   const quoteCache = new Map<string, { quote: any; timestamp: number; request: any }>();
   ```

2. **Schema Extensions**: Each connector extends base schemas with specific fields
   ```typescript
   export const JupiterGetQuoteRequest = Type.Intersect([
     GetQuoteRequest,
     Type.Object({
       onlyDirectRoutes: Type.Optional(Type.Boolean()),
       priorityFeeLamports: Type.Optional(Type.Number()),
     })
   ]);
   ```

3. **Computed Fields**: Responses include both semantic pool fields and directional swap fields
   ```typescript
   return {
     baseToken: 'SOL',
     quoteToken: 'USDC',
     side: 'SELL',
     // Computed for clarity
     tokenIn: 'SOL',
     tokenOut: 'USDC',
     tokenInAmount: 10,
     tokenOutAmount: 980
   };
   ```

### Migration Impact

- **Breaking Changes for Aggregators**: New endpoint structure, must migrate clients
- **Minimal Changes for Pools**: Same endpoints, just different schema imports
- **Backward Compatibility**: Old endpoints removed for aggregators, preserved for pools

## Timeline

- **Completed**: Schema updates and all connector implementations
- **Completed**: ~50 TypeScript errors fixed across all connectors
- **Completed**: Test file creation for new routes
- **Pending**: Full test coverage and documentation updates

## Conclusion

This refactor achieves three key objectives:

1. **Preserves DEX Standards**: By keeping `baseToken`/`quoteToken` terminology, we maintain consistency with industry standards and minimize breaking changes across the codebase.

2. **Improves Clarity**: Adding computed `tokenIn`/`tokenOut` fields in responses provides the intuitive swap direction while preserving the pool's semantic structure.

3. **Respects Architecture Differences**: 
   - **Aggregators** (Jupiter, 0x): Enhanced 4-endpoint pattern in `swap-schema.ts` that leverages their API capabilities
   - **Pool-based DEXs** (Raydium, Meteora, Uniswap AMM/CLMM): Simpler 2-endpoint pattern in their respective schemas that matches their direct pool interaction model

This approach provides the best of both worlds: maintaining consistency with existing DEX conventions while improving developer experience through clearer swap semantics.