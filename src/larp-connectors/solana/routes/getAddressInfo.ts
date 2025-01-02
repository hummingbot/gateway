import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { SolanaController } from '../solana.controller';
import { TokenInfoResponse } from './listTokens';

export default function getAddressInfoRoute(fastify: FastifyInstance, folderName: string) {
  const solanaController = new SolanaController();

  fastify.get(`/${folderName}/token/:tokenAddress`, {
    schema: {
      tags: [folderName],
      description: 'Retrieve info about a Solana token by address',
      params: Type.Object({
        tokenAddress: Type.String()
      }),
      response: {
        200: TokenInfoResponse
      },
      querystring: Type.Object({
        useApi: Type.Optional(Type.Boolean({ default: false }))
      })
    },
    handler: async (request, reply) => {
      const { tokenAddress } = request.params as { tokenAddress: string };
      const { useApi = false } = request.query as { useApi?: boolean };
      fastify.log.info(`Getting Solana token info for address: ${tokenAddress}, useApi: ${useApi}`);
      
      const tokenInfo = await solanaController.getTokenByAddress(tokenAddress, useApi);
      return tokenInfo;
    }
  });
}