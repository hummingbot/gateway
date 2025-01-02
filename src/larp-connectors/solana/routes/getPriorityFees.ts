import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { SolanaController } from '../solana.controller';

// Rename schema
const PriorityFeesResponse = Type.Object({
  min: Type.String(),
  low: Type.String(),
  medium: Type.String(),
  high: Type.String(),
  veryHigh: Type.String(),
  unsafeMax: Type.String(),
});

export class GetPriorityFeesController extends SolanaController {
  async getPriorityFees() {
    const rpcUrl = this.connectionPool.getNextConnection().rpcEndpoint;
    const fees = await this.fetchEstimatePriorityFees(rpcUrl);
    
    const microLamportsPerSol = 1_000_000_000_000;
    
    return {
      min: (fees.min / microLamportsPerSol).toFixed(9),
      low: (fees.low / microLamportsPerSol).toFixed(9),
      medium: (fees.medium / microLamportsPerSol).toFixed(9),
      high: (fees.high / microLamportsPerSol).toFixed(9),
      veryHigh: (fees.veryHigh / microLamportsPerSol).toFixed(9),
      unsafeMax: (fees.unsafeMax / microLamportsPerSol).toFixed(9),
    };
  }
}

export default function getPriorityFeesRoute(fastify: FastifyInstance, folderName: string) {
  const controller = new GetPriorityFeesController();

  fastify.get(`/${folderName}/priority-fees`, {
    schema: {
      tags: [folderName],
      description: 'Get current Solana priority fees in SOL',
      response: {
        200: PriorityFeesResponse,
        500: Type.Object({
          statusCode: Type.Number(),
          error: Type.String(),
          message: Type.String(),
        })
      }
    },
    handler: async (request, reply) => {
      try {
        fastify.log.info('Getting Solana priority fees');
        const result = await controller.getPriorityFees();
        return result;
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Failed to fetch priority fees'
        });
      }
    }
  });
}
