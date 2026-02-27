import * as fs from 'fs';
import * as path from 'path';

import { Type } from '@sinclair/typebox';
import { FastifyInstance } from 'fastify';

import { logger } from '../services/logger';
import { GATEWAY_VERSION } from '../version';

const PID_FILE = path.join(process.cwd(), 'gateway.pid');

function removePidFile(): void {
  try {
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
      logger.info('PID file removed');
    }
  } catch (error) {
    logger.warn(`Failed to remove PID file: ${error}`);
  }
}

// Detect dev mode
const devMode = process.argv.includes('--dev') || process.env.GATEWAY_TEST_MODE === 'dev';

export async function serverRoutes(fastify: FastifyInstance) {
  // Health check route
  fastify.get(
    '/',
    {
      schema: {
        description: 'Health check endpoint',
        tags: ['server'],
        response: {
          200: Type.Object({
            status: Type.String({ description: 'Server status' }),
          }),
        },
      },
    },
    async () => {
      return { status: 'ok' };
    },
  );

  // Status endpoint - returns server status info
  fastify.get(
    '/status',
    {
      schema: {
        description: 'Get Gateway server status information including version, uptime, and mode.',
        tags: ['server'],
        response: {
          200: Type.Object({
            status: Type.String({ description: 'Server status' }),
            version: Type.String({ description: 'Gateway version' }),
            uptime: Type.Number({ description: 'Server uptime in seconds' }),
            mode: Type.String({ description: 'Running mode (dev/production)' }),
            pid: Type.Number({ description: 'Process ID' }),
          }),
        },
      },
    },
    async () => {
      return {
        status: 'ok',
        version: GATEWAY_VERSION,
        uptime: process.uptime(),
        mode: devMode ? 'dev' : 'production',
        pid: process.pid,
      };
    },
  );

  // Restart endpoint - exits with code 0 so wrapper will restart
  fastify.post(
    '/restart',
    {
      schema: {
        description: 'Restart the Gateway server. The server will shut down and automatically restart.',
        tags: ['server'],
        response: {
          200: Type.Object({
            message: Type.String({ description: 'Confirmation message' }),
          }),
        },
      },
    },
    async (_req, reply) => {
      await reply.status(200).send({ message: 'Restarting...' });

      logger.info('Restart requested - shutting down for restart...');
      removePidFile();
      await fastify.close();
      logger.info('Server closed. Exiting for restart...');

      // Exit with code 0 - wrapper will restart
      process.exit(0);
    },
  );

  // Stop endpoint - exits with code 1 so wrapper will NOT restart
  fastify.post(
    '/stop',
    {
      schema: {
        description: 'Stop the Gateway server completely. The server will shut down and NOT restart.',
        tags: ['server'],
        response: {
          200: Type.Object({
            message: Type.String({ description: 'Confirmation message' }),
          }),
        },
      },
    },
    async (_req, reply) => {
      await reply.status(200).send({ message: 'Stopping...' });

      logger.info('Stop requested - shutting down...');
      removePidFile();
      await fastify.close();
      logger.info('Server closed. Goodbye!');

      // Exit with code 1 - wrapper will NOT restart
      process.exit(1);
    },
  );
}
