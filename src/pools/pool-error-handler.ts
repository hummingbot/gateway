/**
 * Shared error handler for pool routes
 */

import { FastifyInstance } from 'fastify';

import { logger } from '../services/logger';

/**
 * Handle pool-related errors with consistent error responses
 */
export function handlePoolError(fastify: FastifyInstance, error: any, operation: string): never {
  logger.error(`${operation}: ${error.message}`);

  // Re-throw if it's already an HTTP error
  if (error.statusCode) {
    throw error;
  }

  if (error.message.includes('not found')) {
    throw fastify.httpErrors.notFound(error.message);
  }

  if (error.message.includes('Unsupported network') || error.message.includes('Unsupported chainNetwork')) {
    throw fastify.httpErrors.badRequest(error.message);
  }

  if (error.message.includes('no connector/type mapping')) {
    throw fastify.httpErrors.badRequest(error.message);
  }

  if (error.message.includes('Unable to fetch pool-info')) {
    throw fastify.httpErrors.badRequest(error.message);
  }

  if (error.message.includes('Could not resolve symbols')) {
    throw fastify.httpErrors.badRequest(error.message);
  }

  if (error.message.includes('Invalid chainNetwork')) {
    throw fastify.httpErrors.badRequest(error.message);
  }

  throw fastify.httpErrors.internalServerError('Failed to fetch pools from GeckoTerminal');
}
