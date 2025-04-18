import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Polkadot } from '../polkadot';
import { BalanceRequestType, BalanceResponseType, BalanceRequestSchema, BalanceResponseSchema } from '../../../schemas/chain-schema';

export async function getPolkadotBalances(
  _fastify: FastifyInstance,
  network: string,
  address: string,
  tokenSymbols?: string[]
): Promise<BalanceResponseType> {
  const polkadot = await Polkadot.getInstance(network);
  return await polkadot.getAddressBalances(address, tokenSymbols);
}

export const balancesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: BalanceRequestType;
    Reply: BalanceResponseType;
  }>(
    '/balances',
    {
      schema: {
        description: 'Get token balances for a Polkadot address',
        tags: ['polkadot'],
        body: BalanceRequestSchema,
        response: {
          200: BalanceResponseSchema
        }
      }
    },
    async (request) => {
      return await getPolkadotBalances(
        fastify, 
        request.body.network, 
        request.body.address,
        request.body.tokenSymbols
      );
    }
  );
};

export default balancesRoute;