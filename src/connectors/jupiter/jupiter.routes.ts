import sensible from '@fastify/sensible';
import type { FastifyPluginAsync } from 'fastify';

// Import routes
import { executeSwapRoute } from './routes/executeSwap';
import { quoteSwapRoute } from './routes/quoteSwap';

// Main Jupiter routes
const jupiterSwapRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  // We'll use a plugin to modify the tags
  await fastify.register(async (instance) => {
    // Decorate the instance with a hook to modify route options
    instance.addHook('onRoute', (routeOptions) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        routeOptions.schema.tags = ['jupiter'];
      }
    });

    await instance.register(quoteSwapRoute);
    await instance.register(executeSwapRoute);
  });
};

// Export routes in the same pattern as Raydium
export const jupiterRoutes = {
  swap: jupiterSwapRoutes,
};
