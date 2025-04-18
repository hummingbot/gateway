import {FastifyInstance, FastifyPluginAsync} from 'fastify';
import {Polkadot} from '../polkadot';
import {
  StatusRequestSchema,
  StatusRequestType,
  StatusResponseSchema,
  StatusResponseType
} from '../../../schemas/chain-schema';
import {wrapResponse} from '../../../services/response-wrapper';

export async function getPolkadotStatus(
  _fastify: FastifyInstance,
  network: string
): Promise<StatusResponseType> {
  const initTime = Date.now();
  const polkadot = await Polkadot.getInstance(network);
  
  const chain = 'polkadot';
  const rpcUrl = polkadot.config.network.nodeURL;
  const nativeCurrency = polkadot.config.network.nativeCurrencySymbol;
  const currentBlockNumber = await polkadot.getCurrentBlockNumber();

  return wrapResponse({
    chain,
    network,
    rpcUrl,
    currentBlockNumber,
    nativeCurrency
  }, initTime);
}

export const statusRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: StatusRequestType;
    Reply: StatusResponseType;
  }>(
    '/status',
    {
      schema: {
        description: 'Get Polkadot network status',
        tags: ['polkadot'],
        querystring: StatusRequestSchema,
        response: {
          200: StatusResponseSchema
        }
      }
    },
    async (request) => {
      return await getPolkadotStatus(fastify, request.query.network);
    }
  );
};

export default statusRoute; 