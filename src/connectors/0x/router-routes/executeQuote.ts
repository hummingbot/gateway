import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { ZeroXConnector, executeQuote as sdkExecuteQuote } from '../../../../packages/sdk/src/ethereum/zeroex';
import { Ethereum } from '../../../chains/ethereum/ethereum';
import { waitForTransactionWithTimeout } from '../../../chains/ethereum/ethereum.utils';
import { ExecuteQuoteRequestType, SwapExecuteResponseType, SwapExecuteResponse } from '../../../schemas/router-schema';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { ZeroXConfig } from '../0x.config';
import { ZeroXExecuteQuoteRequest } from '../schemas';

// SDK imports

async function executeQuote(
  fastify: FastifyInstance,
  walletAddress: string,
  network: string,
  quoteId: string,
  gasPrice?: string,
  maxGas?: number,
): Promise<SwapExecuteResponseType> {
  const ethereum = await Ethereum.getInstance(network);

  logger.info(`Executing quote ${quoteId} on ${network}`);

  // Create SDK connector
  const connector = new ZeroXConnector({
    network,
    chainId: ethereum.chainId,
    apiKey: ZeroXConfig.config.apiKey,
    apiEndpoint: ZeroXConfig.getApiEndpoint(network),
    slippagePct: ZeroXConfig.config.slippagePct,
  });

  // Setup dependencies for SDK operation
  const deps = {
    connector,
    quoteCache,
    getWallet: async (address: string) => ethereum.getWallet(address),
    getTokenInfo: (addressOrSymbol: string) => ethereum.getToken(addressOrSymbol),
    getERC20Allowance: (tokenContract: any, wallet: any, spender: string, decimals: number) =>
      ethereum.getERC20Allowance(tokenContract, wallet, spender, decimals),
    getContract: (address: string, wallet: any) => ethereum.getContract(address, wallet),
    waitForTransaction: (txResponse: any) => waitForTransactionWithTimeout(txResponse),
    handleTransactionConfirmation: (
      receipt: any,
      tokenIn: string,
      tokenOut: string,
      amountIn: number,
      amountOut: number,
    ) => ethereum.handleTransactionConfirmation(receipt, tokenIn, tokenOut, amountIn, amountOut),
    nativeTokenSymbol: ethereum.nativeTokenSymbol,
  };

  // Call SDK operation
  try {
    const result = await sdkExecuteQuote(
      {
        walletAddress,
        network,
        quoteId,
        gasPrice,
        maxGas,
      },
      deps,
    );

    if (result.status === 0) {
      logger.info(`Transaction ${result.signature || 'pending'} is still pending`);
    } else if (result.status === 1) {
      logger.info(`Swap executed successfully`);
    }

    return result;
  } catch (error: any) {
    if (error.message?.includes('Quote not found')) {
      throw fastify.httpErrors.badRequest(error.message);
    }
    if (error.message?.includes('Insufficient allowance')) {
      throw fastify.httpErrors.badRequest(error.message);
    }
    if (error.message?.includes('Transaction failed')) {
      throw fastify.httpErrors.internalServerError(error.message);
    }
    throw error;
  }
}

export { executeQuote };

export const executeQuoteRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: ExecuteQuoteRequestType;
    Reply: SwapExecuteResponseType;
  }>(
    '/execute-quote',
    {
      schema: {
        description: 'Execute a previously fetched quote from 0x',
        tags: ['/connector/0x'],
        body: ZeroXExecuteQuoteRequest,
        response: { 200: SwapExecuteResponse },
      },
    },
    async (request) => {
      try {
        const { walletAddress, network, quoteId, gasPrice, maxGas } =
          request.body as typeof ZeroXExecuteQuoteRequest._type;

        return await executeQuote(fastify, walletAddress, network, quoteId, gasPrice, maxGas);
      } catch (e) {
        if (e.statusCode) throw e;
        logger.error('Error executing 0x quote:', e);
        throw fastify.httpErrors.internalServerError(e.message || 'Internal server error');
      }
    },
  );
};

export default executeQuoteRoute;
