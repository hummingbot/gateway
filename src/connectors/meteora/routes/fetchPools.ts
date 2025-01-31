import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { Meteora } from '../meteora';
import { Solana } from '../../../chains/solana/solana';
import { logger } from '../../../services/logger';
import { 
  PoolInfo, 
  PoolInfoSchema, 
  FetchPoolsRequest, 
  FetchPoolsRequestType 
} from '../../../services/clmm-interfaces';

export const fetchPoolsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: FetchPoolsRequestType,
    Reply: PoolInfo[]
  }>('/fetch-pools', {
    schema: {
      description: 'Fetch info about Meteora pools',
      tags: ['meteora'],
      querystring: {
        ...FetchPoolsRequest,
        properties: {
          network: { type: 'string', default: 'mainnet-beta' },
          limit: { type: 'number', minimum: 1, default: 10 },
          tokenA: { type: 'string', examples: ['M3M3'] },
          tokenB: { type: 'string', examples: ['USDC'] }
        }
      },
      response: {
        200: Type.Array(PoolInfoSchema)
      }
    },
    handler: async (request, _reply) => {
      try {
        const { limit, tokenA, tokenB } = request.query;
        const network = request.query.network || 'mainnet-beta';
        
        const meteora = await Meteora.getInstance(network);
        if (!meteora) {
          throw fastify.httpErrors.serviceUnavailable('Meteora service unavailable');
        }
        
        const solana = await Solana.getInstance(network);
        if (!solana) {
          throw fastify.httpErrors.serviceUnavailable('Solana service unavailable');
        }

        let tokenMintA, tokenMintB;
        
        if (tokenA) {
          const tokenInfoA = await solana.getToken(tokenA);
          if (!tokenInfoA) {
            throw fastify.httpErrors.notFound(`Token not found: ${tokenA}`);
          }
          tokenMintA = tokenInfoA.address;
        }
        
        if (tokenB) {
          const tokenInfoB = await solana.getToken(tokenB);
          if (!tokenInfoB) {
            throw fastify.httpErrors.notFound(`Token not found: ${tokenB}`);
          }
          tokenMintB = tokenInfoB.address;
        }
    
        const pairs = await meteora.getPools(limit, tokenMintA, tokenMintB);
        if (!Array.isArray(pairs)) {
          logger.error('No matching Meteora pools found');
          return [];
        }

        const poolInfos = await Promise.all(
          pairs
            .filter(pair => pair?.publicKey?.toString)
            .map(async pair => {
              try {
                return await meteora.getPoolInfo(pair.publicKey.toString());
              } catch (error) {
                logger.error(`Failed to get pool info for ${pair.publicKey.toString()}: ${error.message}`);
                return null;
              }
            })
        );

        return poolInfos.filter(Boolean);
      } catch (e) {
        logger.error('Error in fetch-pools:', e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError();
      }
    }
  });

};

export default fetchPoolsRoute; 