## Using Zod with Fastify

### Why Use Zod
- **Runtime validation**: Unlike TypeScript types, Zod validates data at runtime.
- **Better error messages**: Zod provides detailed errors on invalid input.
- **Type inference**: Types inferred from schema, avoiding duplication.

### Setup

```bash
npm install zod
npm install @fastify/type-provider-zod
```

### Example Integration

```ts
import Fastify from 'fastify'
import { z } from 'zod'
import { serializerCompiler, validatorCompiler } from '@fastify/type-provider-zod'

const fastify = Fastify()
fastify.setValidatorCompiler(validatorCompiler)
fastify.setSerializerCompiler(serializerCompiler)

const UserSchema = z.object({
  name: z.string(),
  age: z.number().int().positive()
})

fastify.post('/user', {
  schema: {
    body: UserSchema,
    response: {
      200: z.object({ success: z.boolean() })
    }
  }
}, async (request, reply) => {
  const { name, age } = request.body
  return { success: true }
})

fastify.listen({ port: 3000 })
```