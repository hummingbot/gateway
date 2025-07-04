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
- [ ] Add Zod dependencies: `pnpm add zod`
- [ ] Add Fastify integration: `pnpm add fastify-type-provider-zod`
- [ ] Create migration branch: `git checkout -b feat/zod-migration`
- [ ] Set up performance benchmarking tools
- [ ] Remove unused dependencies after migration:
  - [ ] DO NOT add zod-to-json-schema (building our own)
  - [ ] DO NOT add @asteasolutions/zod-to-openapi (building our own)

#### 0.2 Create Core Infrastructure
**TODO:**
- [ ] Create `src/schemas/zod/` directory structure
- [ ] Create `src/services/validation/` for new validation layer
- [ ] Create `src/services/openapi/` for OpenAPI generation
- [ ] Create `src/utils/migration/` for migration utilities
- [ ] Create `src/services/openapi/zod-to-json-schema.ts` for converter
- [ ] Create `src/services/openapi/generator.ts` for OpenAPI spec generation
- [ ] Create `src/services/openapi/fastify-integration.ts` for Fastify hooks

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

#### 1.2 OpenAPI Converter (In-house solution)
**TODO:**
```typescript
// src/services/openapi/zod-to-json-schema.ts
- [ ] Create ZodToJsonSchema converter class:
  - [ ] convertString() for string schemas
  - [ ] convertNumber() for number schemas  
  - [ ] convertBoolean() for boolean schemas
  - [ ] convertObject() for object schemas
  - [ ] convertArray() for array schemas
  - [ ] convertUnion() for union types
  - [ ] convertEnum() for enum types
  - [ ] convertOptional() for optional fields
  - [ ] convertNullable() for nullable types
  - [ ] convertLiteral() for literal values
  - [ ] convertTuple() for tuple types
  - [ ] convertRecord() for record types
  - [ ] convertIntersection() for intersection types
  - [ ] Handle default values and descriptions
  - [ ] Extract min/max, length constraints
  - [ ] Handle regex patterns
  - [ ] Support format hints (email, url, uuid)

// src/services/openapi/generator.ts
- [ ] Create OpenAPIGenerator class:
  - [ ] addRoute() method to register endpoints
  - [ ] generateSpec() method to build OpenAPI document
  - [ ] Integration with Fastify route hooks
  - [ ] Support for tags, security, examples
  - [ ] Handle request body, query, params, headers
  - [ ] Generate response schemas for all status codes
  - [ ] Support for multipart/form-data
  - [ ] Add operation IDs automatically
  - [ ] Include request/response examples

// src/services/openapi/fastify-integration.ts  
- [ ] Create setupOpenAPI function:
  - [ ] Hook into Fastify onRoute lifecycle
  - [ ] Extract Zod schemas from route options
  - [ ] Convert to OpenAPI on the fly
  - [ ] Register /openapi.json endpoint
  - [ ] Configure Swagger UI at /docs
```

**Implementation Code:**
```typescript
// src/services/openapi/zod-to-json-schema.ts
export class ZodToJsonSchema {
  static convert(schema: z.ZodType<any>): any {
    if (schema instanceof z.ZodString) {
      return this.convertString(schema);
    }
    if (schema instanceof z.ZodNumber) {
      return this.convertNumber(schema);
    }
    if (schema instanceof z.ZodBoolean) {
      return this.convertBoolean(schema);
    }
    if (schema instanceof z.ZodObject) {
      return this.convertObject(schema);
    }
    if (schema instanceof z.ZodArray) {
      return this.convertArray(schema);
    }
    if (schema instanceof z.ZodUnion) {
      return this.convertUnion(schema);
    }
    if (schema instanceof z.ZodEnum) {
      return this.convertEnum(schema);
    }
    if (schema instanceof z.ZodOptional) {
      return this.convertOptional(schema);
    }
    if (schema instanceof z.ZodNullable) {
      return this.convertNullable(schema);
    }
    if (schema instanceof z.ZodLiteral) {
      return this.convertLiteral(schema);
    }
    if (schema instanceof z.ZodTuple) {
      return this.convertTuple(schema);
    }
    if (schema instanceof z.ZodRecord) {
      return this.convertRecord(schema);
    }
    if (schema instanceof z.ZodIntersection) {
      return this.convertIntersection(schema);
    }
    if (schema instanceof z.ZodDefault) {
      return this.convertDefault(schema);
    }
    
    // Fallback
    return { type: 'any' };
  }

  private static convertString(schema: z.ZodString): any {
    const jsonSchema: any = { type: 'string' };
    
    // Extract constraints from Zod's internal checks
    const checks = (schema as any)._def.checks || [];
    
    for (const check of checks) {
      switch (check.kind) {
        case 'min':
          jsonSchema.minLength = check.value;
          break;
        case 'max':
          jsonSchema.maxLength = check.value;
          break;
        case 'length':
          jsonSchema.minLength = check.value;
          jsonSchema.maxLength = check.value;
          break;
        case 'regex':
          jsonSchema.pattern = check.regex.source;
          break;
        case 'email':
          jsonSchema.format = 'email';
          break;
        case 'url':
          jsonSchema.format = 'uri';
          break;
        case 'uuid':
          jsonSchema.format = 'uuid';
          break;
        case 'datetime':
          jsonSchema.format = 'date-time';
          break;
      }
    }
    
    // Add description if available
    if (schema.description) {
      jsonSchema.description = schema.description;
    }
    
    return jsonSchema;
  }

  private static convertNumber(schema: z.ZodNumber): any {
    const jsonSchema: any = { type: 'number' };
    
    const checks = (schema as any)._def.checks || [];
    
    for (const check of checks) {
      switch (check.kind) {
        case 'int':
          jsonSchema.type = 'integer';
          break;
        case 'min':
          jsonSchema.minimum = check.value;
          break;
        case 'max':
          jsonSchema.maximum = check.value;
          break;
        case 'multipleOf':
          jsonSchema.multipleOf = check.value;
          break;
      }
    }
    
    if (schema.description) {
      jsonSchema.description = schema.description;
    }
    
    return jsonSchema;
  }

  private static convertBoolean(schema: z.ZodBoolean): any {
    const jsonSchema: any = { type: 'boolean' };
    
    if (schema.description) {
      jsonSchema.description = schema.description;
    }
    
    return jsonSchema;
  }

  private static convertObject(schema: z.ZodObject<any>): any {
    const shape = schema.shape;
    const properties: any = {};
    const required: string[] = [];
    
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = this.convert(value as z.ZodType<any>);
      
      // Check if field is optional
      if (!(value instanceof z.ZodOptional) && 
          !(value instanceof z.ZodDefault) &&
          !(value instanceof z.ZodNullable)) {
        required.push(key);
      }
    }
    
    const jsonSchema: any = {
      type: 'object',
      properties,
    };
    
    if (required.length > 0) {
      jsonSchema.required = required;
    }
    
    if (schema.description) {
      jsonSchema.description = schema.description;
    }
    
    // Handle strict mode
    if ((schema as any)._def.unknownKeys === 'strict') {
      jsonSchema.additionalProperties = false;
    }
    
    return jsonSchema;
  }

  private static convertArray(schema: z.ZodArray<any>): any {
    const jsonSchema: any = {
      type: 'array',
      items: this.convert(schema.element),
    };
    
    const checks = (schema as any)._def.checks || [];
    
    for (const check of checks) {
      switch (check.kind) {
        case 'min':
          jsonSchema.minItems = check.value;
          break;
        case 'max':
          jsonSchema.maxItems = check.value;
          break;
        case 'length':
          jsonSchema.minItems = check.value;
          jsonSchema.maxItems = check.value;
          break;
      }
    }
    
    if (schema.description) {
      jsonSchema.description = schema.description;
    }
    
    return jsonSchema;
  }

  private static convertUnion(schema: z.ZodUnion<any>): any {
    const options = (schema as any)._def.options;
    
    return {
      anyOf: options.map((option: z.ZodType<any>) => this.convert(option)),
    };
  }

  private static convertEnum(schema: z.ZodEnum<any>): any {
    const jsonSchema: any = {
      type: 'string',
      enum: schema.options,
    };
    
    if (schema.description) {
      jsonSchema.description = schema.description;
    }
    
    return jsonSchema;
  }

  private static convertOptional(schema: z.ZodOptional<any>): any {
    return this.convert(schema._def.innerType);
  }

  private static convertNullable(schema: z.ZodNullable<any>): any {
    const innerSchema = this.convert(schema._def.innerType);
    
    return {
      anyOf: [innerSchema, { type: 'null' }],
    };
  }

  private static convertLiteral(schema: z.ZodLiteral<any>): any {
    const value = schema._def.value;
    
    return {
      type: typeof value,
      const: value,
    };
  }

  private static convertTuple(schema: z.ZodTuple<any>): any {
    const items = (schema as any)._def.items;
    
    return {
      type: 'array',
      items: items.map((item: z.ZodType<any>) => this.convert(item)),
      minItems: items.length,
      maxItems: items.length,
    };
  }

  private static convertRecord(schema: z.ZodRecord<any>): any {
    return {
      type: 'object',
      additionalProperties: this.convert(schema._def.valueType),
    };
  }

  private static convertIntersection(schema: z.ZodIntersection<any, any>): any {
    const left = this.convert(schema._def.left);
    const right = this.convert(schema._def.right);
    
    // Merge object schemas
    if (left.type === 'object' && right.type === 'object') {
      return {
        type: 'object',
        properties: { ...left.properties, ...right.properties },
        required: [...(left.required || []), ...(right.required || [])],
      };
    }
    
    return {
      allOf: [left, right],
    };
  }

  private static convertDefault(schema: z.ZodDefault<any>): any {
    const innerSchema = this.convert(schema._def.innerType);
    innerSchema.default = schema._def.defaultValue();
    return innerSchema;
  }
}

// src/services/openapi/generator.ts
import { GATEWAY_VERSION } from '../../version';

export class OpenAPIGenerator {
  private spec: any = {
    openapi: '3.0.3',
    info: {
      title: 'Hummingbot Gateway',
      description: 'API endpoints for interacting with DEX connectors on various blockchain networks',
      version: GATEWAY_VERSION,
    },
    servers: [
      {
        url: `http://localhost:${ConfigManagerV2.getInstance().get('server.port')}`,
      },
    ],
    paths: {},
    components: {
      schemas: {},
      securitySchemes: {},
    },
    tags: [],
  };

  constructor() {
    // Initialize with existing tags from Gateway
    this.spec.tags = [
      { name: 'system', description: 'System configuration endpoints' },
      { name: '/wallet', description: 'Wallet management endpoints' },
      { name: '/tokens', description: 'Token management endpoints' },
      { name: '/pools', description: 'Pool management endpoints' },
      { name: '/chain/solana', description: 'Solana and SVM-based chain endpoints' },
      { name: '/chain/ethereum', description: 'Ethereum and EVM-based chain endpoints' },
      { name: '/connector/jupiter', description: 'Jupiter connector endpoints' },
      { name: '/connector/meteora', description: 'Meteora connector endpoints' },
      { name: '/connector/raydium', description: 'Raydium connector endpoints' },
      { name: '/connector/uniswap', description: 'Uniswap connector endpoints' },
      { name: '/connector/0x', description: '0x connector endpoints' },
    ];
  }

  addRoute(config: {
    method: string;
    path: string;
    summary?: string;
    description?: string;
    tags?: string[];
    operationId?: string;
    requestBody?: z.ZodSchema;
    query?: z.ZodSchema;
    params?: z.ZodSchema;
    headers?: z.ZodSchema;
    responses?: Record<number, z.ZodSchema | { description: string; schema?: z.ZodSchema }>;
    security?: Array<Record<string, string[]>>;
  }) {
    const pathItem = this.spec.paths[config.path] || {};
    
    const operation: any = {
      summary: config.summary || `${config.method} ${config.path}`,
      tags: config.tags || [],
      parameters: [],
      responses: {},
    };

    if (config.description) {
      operation.description = config.description;
    }

    if (config.operationId) {
      operation.operationId = config.operationId;
    }

    if (config.security) {
      operation.security = config.security;
    }

    // Add path parameters
    if (config.params) {
      const schema = ZodToJsonSchema.convert(config.params);
      if (schema.properties) {
        for (const [name, propSchema] of Object.entries(schema.properties)) {
          operation.parameters.push({
            name,
            in: 'path',
            required: true,
            schema: propSchema,
          });
        }
      }
    }

    // Add query parameters
    if (config.query) {
      const schema = ZodToJsonSchema.convert(config.query);
      if (schema.properties) {
        for (const [name, propSchema] of Object.entries(schema.properties)) {
          operation.parameters.push({
            name,
            in: 'query',
            required: schema.required?.includes(name) || false,
            schema: propSchema,
          });
        }
      }
    }

    // Add header parameters
    if (config.headers) {
      const schema = ZodToJsonSchema.convert(config.headers);
      if (schema.properties) {
        for (const [name, propSchema] of Object.entries(schema.properties)) {
          operation.parameters.push({
            name,
            in: 'header',
            required: schema.required?.includes(name) || false,
            schema: propSchema,
          });
        }
      }
    }

    // Add request body
    if (config.requestBody) {
      operation.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: ZodToJsonSchema.convert(config.requestBody),
          },
        },
      };
    }

    // Add responses
    if (config.responses) {
      for (const [status, response] of Object.entries(config.responses)) {
        if ('schema' in response) {
          operation.responses[status] = {
            description: response.description,
            content: {
              'application/json': {
                schema: response.schema ? ZodToJsonSchema.convert(response.schema) : undefined,
              },
            },
          };
        } else {
          // Response is a Zod schema directly
          operation.responses[status] = {
            description: status === '200' ? 'Success' : 'Error',
            content: {
              'application/json': {
                schema: ZodToJsonSchema.convert(response as z.ZodSchema),
              },
            },
          };
        }
      }
    } else {
      // Default response
      operation.responses['200'] = {
        description: 'Success',
      };
    }

    pathItem[config.method.toLowerCase()] = operation;
    this.spec.paths[config.path] = pathItem;
  }

  getSpec() {
    return this.spec;
  }
}

// src/services/openapi/fastify-integration.ts
import { FastifyInstance } from 'fastify';
import fastifySwaggerUi from '@fastify/swagger-ui';

export function setupOpenAPI(app: FastifyInstance) {
  const generator = new OpenAPIGenerator();
  
  // Hook into route registration
  app.addHook('onRoute', (routeOptions) => {
    if (routeOptions.schema && routeOptions.schema.hide !== true) {
      generator.addRoute({
        method: routeOptions.method as string,
        path: routeOptions.url,
        summary: routeOptions.schema.summary,
        description: routeOptions.schema.description,
        tags: routeOptions.schema.tags || [],
        operationId: routeOptions.schema.operationId,
        requestBody: routeOptions.schema.body,
        query: routeOptions.schema.querystring,
        params: routeOptions.schema.params,
        headers: routeOptions.schema.headers,
        responses: routeOptions.schema.response || {},
        security: routeOptions.schema.security,
      });
    }
  });

  // Register OpenAPI endpoint
  app.get('/openapi.json', async () => {
    return generator.getSpec();
  });

  // Register Swagger UI
  app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'none',
      deepLinking: false,
      tryItOutEnabled: true,
      displayRequestDuration: true,
      persistAuthorization: true,
      filter: true,
      defaultModelExpandDepth: 3,
      defaultModelsExpandDepth: 3,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
    specification: {
      document: generator.getSpec(),
    },
  });
}
```

#### 1.3 Update Main App Setup
**TODO:**
```typescript
// src/app.ts
- [ ] Import setupZodValidation from services/validation/setup
- [ ] Import setupOpenAPI from services/openapi/fastify-integration  
- [ ] Apply setupZodValidation to main Fastify instance
- [ ] Apply setupOpenAPI after validation setup
- [ ] Remove @fastify/swagger imports and registration
- [ ] Keep @fastify/swagger-ui for UI only
- [ ] Test existing routes still work
- [ ] Add global error handler for ZodError:
  ```typescript
  if (error instanceof ZodError) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Validation Error',
      message: formatZodError(error),
    });
  }
  ```
- [ ] Verify Swagger UI loads at /docs
- [ ] Verify OpenAPI spec available at /openapi.json
- [ ] Test that converted schemas work correctly
```

#### 1.4 Migration Utilities
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

#### 1.5 Testing Framework
**TODO:**
- [ ] Create simple validation tests for Zod schemas
- [ ] Add performance benchmarking script
- [ ] Test error message format matches existing API
- [ ] Create integration test with sample route
- [ ] Test OpenAPI converter with various schema types:
  - [ ] Test string schemas with constraints
  - [ ] Test number schemas with min/max
  - [ ] Test object schemas with nested properties
  - [ ] Test array schemas with items
  - [ ] Test union types
  - [ ] Test optional and nullable fields
  - [ ] Test enum types
  - [ ] Test default values
  - [ ] Test intersection types
- [ ] Verify generated OpenAPI spec is valid:
  - [ ] Validate against OpenAPI 3.0.3 schema
  - [ ] Test with online OpenAPI validators
  - [ ] Ensure all routes are documented
- [ ] Test Swagger UI functionality:
  - [ ] Verify UI loads correctly
  - [ ] Test "Try it out" feature
  - [ ] Verify request/response examples
  - [ ] Test authentication if applicable

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

### 2. OpenAPI Converter Implementation

#### 2.1 Zod to JSON Schema Converter
```typescript
// src/services/openapi/zod-to-json-schema.ts
import { z } from 'zod';

export class ZodToJsonSchema {
  static convert(schema: z.ZodType<any>, definitions?: Record<string, any>): any {
    // Handle different Zod types
    if (schema instanceof z.ZodString) return this.convertString(schema);
    if (schema instanceof z.ZodNumber) return this.convertNumber(schema);
    if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
    if (schema instanceof z.ZodObject) return this.convertObject(schema, definitions);
    if (schema instanceof z.ZodArray) return this.convertArray(schema, definitions);
    if (schema instanceof z.ZodUnion) return this.convertUnion(schema, definitions);
    if (schema instanceof z.ZodEnum) return this.convertEnum(schema);
    if (schema instanceof z.ZodOptional) return this.convertOptional(schema, definitions);
    if (schema instanceof z.ZodNullable) return this.convertNullable(schema, definitions);
    
    throw new Error(`Unsupported Zod type: ${schema.constructor.name}`);
  }

  private static convertString(schema: z.ZodString): any {
    const def = (schema as any)._def;
    const jsonSchema: any = { type: 'string' };
    
    if (def.checks) {
      for (const check of def.checks) {
        switch (check.kind) {
          case 'min':
            jsonSchema.minLength = check.value;
            break;
          case 'max':
            jsonSchema.maxLength = check.value;
            break;
          case 'regex':
            jsonSchema.pattern = check.regex.source;
            break;
          case 'email':
            jsonSchema.format = 'email';
            break;
          case 'url':
            jsonSchema.format = 'uri';
            break;
          case 'uuid':
            jsonSchema.format = 'uuid';
            break;
        }
      }
    }
    
    if (def.description) jsonSchema.description = def.description;
    return jsonSchema;
  }

  private static convertNumber(schema: z.ZodNumber): any {
    const def = (schema as any)._def;
    const jsonSchema: any = { type: def.checks?.some((c: any) => c.kind === 'int') ? 'integer' : 'number' };
    
    if (def.checks) {
      for (const check of def.checks) {
        switch (check.kind) {
          case 'min':
            jsonSchema.minimum = check.value;
            break;
          case 'max':
            jsonSchema.maximum = check.value;
            break;
        }
      }
    }
    
    if (def.description) jsonSchema.description = def.description;
    return jsonSchema;
  }

  private static convertObject(schema: z.ZodObject<any>, definitions?: Record<string, any>): any {
    const shape = schema.shape;
    const properties: any = {};
    const required: string[] = [];
    
    for (const [key, value] of Object.entries(shape)) {
      const fieldSchema = value as z.ZodType<any>;
      properties[key] = this.convert(fieldSchema, definitions);
      
      // Check if field is required (not optional)
      if (!(fieldSchema instanceof z.ZodOptional)) {
        required.push(key);
      }
    }
    
    const jsonSchema: any = {
      type: 'object',
      properties,
    };
    
    if (required.length > 0) jsonSchema.required = required;
    if ((schema as any)._def.description) jsonSchema.description = (schema as any)._def.description;
    
    return jsonSchema;
  }

  private static convertArray(schema: z.ZodArray<any>, definitions?: Record<string, any>): any {
    const def = (schema as any)._def;
    const jsonSchema: any = {
      type: 'array',
      items: this.convert(def.type, definitions),
    };
    
    if (def.minLength) jsonSchema.minItems = def.minLength.value;
    if (def.maxLength) jsonSchema.maxItems = def.maxLength.value;
    if (def.description) jsonSchema.description = def.description;
    
    return jsonSchema;
  }
}
```

#### 2.2 OpenAPI Generator Service
```typescript
// src/services/openapi/generator.ts
import { FastifyInstance } from 'fastify';
import { ZodToJsonSchema } from './zod-to-json-schema';
import { z } from 'zod';

export class OpenAPIGenerator {
  private spec: any;
  
  constructor(options: {
    title: string;
    version: string;
    description?: string;
    servers?: Array<{ url: string; description?: string }>;
  }) {
    this.spec = {
      openapi: '3.0.3',
      info: {
        title: options.title,
        version: options.version,
        description: options.description,
      },
      servers: options.servers || [],
      paths: {},
      components: {
        schemas: {},
        securitySchemes: {},
      },
      tags: [],
    };
  }

  addTag(tag: { name: string; description: string }) {
    if (!this.spec.tags.find((t: any) => t.name === tag.name)) {
      this.spec.tags.push(tag);
    }
  }

  addRoute(options: {
    method: string;
    path: string;
    operationId?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    security?: Array<{ [key: string]: string[] }>;
    parameters?: Array<{
      name: string;
      in: 'query' | 'path' | 'header';
      schema: z.ZodType<any>;
      required?: boolean;
      description?: string;
    }>;
    requestBody?: {
      description?: string;
      schema: z.ZodType<any>;
    };
    responses: Record<string, {
      description: string;
      schema?: z.ZodType<any>;
    }>;
  }) {
    const path = this.spec.paths[options.path] || {};
    
    const operation: any = {
      operationId: options.operationId,
      summary: options.summary,
      description: options.description,
      tags: options.tags || [],
      security: options.security,
      parameters: [],
      responses: {},
    };

    // Add parameters
    if (options.parameters) {
      for (const param of options.parameters) {
        operation.parameters.push({
          name: param.name,
          in: param.in,
          required: param.required !== false,
          description: param.description,
          schema: ZodToJsonSchema.convert(param.schema),
        });
      }
    }

    // Add request body
    if (options.requestBody) {
      operation.requestBody = {
        description: options.requestBody.description,
        required: true,
        content: {
          'application/json': {
            schema: ZodToJsonSchema.convert(options.requestBody.schema),
          },
        },
      };
    }

    // Add responses
    for (const [status, response] of Object.entries(options.responses)) {
      operation.responses[status] = {
        description: response.description,
      };
      
      if (response.schema) {
        operation.responses[status].content = {
          'application/json': {
            schema: ZodToJsonSchema.convert(response.schema),
          },
        };
      }
    }

    path[options.method.toLowerCase()] = operation;
    this.spec.paths[options.path] = path;
  }

  getSpec() {
    return this.spec;
  }
}

// Fastify integration
export function setupOpenAPI(app: FastifyInstance, generator: OpenAPIGenerator) {
  // Hook into route registration
  app.addHook('onRoute', (routeOptions) => {
    if (routeOptions.schema && !routeOptions.schema.hide) {
      const schema = routeOptions.schema as any;
      
      // Extract parameters from different sources
      const parameters: any[] = [];
      
      // Query parameters
      if (schema.querystring && schema.querystring instanceof z.ZodObject) {
        const shape = schema.querystring.shape;
        for (const [name, fieldSchema] of Object.entries(shape)) {
          parameters.push({
            name,
            in: 'query',
            schema: fieldSchema as z.ZodType<any>,
            required: !(fieldSchema instanceof z.ZodOptional),
          });
        }
      }
      
      // Path parameters
      if (schema.params && schema.params instanceof z.ZodObject) {
        const shape = schema.params.shape;
        for (const [name, fieldSchema] of Object.entries(shape)) {
          parameters.push({
            name,
            in: 'path',
            schema: fieldSchema as z.ZodType<any>,
            required: true,
          });
        }
      }
      
      generator.addRoute({
        method: Array.isArray(routeOptions.method) ? routeOptions.method[0] : routeOptions.method,
        path: routeOptions.url,
        operationId: schema.operationId,
        summary: schema.summary,
        description: schema.description,
        tags: schema.tags,
        security: schema.security,
        parameters,
        requestBody: schema.body ? {
          schema: schema.body,
        } : undefined,
        responses: schema.response || {
          200: { description: 'Success' },
        },
      });
    }
  });

  // Register OpenAPI endpoint
  app.get('/openapi.json', {
    schema: { hide: true }, // Don't include this in the spec
  }, async () => {
    return generator.getSpec();
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