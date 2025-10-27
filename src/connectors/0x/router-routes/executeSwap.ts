import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { ZeroXConnector, executeSwap as sdkExecuteSwap } from '../../../../packages/sdk/src/ethereum/zeroex';
import { Ethereum } from '../../../chains/ethereum/ethereum';
import { waitForTransactionWithTimeout } from '../../../chains/ethereum/ethereum.utils';
import { ExecuteSwapRequestType, SwapExecuteResponseType, SwapExecuteResponse } from '../../../schemas/router-schema';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { ZeroXConfig } from '../0x.config';
import { ZeroXExecuteSwapRequest } from '../schemas';

// SDK imports

async function executeSwap(
  _fastify: FastifyInstance,
  walletAddress: string,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number,
  gasPrice?: string,
  maxGas?: number,
): Promise<SwapExecuteResponseType> {
  const ethereum = await Ethereum.getInstance(network);

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
    getTokenInfo: (symbol: string) => ethereum.getToken(symbol),
    getWalletAddressExample: async () => Ethereum.getWalletAddressExample(),
    getWallet: async (address: string) => ethereum.getWallet(address),
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
  const result = await sdkExecuteSwap(
    {
      walletAddress,
      network,
      baseToken,
      quoteToken,
      amount,
      side,
      slippagePct,
      gasPrice,
      maxGas,
    },
    deps,
  );

  return result;
}

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: SwapExecuteResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Quote and execute a token swap on 0x in one step',
        tags: ['/connector/0x'],
        body: ZeroXExecuteSwapRequest,
        response: { 200: SwapExecuteResponse },
      },
    },
    async (request) => {
      try {
        const { walletAddress, network, baseToken, quoteToken, amount, side, slippagePct, gasPrice, maxGas } =
          request.body as typeof ZeroXExecuteSwapRequest._type;

        return await executeSwap(
          fastify,
          walletAddress,
          network,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct,
          gasPrice,
          maxGas,
        );
      } catch (e) {
        if (e.statusCode) throw e;
        logger.error('Error executing 0x swap:', e);
        throw fastify.httpErrors.internalServerError(e.message || 'Internal server error');
      }
    },
  );
};

export default executeSwapRoute;
