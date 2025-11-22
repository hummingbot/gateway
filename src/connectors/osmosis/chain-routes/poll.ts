import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import {
  PollRequestType,
  PollResponseType,
  PollRequestSchema,
  PollResponseSchema,
} from '../../../schemas/chain-schema';
import { Osmosis } from '../osmosis';

export async function poll(fastify: FastifyInstance, request: PollRequestType): Promise<PollResponseType> {
  try {
    const osmosis = await Osmosis.getInstance(request.network);
    await osmosis.init();
    return await osmosis.controller.poll(osmosis, request);
  } catch (error) {
    throw fastify.httpErrors.internalServerError(`Failed to poll transaction: ${error.message}`);
  }
}

export const pollRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: PollRequestType;
    Reply: PollResponseType;
  }>(
    '/poll',
    {
      schema: {
        description: 'Poll Cosmos transaction status',
        tags: ['/chain/cosmos'],
        body: {
          ...PollRequestSchema,
          properties: {
            ...PollRequestSchema.properties,
            network: {
              type: 'string',
              examples: ['mainnet', 'testnet'],
            },
            signature: {
              type: 'string',
              examples: ['344A0C038C05D1FA938E78828925109879E30C397100BD84D0BA08A463B2FF82'],
            },
          },
        },
        response: {
          200: PollResponseSchema,
        },
      },
    },
    async (request) => {
      return await poll(fastify, request.body);
    },
  );
};

export default pollRoute;
