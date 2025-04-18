import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Polkadot } from '../polkadot';
import { BalanceRequestType, BalanceResponseType, BalanceRequestSchema, BalanceResponseSchema } from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { HttpException } from '../../../services/error-handler';
import { wrapResponse } from '../../../services/response-wrapper';

export async function estimatePolkadotGas(
  _fastify: FastifyInstance,
  network: string,
  address: string,
  recipient: string,
  amount: number,
  tokenSymbol: string
): Promise<BalanceResponseType> {
  const initTime = Date.now();
  const polkadot = await Polkadot.getInstance(network);
  
  try {
    const wallet = await polkadot.getWallet(address);
    const gasEstimate = await polkadot.estimateGas(wallet, recipient, amount, tokenSymbol);
    
    return wrapResponse({
      balances: {
        [tokenSymbol]: Number(gasEstimate)
      }
    }, initTime);
  } catch (error) {
    logger.error(`Error estimating gas: ${error.message}`);
    throw new HttpException(
      500,
      `Failed to estimate gas: ${error.message}`,
      5004
    );
  }
}

export const estimateGasRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: BalanceRequestType;
    Reply: BalanceResponseType;
  }>(
    '/estimate-gas',
    {
      schema: {
        description: 'Estimate gas for a Polkadot transaction',
        tags: ['polkadot'],
        body: BalanceRequestSchema,
        response: {
          200: BalanceResponseSchema
        }
      }
    },
    async (request) => {
      const { network, address, tokenSymbols } = request.body;
      const recipient = address; // Using same address as recipient for estimation
      const amount = 0.001; // Small amount for estimation
      const tokenSymbol = tokenSymbols && tokenSymbols.length > 0 ? tokenSymbols[0] : 'DOT';
      
      return await estimatePolkadotGas(
        fastify,
        network,
        address,
        recipient,
        amount,
        tokenSymbol
      );
    }
  );
};

export default estimateGasRoute; 