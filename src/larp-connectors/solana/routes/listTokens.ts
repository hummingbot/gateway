import { FastifyInstance } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { SolanaController } from '../solana.controller';

export const TokenInfoResponse = Type.Object({
  address: Type.String(),
  chainId: Type.Number(),
  name: Type.String(),
  symbol: Type.String(),
  decimals: Type.Number(),
  // verified: Type.Boolean(),
  // holders: Type.Number(),
  // logoURI: Type.Optional(Type.String()),
  // tags: Type.Optional(Type.Array(Type.String())),
  // extensions: Type.Optional(Type.Object({})),
});

type TokenInfoResponseType = Static<typeof TokenInfoResponse>;

export default function getTokenListRoute(fastify: FastifyInstance, folderName: string) {
  const controller = new SolanaController();

  fastify.get(`/${folderName}/tokens`, {
    schema: {
      tags: [folderName],
      description: 'List all tokens available in the Solana token list',
      response: {
        200: Type.Array(TokenInfoResponse)
      }
    },
    handler: async (request, reply) => {
      fastify.log.info('Getting token list');
      return controller.getTokenList();
    }
  });
}