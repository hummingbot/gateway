import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Polkadot } from '../polkadot';
import { BalanceRequestType, BalanceResponseType, BalanceRequestSchema, BalanceResponseSchema } from '../../../schemas/chain-schema';
import { HttpException, LOAD_WALLET_ERROR_CODE, LOAD_WALLET_ERROR_MESSAGE } from '../../../services/error-handler';
import { wrapResponse } from '../../../services/response-wrapper';

export async function getPolkadotBalances(
  _fastify: FastifyInstance,
  network: string,
  address: string,
  tokenSymbols?: string[]
): Promise<BalanceResponseType> {
  const initTime = Date.now();
  const polkadot = await Polkadot.getInstance(network);
  
  let wallet;
  try {
    wallet = await polkadot.getWallet(address);
  } catch (err) {
    throw new HttpException(
      500,
      LOAD_WALLET_ERROR_MESSAGE + err,
      LOAD_WALLET_ERROR_CODE
    );
  }

  const balances = await polkadot.getBalance(wallet, tokenSymbols);
  return wrapResponse({ balances }, initTime);
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