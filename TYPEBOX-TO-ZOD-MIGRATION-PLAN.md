# Gateway TypeBox to Zod Migration Plan

## Quick Start Guide

### What This Document Contains
1. **Detailed migration plan** for ~100 routes across 14 modules
2. **Step-by-step TODOs** for each phase and module
3. **Code examples** for validation system and error handling
4. **Rollback procedures** and monitoring strategies
5. **Timeline and resource estimates** (8 weeks total)

### Master TODO List
- [ ] **Phase 0** (Week 1): Setup infrastructure and tooling
- [ ] **Phase 1** (Week 2): Build validation system and adapters
- [ ] **Phase 2** (Week 3-4): Migrate non-critical modules (config, tokens, wallets, pools)
- [ ] **Phase 3** (Week 5): Migrate chain modules (Ethereum, Solana)
- [ ] **Phase 4** (Week 6-7): Migrate DEX connectors (0x, Jupiter, Uniswap, Meteora, Raydium)
- [ ] **Phase 5** (Week 8): Cleanup, optimization, and MCP integration

### Migration Order (Risk-Based)
1. **Lowest Risk**: Config, Tokens → Test validation system
2. **Low Risk**: Wallets, Pools → Test encryption/security
3. **Medium Risk**: Chains → Test blockchain integration
4. **Highest Risk**: DEX Connectors → Test trading operations

### Key Decisions Made
- **Full migration** to Zod with no rollback
- **Minimal setup** using fastify-type-provider-zod
- **Module-by-module** approach for systematic progress
- **Simple error handling** that matches existing format

## Executive Summary

This document provides a comprehensive migration plan for transitioning Gateway's type system from TypeBox to Zod, enabling unified type validation with the MCP integration.

## Current State

### Gateway (Core)
- **Type System**: TypeBox (`@sinclair/typebox`)
- **Usage**: All API schemas, request/response validation
- **Integration**: Fastify's built-in TypeBox support
- **Files Affected**: ~50+ schema files across chains, connectors, wallets, tokens
- **Dependencies**: Deep integration with Fastify's schema validation

### MCP (Model Context Protocol)
- **Type System**: Zod
- **Usage**: Tool parameter validation, schema definitions
- **Integration**: Standalone validation in MCP server
- **Files Affected**: ~10 files in src/mcp/

## Analysis: TypeBox vs Zod

### TypeBox (Current)
**Pros:**
- Native Fastify integration (zero-overhead validation)
- JSON Schema compatible (OpenAPI generation)
- Smaller bundle size (~50KB)
- Type inference works well with TypeScript
- Static schema compilation for performance

**Cons:**
- Less expressive than Zod
- Smaller ecosystem
- More verbose for complex validations
- Limited transformation capabilities

### Zod
**Pros:**
- More expressive and intuitive API
- Better error messages
- Rich transformation and parsing capabilities
- Larger ecosystem and community
- Better for complex validation logic
- Runtime type safety with parsing

**Cons:**
- No native Fastify integration
- Larger bundle size (~200KB)
- Performance overhead (runtime parsing)
- Would require custom Fastify integration

## Migration Options

### Option 1: Full Migration to Zod
Migrate entire Gateway codebase from TypeBox to Zod.

**Pros:**
- Single type system across Gateway and MCP
- Better developer experience
- More powerful validation capabilities

**Cons:**
- Major breaking change
- Significant development effort (2-4 weeks)
- Performance implications
- Loss of native Fastify integration

### Option 2: Gradual Migration with Interop Layer
Create adapters to use both systems during transition.

**Pros:**
- No breaking changes
- Can migrate incrementally
- Test both systems side-by-side

**Cons:**
- Maintains two systems temporarily
- Additional complexity
- Longer migration timeline

### Option 3: Keep Dual System with Better Integration
Maintain TypeBox in Gateway, Zod in MCP, but improve integration.

**Pros:**
- No migration needed
- Best tool for each use case
- Maintains performance

**Cons:**
- Two type systems to maintain
- Potential for schema drift

### Option 4: Migrate MCP to TypeBox
Change MCP to use TypeBox instead of Zod.

**Pros:**
- Single type system
- No Gateway changes needed
- Maintains performance

**Cons:**
- Less expressive for MCP use cases
- MCP code becomes more verbose

## Recommended Approach: Full Migration with Minimal Complexity

Using `fastify-type-provider-zod` for the simplest integration possible, we'll migrate module by module with immediate TypeBox removal.

## Detailed Migration Plan by Module

### Module Inventory
- **Total Routes**: ~95-100 endpoints
- **Total Schema Files**: 16 core + ~50 route-specific schemas
- **Modules**: 7 core + 2 chains + 5 connectors

### Phase 0: Prerequisites and Setup (Week 1)

#### 0.1 Dependencies and Tools
**TODO:**
- [ ] Add Zod dependencies: `pnpm add zod zod-to-json-schema`
- [ ] Add migration tools: `pnpm add -D @asteasolutions/zod-to-openapi`
- [ ] Create migration branch: `git checkout -b feat/zod-migration`
- [ ] Set up performance benchmarking tools

#### 0.2 Create Core Infrastructure
**TODO:**
- [ ] Create `src/schemas/zod/` directory structure
- [ ] Create `src/services/validation/` for new validation layer
- [ ] Create `src/utils/migration/` for migration utilities
- [ ] Set up parallel validation configuration

#### 0.3 Fastify Integration (Using fastify-type-provider-zod)
**TODO:**
- [ ] Install integration package: `pnpm add fastify-type-provider-zod`
- [ ] Create `src/services/validation/setup.ts` with minimal setup:
  ```typescript
  import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
  
  export function setupZodValidation(app: FastifyInstance) {
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    return app.withTypeProvider<ZodTypeProvider>();
  }
  ```
- [ ] Test with simple health endpoint
- [ ] Document usage pattern for route files

### Phase 1: Foundation Infrastructure (Week 2)

#### 1.1 Simple Error Formatting
**TODO:**
```typescript
// src/services/validation/error-formatter.ts
- [ ] Create simple error formatter:
  - [ ] Format Zod errors to readable messages
  - [ ] Match existing Gateway error format
  - [ ] Keep error messages concise
```

#### 1.2 Update Main App Setup
**TODO:**
```typescript
// src/app.ts
- [ ] Import setupZodValidation
- [ ] Apply to main Fastify instance
- [ ] Test existing routes still work
- [ ] Add global error handler for ZodError
```

#### 1.3 Migration Utilities
**TODO:**
```typescript
// src/utils/migration/typebox-to-zod.ts
- [ ] Create automated conversion functions:
  - [ ] convertTypeboxString() -> z.string()
  - [ ] convertTypeboxNumber() -> z.number()
  - [ ] convertTypeboxObject() -> z.object()
  - [ ] convertTypeboxArray() -> z.array()
  - [ ] convertTypeboxUnion() -> z.union()
  - [ ] convertTypeboxEnum() -> z.enum()
```

#### 1.4 Testing Framework
**TODO:**
- [ ] Create simple validation tests for Zod schemas
- [ ] Add performance benchmarking script
- [ ] Test error message format matches existing API
- [ ] Create integration test with sample route

### Phase 2: Non-Critical Routes Migration (Week 3-4)

#### 2.1 Config Module Migration (2 routes)
**TODO:**
```
src/config/
- [ ] Create Zod schemas in config.schemas.ts:
  - [ ] ConfigQuerySchema
  - [ ] ConfigResponseSchema
  - [ ] NamespaceResponseSchema
- [ ] Update config.routes.ts to use withTypeProvider
- [ ] Update namespace.routes.ts to use withTypeProvider
- [ ] Remove TypeBox imports and schemas
- [ ] Update tests in test/config/
```

#### 2.2 Tokens Module Migration (4 routes)
**TODO:**
```
src/tokens/
- [ ] Migrate schemas.ts:
  - [ ] TokenSchema -> z.object()
  - [ ] TokenListQuerySchema -> z.object()
  - [ ] TokenViewQuerySchema -> z.object()
  - [ ] TokenAddRequestSchema -> z.object()
  - [ ] TokenRemoveQuerySchema -> z.object()
- [ ] Update tokens.routes.ts to use Zod schemas
- [ ] Migrate individual route files:
  - [ ] routes/list.ts
  - [ ] routes/view.ts
  - [ ] routes/add.ts
  - [ ] routes/remove.ts
- [ ] Update tests in test/tokens/
```

#### 2.3 Wallet Module Migration (6 routes)
**TODO:**
```
src/wallet/
- [ ] Migrate schemas.ts:
  - [ ] WalletAddressSchema -> z.string()
  - [ ] AddWalletRequestSchema -> z.object()
  - [ ] AddWalletResponseSchema -> z.object()
  - [ ] GetWalletResponseSchema -> z.object()
  - [ ] RemoveWalletRequestSchema -> z.object()
  - [ ] SignMessageRequestSchema -> z.object()
- [ ] Update wallet.routes.ts
- [ ] Migrate route files:
  - [ ] routes/add.ts
  - [ ] routes/list.ts
  - [ ] routes/remove.ts
  - [ ] routes/sign-message.ts
  - [ ] routes/add-read-only.ts
  - [ ] routes/remove-read-only.ts
- [ ] Update wallet encryption/decryption logic
```

#### 2.4 Pools Module Migration (4 routes)
**TODO:**
```
src/pools/
- [ ] Create Zod schemas for pools
- [ ] Migrate pools.routes.ts
- [ ] Update pool calculation logic
- [ ] Add validation tests
```

### Phase 3: Chain Routes Migration (Week 5)

#### 3.1 Core Chain Schemas
**TODO:**
```
src/schemas/
- [ ] Migrate chain-schema.ts:
  - [ ] EstimateGasRequestSchema -> z.object()
  - [ ] EstimateGasResponseSchema -> z.object()
  - [ ] BalanceRequestSchema -> z.object()
  - [ ] BalanceResponseSchema -> z.object()
  - [ ] TokensRequestSchema -> z.object()
  - [ ] TokensResponseSchema -> z.object()
  - [ ] PollRequestSchema -> z.object()
  - [ ] PollResponseSchema -> z.object()
  - [ ] StatusRequestSchema -> z.object()
  - [ ] StatusResponseSchema -> z.object()
  - [ ] NetworkSelectionSchema -> z.object()
  - [ ] AllowancesRequestSchema -> z.object()
  - [ ] AllowancesResponseSchema -> z.object()
  - [ ] ApproveRequestSchema -> z.object()
  - [ ] ApproveResponseSchema -> z.object()
```

#### 3.2 Ethereum Chain Routes (7 routes)
**TODO:**
```
src/chains/ethereum/
- [ ] Update ethereum.routes.ts
- [ ] Migrate individual routes:
  - [ ] routes/status.ts
  - [ ] routes/balances.ts
  - [ ] routes/poll.ts
  - [ ] routes/allowances.ts
  - [ ] routes/approve.ts
  - [ ] routes/estimate-gas.ts
  - [ ] routes/wrap.ts
- [ ] Update Ethereum-specific validation
- [ ] Test with mainnet and testnet
```

#### 3.3 Solana Chain Routes (4 routes)
**TODO:**
```
src/chains/solana/
- [ ] Update solana.routes.ts
- [ ] Migrate individual routes:
  - [ ] routes/status.ts
  - [ ] routes/balances.ts
  - [ ] routes/poll.ts
  - [ ] routes/estimate-gas.ts
- [ ] Update Solana-specific validation
- [ ] Test with mainnet-beta and devnet
```

### Phase 4: Connector Routes Migration (Week 6-7)

#### 4.1 Core Trading Schemas
**TODO:**
```
src/schemas/
- [ ] Migrate router-schema.ts:
  - [ ] GetPriceRequest -> z.object()
  - [ ] GetPriceResponse -> z.object()
  - [ ] QuoteSwapRequest -> z.object()
  - [ ] QuoteSwapResponse -> z.object()
  - [ ] ExecuteQuoteRequest -> z.object()
  - [ ] ExecuteSwapRequest -> z.object()
  - [ ] SwapExecuteResponse -> z.object()
- [ ] Migrate amm-schema.ts (7 schemas)
- [ ] Migrate clmm-schema.ts (11 schemas)
```

#### 4.2 0x Connector (4 routes)
**TODO:**
```
src/connectors/0x/
- [ ] Update 0x.routes.ts
- [ ] Migrate router routes:
  - [ ] router-routes/quoteSwap.ts
  - [ ] router-routes/executeSwap.ts
  - [ ] router-routes/getPrice.ts
  - [ ] router-routes/executeQuote.ts
- [ ] Update 0x API integration
```

#### 4.3 Jupiter Connector (3 routes)
**TODO:**
```
src/connectors/jupiter/
- [ ] Update jupiter.routes.ts
- [ ] Migrate router routes:
  - [ ] router-routes/quoteSwap.ts
  - [ ] router-routes/executeSwap.ts
  - [ ] router-routes/executeQuote.ts
- [ ] Update Jupiter API integration
```

#### 4.4 Uniswap Connector (21 routes)
**TODO:**
```
src/connectors/uniswap/
- [ ] Update uniswap.routes.ts
- [ ] Migrate router routes (3 files)
- [ ] Migrate amm routes (7 files)
- [ ] Migrate clmm routes (11 files)
- [ ] Update Uniswap SDK integration
```

#### 4.5 Meteora Connector (11 routes)
**TODO:**
```
src/connectors/meteora/
- [ ] Update meteora.routes.ts
- [ ] Migrate clmm routes (11 files)
- [ ] Update Meteora SDK integration
```

#### 4.6 Raydium Connector (18 routes)
**TODO:**
```
src/connectors/raydium/
- [ ] Update raydium.routes.ts
- [ ] Migrate amm routes (7 files)
- [ ] Migrate clmm routes (11 files)
- [ ] Update Raydium SDK integration
```

### Phase 5: Cleanup and Optimization (Week 8)

#### 5.1 Remove TypeBox Dependencies
**TODO:**
- [ ] Remove @sinclair/typebox from package.json
- [ ] Remove all TypeBox imports
- [ ] Delete old TypeBox schema files
- [ ] Update build configuration

#### 5.2 Documentation Updates
**TODO:**
- [ ] Update API documentation
- [ ] Update developer guide
- [ ] Create Zod schema guide
- [ ] Update MCP integration docs

#### 5.3 Performance Optimization
**TODO:**
- [ ] Profile validation performance
- [ ] Optimize hot paths
- [ ] Implement caching for complex schemas
- [ ] Add lazy loading for large schemas

#### 5.4 MCP Integration
**TODO:**
- [ ] Update MCP to import Gateway schemas
- [ ] Remove duplicate MCP schemas
- [ ] Test MCP tools with new schemas
- [ ] Update MCP documentation

## Technical Implementation Details

### 1. Minimal Setup with fastify-type-provider-zod

#### 1.1 Initial Setup
```typescript
// src/services/validation/setup.ts
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import type { FastifyInstance } from 'fastify';

export function setupZodValidation(app: FastifyInstance) {
  // Add schema validator and serializer
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  
  // Return app with type provider
  return app.withTypeProvider<ZodTypeProvider>();
}
```

#### 1.2 Error Formatting
```typescript
// src/services/validation/error-formatter.ts
import { z } from 'zod';

export function formatZodError(error: z.ZodError): string {
  return error.errors
    .map(err => `${err.path.join('.')}: ${err.message}`)
    .join(', ');
}

// Add to main app error handler
export function setupErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Validation Error',
        message: formatZodError(error),
      });
    }
    
    // Fallback to existing error handling
    return reply.status(error.statusCode || 500).send({
      statusCode: error.statusCode || 500,
      error: error.name || 'Internal Server Error',
      message: error.message,
    });
  });
}
```

### 3. Migration Helpers

#### 3.1 Schema Converter
```typescript
// src/utils/migration/schema-converter.ts
import { Type, TSchema } from '@sinclair/typebox';
import { z } from 'zod';

export class SchemaConverter {
  static fromTypebox(schema: TSchema): z.ZodSchema {
    const { type } = schema;
    
    switch (type) {
      case 'string':
        return this.convertString(schema);
      case 'number':
        return this.convertNumber(schema);
      case 'boolean':
        return z.boolean();
      case 'object':
        return this.convertObject(schema);
      case 'array':
        return this.convertArray(schema);
      case 'union':
        return this.convertUnion(schema);
      default:
        throw new Error(`Unsupported TypeBox type: ${type}`);
    }
  }

  private static convertString(schema: any): z.ZodString {
    let zod = z.string();
    if (schema.minLength) zod = zod.min(schema.minLength);
    if (schema.maxLength) zod = zod.max(schema.maxLength);
    if (schema.pattern) zod = zod.regex(new RegExp(schema.pattern));
    if (schema.format === 'email') zod = zod.email();
    if (schema.format === 'uri') zod = zod.url();
    return zod;
  }

  private static convertNumber(schema: any): z.ZodNumber {
    let zod = z.number();
    if (schema.minimum !== undefined) zod = zod.min(schema.minimum);
    if (schema.maximum !== undefined) zod = zod.max(schema.maximum);
    if (schema.type === 'integer') zod = zod.int();
    return zod;
  }

  private static convertObject(schema: any): z.ZodObject<any> {
    const shape: Record<string, z.ZodSchema> = {};
    const required = new Set(schema.required || []);
    
    for (const [key, value] of Object.entries(schema.properties || {})) {
      const fieldSchema = this.fromTypebox(value as TSchema);
      shape[key] = required.has(key) ? fieldSchema : fieldSchema.optional();
    }
    
    return z.object(shape);
  }

  private static convertArray(schema: any): z.ZodArray<any> {
    const items = this.fromTypebox(schema.items);
    let zod = z.array(items);
    if (schema.minItems) zod = zod.min(schema.minItems);
    if (schema.maxItems) zod = zod.max(schema.maxItems);
    return zod;
  }

  private static convertUnion(schema: any): z.ZodUnion<any> {
    const schemas = schema.anyOf.map((s: TSchema) => this.fromTypebox(s));
    return z.union(schemas as [z.ZodSchema, z.ZodSchema, ...z.ZodSchema[]]);
  }
}
```

### 2. Route Migration Example

#### 2.1 Before (TypeBox)
```typescript
// src/tokens/routes/list.ts (BEFORE)
import { Type } from '@sinclair/typebox';

const QuerySchema = Type.Object({
  chain: Type.Optional(Type.String()),
  network: Type.Optional(Type.String()),
  search: Type.Optional(Type.String()),
});

export const listTokens: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', {
    schema: {
      querystring: QuerySchema,
      response: {
        200: TokenListResponseSchema,
      },
    },
  }, async (request, reply) => {
    // handler implementation
  });
};
```

#### 2.2 After (Zod with fastify-type-provider-zod)
```typescript
// src/tokens/routes/list.ts (AFTER)
import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

const QuerySchema = z.object({
  chain: z.string().optional(),
  network: z.string().optional(),
  search: z.string().optional(),
});

const ResponseSchema = z.object({
  tokens: z.array(TokenSchema),
});

export const listTokens: FastifyPluginAsync = async (fastify) => {
  fastify.withTypeProvider<ZodTypeProvider>().get('/', {
    schema: {
      querystring: QuerySchema,
      response: {
        200: ResponseSchema,
      },
    },
  }, async (request, reply) => {
    // TypeScript knows request.query is validated
    const { chain, network, search } = request.query;
    
    // Handler implementation
    const tokens = await tokenService.list({ chain, network, search });
    
    // Response is automatically validated
    return { tokens };
  });
};
```

### 5. Testing Strategy

#### 5.1 Schema Equivalence Test
```typescript
// test/utils/schema-equivalence.test.ts
import { Type } from '@sinclair/typebox';
import { z } from 'zod';
import { SchemaConverter } from '../../src/utils/migration/schema-converter';

describe('Schema Equivalence', () => {
  test('TypeBox and Zod schemas validate same inputs', () => {
    // TypeBox schema
    const typeboxSchema = Type.Object({
      name: Type.String({ minLength: 1 }),
      age: Type.Number({ minimum: 0, maximum: 150 }),
      email: Type.Optional(Type.String({ format: 'email' })),
    });

    // Converted Zod schema
    const zodSchema = SchemaConverter.fromTypebox(typeboxSchema);

    // Test cases
    const validCases = [
      { name: 'John', age: 30 },
      { name: 'Jane', age: 25, email: 'jane@example.com' },
    ];

    const invalidCases = [
      { name: '', age: 30 }, // empty name
      { name: 'John', age: -1 }, // negative age
      { name: 'John', age: 30, email: 'invalid' }, // invalid email
    ];

    // Both should accept valid cases
    for (const testCase of validCases) {
      expect(() => zodSchema.parse(testCase)).not.toThrow();
    }

    // Both should reject invalid cases
    for (const testCase of invalidCases) {
      expect(() => zodSchema.parse(testCase)).toThrow();
    }
  });
});
```


## Migration Checklist Summary

### Pre-Migration Checklist
- [ ] All tests passing on main branch
- [ ] Performance benchmarks established
- [ ] Rollback plan documented
- [ ] Team training completed
- [ ] Monitoring alerts configured

### Per-Module Checklist Template
For each module migration:
- [ ] Create Zod schemas
- [ ] Update route handlers with type provider
- [ ] Remove TypeBox schemas
- [ ] Update and run tests
- [ ] Run performance benchmarks
- [ ] Deploy to staging
- [ ] Monitor for 24 hours
- [ ] Deploy to production


## Monitoring and Metrics

### Key Metrics to Track
```typescript
// src/services/validation/metrics.ts
export class ValidationMetrics {
  static trackValidation(
    route: string,
    validationType: 'typebox' | 'zod',
    duration: number,
    success: boolean
  ) {
    // Send to monitoring service
    metrics.histogram('validation.duration', duration, {
      route,
      type: validationType,
      success: success.toString(),
    });
  }
}
```

### Alerts to Configure
- Validation error rate > 5% (potential schema mismatch)
- Validation duration > 100ms (performance regression)
- Memory usage increase > 20% (potential memory leak)
- Route error rate > 1% (potential migration issue)

## Benefits After Migration

### For Developers
- **Better DX**: More intuitive schema definitions
- **Type Safety**: Stronger TypeScript integration
- **Error Messages**: Clearer validation errors
- **Transformations**: Built-in data transformation

### For MCP Integration
- **Unified Types**: Single source of truth
- **Direct Import**: No schema duplication
- **Type Inference**: Better autocomplete
- **Consistency**: Same validation everywhere

### Code Comparison

#### Before (TypeBox)
```typescript
const schema = Type.Object({
  amount: Type.Transform(
    Type.String({ pattern: '^[0-9]+\.?[0-9]*$' }),
    (value) => parseFloat(value)
  ),
  address: Type.String({ 
    pattern: '^0x[a-fA-F0-9]{40}$',
    description: 'Ethereum address'
  }),
  tokens: Type.Array(
    Type.Union([
      Type.String(),
      Type.Object({
        address: Type.String(),
        symbol: Type.String()
      })
    ])
  )
});
```

#### After (Zod)
```typescript
const schema = z.object({
  amount: z.string().regex(/^[0-9]+\.?[0-9]*$/).transform(parseFloat),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/).describe('Ethereum address'),
  tokens: z.array(
    z.union([
      z.string(),
      z.object({
        address: z.string(),
        symbol: z.string()
      })
    ])
  )
});

// With parsing and type inference
const parsed = schema.parse(data); // Type-safe result
```

## Final Migration Summary

### Total Scope
- **95-100 routes** across 14 modules
- **50+ schema files** to migrate
- **5 major connectors** with complex validation
- **2 blockchain integrations** to maintain

### Timeline
- **Week 1-2**: Infrastructure and tooling
- **Week 3-4**: Non-critical modules (config, tokens, wallets)
- **Week 5**: Chain modules (Ethereum, Solana)
- **Week 6-7**: Connector modules (DEX integrations)
- **Week 8**: Cleanup and optimization

### Success Criteria
- [ ] All routes using Zod validation
- [ ] No performance regression (< 10% overhead)
- [ ] All tests passing
- [ ] MCP fully integrated
- [ ] Documentation updated
- [ ] Team trained on Zod

### Long-term Maintenance
- Regular schema audits
- Performance monitoring
- Keep Zod updated
- Share schemas with frontend
- Consider code generation

## Conclusion

This migration plan provides a systematic approach to transitioning Gateway from TypeBox to Zod. The gradual migration strategy minimizes risk while the parallel validation ensures correctness. The end result will be a simpler, more maintainable validation system that unifies Gateway and MCP under a single type system.

The investment in this migration will pay dividends through:
- Improved developer experience
- Better error messages for API consumers  
- Unified type system with MCP
- More maintainable codebase
- Stronger type safety throughout

With careful execution and monitoring, this migration can be completed with minimal disruption to the service.

## Impact on MCP

### Immediate Benefits
1. Can directly import and use Gateway schemas
2. No more manual synchronization
3. Type safety across boundaries
4. Shared validation logic

### Migration Steps for MCP
1. Replace current schema.ts with imports from Gateway
2. Update tool definitions to use shared schemas
3. Remove duplicate type definitions
4. Add Gateway schemas as dependency

### Example Integration
```typescript
// src/mcp/toolDefinitions.ts
import { 
  ChainSchema,
  NetworkSchema,
  SwapSchema 
} from '../schemas';

export const TOOL_DEFINITIONS = {
  quote_swap: {
    name: 'quote_swap',
    description: 'Get a quote for swapping tokens',
    paramsSchema: SwapSchema.QuoteRequest,
  },
  // ...
};
```

## Risk Assessment

### High Risks
1. **Performance Degradation**: Zod is slower than TypeBox
   - Mitigation: Benchmark critical paths, optimize hot paths
   
2. **Breaking Changes**: Schema changes could break clients
   - Mitigation: Versioned APIs, backward compatibility layer

3. **Migration Bugs**: Subtle differences in validation
   - Mitigation: Comprehensive test suite, parallel validation

### Medium Risks
1. **Developer Learning Curve**: Team needs to learn Zod
   - Mitigation: Documentation, workshops, gradual rollout

2. **Increased Bundle Size**: Zod is larger
   - Mitigation: Tree shaking, lazy loading

### Low Risks
1. **Ecosystem Compatibility**: Some tools expect TypeBox
   - Mitigation: Maintain adapters where needed

## Alternative: Hybrid Approach

Instead of full migration, consider:

1. **Keep TypeBox for Fastify routes** (performance-critical)
2. **Use Zod for business logic** (complex validation)
3. **Share constants and enums** (single source of truth)
4. **Generate TypeBox from Zod** (or vice versa)

```typescript
// schemas/base/chain.ts
export const SUPPORTED_CHAINS = ['ethereum', 'solana'] as const;
export const ETHEREUM_NETWORKS = ['mainnet', 'sepolia', ...] as const;

// schemas/zod/chain.ts
import { z } from 'zod';
import { SUPPORTED_CHAINS } from '../base/chain';
export const ChainSchema = z.enum(SUPPORTED_CHAINS);

// schemas/typebox/chain.ts  
import { Type } from '@sinclair/typebox';
import { SUPPORTED_CHAINS } from '../base/chain';
export const ChainSchema = Type.Union(
  SUPPORTED_CHAINS.map(c => Type.Literal(c))
);
```

## Decision Criteria

Choose **Full Migration** if:
- MCP becomes the primary interface
- Complex validation needs increase
- Team prefers Zod's developer experience
- Performance is not critical

Choose **Hybrid Approach** if:
- Performance is critical
- Need to maintain backward compatibility
- Want benefits of both systems
- Have resources for dual maintenance

Choose **Status Quo** if:
- Current system works well
- Migration cost outweighs benefits
- Performance is paramount
- Team is comfortable with TypeBox

## Recommended Timeline

1. **Week 1-2**: Proof of concept, performance testing
2. **Week 3-4**: Decision and planning
3. **Week 5-8**: Implementation (if migrating)
4. **Week 9-10**: Testing and optimization
5. **Week 11-12**: Documentation and training

## Conclusion

While Zod offers better developer experience and would unify the type systems, the migration is a significant undertaking. The hybrid approach offers a good compromise, allowing both systems to coexist while sharing common definitions.

**My Recommendation**: Start with the hybrid approach, sharing constants and enums. This provides immediate benefits for MCP integration while preserving Gateway's performance. Based on real-world usage and performance metrics, you can later decide whether full migration is warranted.