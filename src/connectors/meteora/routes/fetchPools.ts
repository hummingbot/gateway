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
import { httpNotFound, httpInternalServerError, ERROR_MESSAGES } from '../../../services/error-handler';

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
          tokenA: { type: 'string', examples: ['SOL'] },
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
        const solana = await Solana.getInstance(network);

        let tokenMintA, tokenMintB;
        
        if (tokenA) {
          const tokenInfoA = await solana.getToken(tokenA);
          if (!tokenInfoA) {
            throw httpNotFound(ERROR_MESSAGES.TOKEN_NOT_FOUND(tokenA));
          }
          tokenMintA = tokenInfoA.address;
        }
        
        if (tokenB) {
          const tokenInfoB = await solana.getToken(tokenB);
          if (!tokenInfoB) {
            throw httpNotFound(ERROR_MESSAGES.TOKEN_NOT_FOUND(tokenB));
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
                throw httpNotFound(ERROR_MESSAGES.POOL_NOT_FOUND(pair.publicKey.toString()));
              }
            })
        );

        return poolInfos.filter(Boolean);
      } catch (e) {
        logger.error('Error in fetch-pools:', e);
        if (e.statusCode) throw e;
        throw httpInternalServerError();
      }
    }
  });

};

export default fetchPoolsRoute; 