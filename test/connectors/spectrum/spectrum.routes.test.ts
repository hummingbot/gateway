import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import { spectrumRoutes } from '../../../src/connectors/spectrum/spectrum.routes';

describe('spectrumAmmRoutes', () => {
  let fastify: any;

  beforeEach(() => {
    fastify = Fastify();
  });

  afterEach(() => {
    fastify.close();
  });

  it('should register the spectrum/amm routes successfully', async () => {
    const registeredRoutes: string[] = [];
  
    // Use onRoute hook to capture routes during registration
    fastify.addHook('onRoute', (routeOptions) => {
      registeredRoutes.push(`${routeOptions.method.toUpperCase()} ${routeOptions.url}`);
    });
  
    // Register the routes
    await fastify.register(spectrumRoutes.amm);
  
    // Validate the captured routes
    expect(registeredRoutes).toContain('POST /add-liquidity');
    expect(registeredRoutes).toContain('POST /execute-swap');
    expect(registeredRoutes).toContain('GET /pool-info');
    expect(registeredRoutes).toContain('GET /position-info');
    expect(registeredRoutes).toContain('GET /quote-liquidity');
    expect(registeredRoutes).toContain('GET /quote-swap');
    expect(registeredRoutes).toContain('POST /remove-liquidity');
  });
  
  it('should add "spectrum/amm" tags to the route schemas', async () => {
    await fastify.register(spectrumRoutes.amm);

    fastify.addHook('onRoute', (routeOptions: any) => {
      if (routeOptions.schema && routeOptions.schema.tags) {
        expect(routeOptions.schema.tags).toEqual(['spectrum/amm']);
      }
    });

    await fastify.ready();
  });

  it('should work with @fastify/sensible', async () => {
    await fastify.register(sensible);

    try {
      fastify.httpErrors.notFound('This route does not exist');
    } catch (error: any) {
      expect(error).toHaveProperty('statusCode', 404);
      expect(error.message).toBe('This route does not exist');
    }
  });
});
