import { FastifyPluginCallback } from 'fastify'

declare module 'fastify' {
  export type FastifyPluginAsync = FastifyPluginCallback;
  
  interface FastifySchema {
    swaggerQueryExample?: Record<string, unknown>;
    'x-examples'?: Record<string, unknown>;
  }
} 