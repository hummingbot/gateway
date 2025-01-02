import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { SolanaController } from '../solana.controller';
import { TokenInfoResponse } from './listTokens';

export default function getSymbolInfoRoute(fastify: FastifyInstance, folderName: string) {
  const solanaController = new SolanaController();

  fastify.get(`/${folderName}/symbol/:symbol`, {
    schema: {
      tags: [folderName],
      description: 'Retrieve info about a Solana token by symbol from the stored token list',
      params: Type.Object({
        symbol: Type.String()
      }),
      response: {
        200: TokenInfoResponse
      }
    },
    handler: async (request, reply) => {
      const { symbol } = request.params as { symbol: string };
      fastify.log.info(`Getting Solana token info for symbol: ${symbol}`);
      
      const tokenInfo = await solanaController.getTokenBySymbol(symbol);
      return tokenInfo;
    }
  });
}