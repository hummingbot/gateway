import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Polkadot } from '../polkadot';
import { PolkadotBalanceRequest, PolkadotBalanceResponse, PolkadotBalanceRequestSchema, PolkadotBalanceResponseSchema } from '../polkadot.types';
import { HttpException } from '../../../services/error-handler';

/**
 * Retrieves token balances for a Polkadot address
 * 
 * @param fastify Fastify instance
 * @param network Network identifier (e.g., 'mainnet', 'westend')
 * @param address Polkadot address to check balances for
 * @param tokenSymbols Optional list of specific token symbols to check
 * @returns Balance response object with token balances
 */
export async function getPolkadotBalances(
  _fastify: FastifyInstance,
  network: string,
  address: string,
  tokenSymbols?: string[]
): Promise<PolkadotBalanceResponse> {
  if (!network) {
    throw new HttpException(400, 'Network parameter is required', -1);
  }
  
  if (!address) {
    throw new HttpException(400, 'Address parameter is required', -1);
  }
  
  const polkadot = await Polkadot.getInstance(network);
  return await polkadot.getAddressBalances(address, tokenSymbols);
}

/**
 * Route plugin that registers the balances endpoint
 */
export const balancesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: PolkadotBalanceRequest;
    Reply: PolkadotBalanceResponse;
  }>(
    '/balances',
    {
      schema: {
        description: 'Get token balances for a Polkadot address',
        tags: ['polkadot'],
        body: PolkadotBalanceRequestSchema,
        response: {
          200: PolkadotBalanceResponseSchema
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