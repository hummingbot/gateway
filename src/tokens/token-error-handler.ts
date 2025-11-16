/**
 * Shared error handler for token routes
 */

import { FastifyInstance } from 'fastify';

import { logger } from '../services/logger';

/**
 * Handle token-related errors with consistent error responses
 */
export function handleTokenError(fastify: FastifyInstance, error: any, operation: string): never {
  logger.error(`${operation}: ${error.message}`);

  // Re-throw if it's already an HTTP error
  if (error.statusCode) {
    throw error;
  }

  if (error.message.includes('not found')) {
    throw fastify.httpErrors.notFound(error.message);
  }

  if (error.message.includes('Unsupported network') || error.message.includes('Unsupported chain')) {
    throw fastify.httpErrors.badRequest(error.message);
  }

  if (error.message.includes('Invalid') || error.message.includes('required')) {
    throw fastify.httpErrors.badRequest(error.message);
  }

  if (error.message.includes('already exists')) {
    throw fastify.httpErrors.conflict(error.message);
  }

  throw fastify.httpErrors.internalServerError('Failed to process token operation');
}
