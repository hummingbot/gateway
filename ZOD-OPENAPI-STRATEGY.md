# Zod to OpenAPI Strategy for Gateway

## Problem Statement
Gateway currently uses TypeBox which has native JSON Schema support, making OpenAPI generation straightforward. With Zod migration, we need to maintain the same OpenAPI/Swagger documentation functionality at `localhost:15888/docs`.

## Current State
- TypeBox schemas → JSON Schema → OpenAPI spec → Swagger UI
- Automatic generation with `@fastify/swagger`
- No additional dependencies needed

## Options Analysis

### Option 1: Use zod-openapi (Not Recommended)
```typescript
import { z } from 'zod';
import { extendZodWithOpenApi } from 'zod-openapi';

extendZodWithOpenApi(z);

const UserSchema = z.object({
  id: z.string().openapi({ example: '123' }),
  name: z.string().openapi({ description: 'User name' }),
});
```
**Issues:**
- Adds dependency on third-party library
- Requires modifying every schema with `.openapi()` calls
- Risk of breaking changes

### Option 2: Use zod-to-json-schema (Better)
```typescript
import { zodToJsonSchema } from 'zod-to-json-schema';

const jsonSchema = zodToJsonSchema(UserSchema, 'User');
```
**Issues:**
- Still a dependency, but more stable (1.5M weekly downloads)
- Only does conversion, not full OpenAPI generation

### Option 3: Build Minimal Converter (Recommended)

## Recommended Implementation

### 1. Create Lightweight Zod to JSON Schema Converter
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
    if (schema instanceof z.ZodObject) {
      return this.convertObject(schema);
    }
    // ... handle other types
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
        case 'regex':
          jsonSchema.pattern = check.regex.source;
          break;
        case 'email':
          jsonSchema.format = 'email';
          break;
        case 'url':
          jsonSchema.format = 'uri';
          break;
      }
    }
    
    // Add description if available
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
      if (!(value instanceof z.ZodOptional)) {
        required.push(key);
      }
    }
    
    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }
  
  // ... implement other type converters
}
```

### 2. Create OpenAPI Generator Service
```typescript
// src/services/openapi/generator.ts
export class OpenAPIGenerator {
  private spec: any = {
    openapi: '3.0.3',
    info: {
      title: 'Hummingbot Gateway',
      version: GATEWAY_VERSION,
    },
    paths: {},
    components: {
      schemas: {},
    },
  };

  addRoute(config: {
    method: string;
    path: string;
    summary: string;
    tags: string[];
    requestBody?: z.ZodSchema;
    query?: z.ZodSchema;
    params?: z.ZodSchema;
    responses: Record<number, z.ZodSchema>;
  }) {
    const pathItem = this.spec.paths[config.path] || {};
    
    const operation: any = {
      summary: config.summary,
      tags: config.tags,
      parameters: [],
      responses: {},
    };

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

    // Add request body
    if (config.requestBody) {
      operation.requestBody = {
        content: {
          'application/json': {
            schema: ZodToJsonSchema.convert(config.requestBody),
          },
        },
      };
    }

    // Add responses
    for (const [status, responseSchema] of Object.entries(config.responses)) {
      operation.responses[status] = {
        description: status === '200' ? 'Success' : 'Error',
        content: {
          'application/json': {
            schema: ZodToJsonSchema.convert(responseSchema),
          },
        },
      };
    }

    pathItem[config.method.toLowerCase()] = operation;
    this.spec.paths[config.path] = pathItem;
  }

  getSpec() {
    return this.spec;
  }
}
```

### 3. Integrate with Fastify
```typescript
// src/services/openapi/fastify-integration.ts
export function setupOpenAPI(app: FastifyInstance) {
  const generator = new OpenAPIGenerator();
  
  // Hook into route registration
  app.addHook('onRoute', (routeOptions) => {
    if (routeOptions.schema && routeOptions.schema.hide !== true) {
      generator.addRoute({
        method: routeOptions.method as string,
        path: routeOptions.url,
        summary: routeOptions.schema.summary || '',
        tags: routeOptions.schema.tags || [],
        requestBody: routeOptions.schema.body,
        query: routeOptions.schema.querystring,
        params: routeOptions.schema.params,
        responses: routeOptions.schema.response || {},
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
    specification: {
      document: generator.getSpec(),
    },
  });
}
```

## Benefits of This Approach

1. **No External Dependencies**: Only uses Zod and Fastify
2. **Full Control**: Can customize OpenAPI generation for Gateway's needs
3. **Maintainable**: ~300 lines of code that's easy to understand
4. **Performance**: No runtime overhead from external libraries
5. **Compatibility**: Works with existing Swagger UI setup

## Implementation Phases

### Phase 1: Basic Converter (Week 1)
- [ ] Implement ZodToJsonSchema for basic types
- [ ] Support string, number, boolean, object, array
- [ ] Add unit tests

### Phase 2: Advanced Types (Week 2)
- [ ] Support union, intersection, enum types
- [ ] Handle nullable, optional, default values
- [ ] Support transforms and refinements

### Phase 3: OpenAPI Generator (Week 3)
- [ ] Create OpenAPIGenerator class
- [ ] Integrate with Fastify hooks
- [ ] Generate full OpenAPI spec

### Phase 4: Feature Parity (Week 4)
- [ ] Add all TypeBox schema features
- [ ] Support examples, descriptions
- [ ] Add request/response examples

## Alternative: Gradual Migration
If building a converter proves too complex, we can:
1. Start with `zod-to-json-schema` (minimal dependency)
2. Build our converter incrementally
3. Replace the dependency once our converter is complete

## Testing Strategy
```typescript
// test/openapi/converter.test.ts
describe('ZodToJsonSchema', () => {
  it('should convert Zod schemas to equivalent JSON schemas', () => {
    const zodSchema = z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(100),
      age: z.number().int().min(0).max(150),
      email: z.string().email().optional(),
    });

    const jsonSchema = ZodToJsonSchema.convert(zodSchema);
    
    expect(jsonSchema).toEqual({
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string', minLength: 1, maxLength: 100 },
        age: { type: 'integer', minimum: 0, maximum: 150 },
        email: { type: 'string', format: 'email' },
      },
      required: ['id', 'name', 'age'],
    });
  });
});
```

## Conclusion
Building a minimal Zod to JSON Schema converter is the best approach for Gateway because:
- Maintains full control over OpenAPI generation
- No risk from third-party breaking changes
- Can be optimized for Gateway's specific needs
- Reasonable implementation effort (~1 week)
- Easy to maintain and extend

This ensures Gateway's Swagger documentation continues working seamlessly after the Zod migration.