# MCP Schema Integration Scenarios

This document illustrates how MCP schemas would look under different architectural decisions.

## Scenario 1: Full Zod Migration (Gateway moves to Zod)

```typescript
// src/mcp/schema.ts
export * from '../schemas/core';  // Just re-export Gateway's Zod schemas

// src/mcp/toolDefinitions.ts
import { z } from 'zod';
import { 
  ChainSchema,
  NetworkSchema,
  ConnectorSchema,
  SwapRequestSchema 
} from '../schemas';

export const TOOL_DEFINITIONS = {
  quote_swap: {
    name: 'quote_swap',
    description: 'Get a quote for swapping tokens',
    paramsSchema: SwapRequestSchema.pick({
      chain: true,
      network: true,
      connector: true,
      address: true,
      base: true,
      quote: true,
      amount: true,
      side: true,
      slippage: true,
    }),
  },
  // ... other tools directly use Gateway schemas
};
```

**Pros:**
- Zero duplication
- Perfect type safety
- Single source of truth

**Cons:**
- Gateway must complete migration first
- MCP blocked by Gateway migration

## Scenario 2: Hybrid Approach (Shared Constants)

```typescript
// src/schemas/constants.ts (shared by both Gateway and MCP)
export const CHAINS = {
  ethereum: 'ethereum',
  solana: 'solana',
} as const;

export const NETWORKS = {
  ethereum: ['mainnet', 'sepolia', 'arbitrum', 'avalanche', 'base', 'bsc', 'celo', 'optimism', 'polygon'] as const,
  solana: ['mainnet-beta', 'devnet'] as const,
} as const;

export const CONNECTORS = ['0x', 'uniswap', 'jupiter', 'meteora', 'raydium'] as const;

// src/mcp/schema.ts
import { z } from 'zod';
import { CHAINS, NETWORKS, CONNECTORS } from '../schemas/constants';

export const ParamChain = z.enum([CHAINS.ethereum, CHAINS.solana]);
export const ParamEthereumNetwork = z.enum(NETWORKS.ethereum);
export const ParamSolanaNetwork = z.enum(NETWORKS.solana);
export const ParamConnector = z.enum(CONNECTORS);

// src/schemas/chain-schema.ts (Gateway's TypeBox)
import { Type } from '@sinclair/typebox';
import { CHAINS, NETWORKS } from './constants';

export const ChainSchema = Type.Union([
  Type.Literal(CHAINS.ethereum),
  Type.Literal(CHAINS.solana),
]);
```

**Pros:**
- Shared source of truth for values
- Each system uses preferred validation library
- Can implement immediately
- Low risk

**Cons:**
- Still some duplication in schema definitions
- Need to maintain both validation libraries

## Scenario 3: Code Generation Approach

```typescript
// schemas/definitions/chain.yaml
chains:
  - ethereum
  - solana

networks:
  ethereum:
    - mainnet
    - sepolia
    - arbitrum
    # ... etc

connectors:
  - id: uniswap
    chain: ethereum
    types: [amm, clmm, router]
  - id: jupiter
    chain: solana
    types: [router]

// Generated: src/schemas/generated/zod/chain.ts
export const ChainSchema = z.enum(['ethereum', 'solana']);

// Generated: src/schemas/generated/typebox/chain.ts  
export const ChainSchema = Type.Union([
  Type.Literal('ethereum'),
  Type.Literal('solana'),
]);
```

**Pros:**
- Single source of truth
- Both libraries supported
- Easy to add new schemas

**Cons:**
- Build complexity
- Need code generation tooling

## Scenario 4: Runtime Adapter Pattern

```typescript
// src/schemas/adapters/zod-typebox.ts
export class SchemaAdapter {
  static zodFromTypebox<T>(typeboxSchema: TSchema): z.ZodSchema<T> {
    // Runtime conversion logic
  }
  
  static typeboxFromZod<T>(zodSchema: z.ZodSchema<T>): TSchema {
    // Runtime conversion logic
  }
}

// src/mcp/schema.ts
import { SchemaAdapter } from '../schemas/adapters/zod-typebox';
import * as GatewaySchemas from '../schemas/chain-schema';

export const ParamChain = SchemaAdapter.zodFromTypebox(
  GatewaySchemas.ChainSchema
);
```

**Pros:**
- Can reuse existing Gateway schemas
- No migration needed

**Cons:**
- Runtime overhead
- Complex adapter logic
- Potential for conversion errors

## Recommendation for MCP

Given these scenarios, here's my recommendation for MCP schemas based on your decision:

### If staying with TypeBox in Gateway:
Go with **Scenario 2 (Hybrid)** immediately:
1. Extract constants to shared files
2. Keep validation logic separate
3. Low effort, high benefit

### If migrating to Zod:
Start with **Scenario 2**, then move to **Scenario 1**:
1. Shared constants provide immediate benefit
2. Easy to switch to full schema sharing after migration
3. MCP can help test Zod schemas during migration

### For long-term maintenance:
Consider **Scenario 3 (Code Generation)**:
1. Most maintainable solution
2. Supports any schema library
3. Worth the setup cost for large projects

## Implementation Priority

1. **Immediate** (1 day): Extract shared constants
2. **Short-term** (1 week): Implement hybrid approach
3. **Medium-term** (1 month): Decide on full migration
4. **Long-term** (3 months): Consider code generation

This approach minimizes risk while providing immediate benefits for MCP integration.