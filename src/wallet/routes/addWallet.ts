import { FastifyPluginAsync } from 'fastify';
import { logger } from '../../services/logger';
import { 
  AddWalletRequest, 
  AddWalletResponse, 
  AddWalletRequestSchema,
  AddWalletResponseSchema 
} from '../schemas';
import { addWallet } from '../utils';

export const addWalletRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: AddWalletRequest; Reply: AddWalletResponse }>(
    '/add',
    {
      schema: {
        description: 'Add a new wallet using a private key',
        tags: ['wallet'],
        body: {
          ...AddWalletRequestSchema,
          examples: [{
            chain: 'solana',
            network: 'mainnet-beta',
            privateKey: '<your-private-key>'
          }]
        },
        response: {
          200: AddWalletResponseSchema
        }
      }
    },
    async (request) => {
      logger.info(`Adding new wallet for chain: ${request.body.chain}`);
      return await addWallet(fastify, request.body);
    }
  );
};

export default addWalletRoute;