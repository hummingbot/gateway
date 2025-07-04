import { CurrencyAmount, Percent, TradeType, Token } from '@uniswap/sdk-core';
import {
  AlphaRouter,
  SwapOptionsSwapRouter02,
  SwapType,
} from '@uniswap/smart-order-router';
import { BigNumber } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  ExecuteSwapRequestType,
  SwapExecuteResponseType,
  SwapExecuteResponse,
} from '../../../schemas/router-schema';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Uniswap } from '../uniswap';

import { UniswapExecuteSwapRequest } from './schemas';

async function executeSwap(
  fastify: FastifyInstance,
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
  const wallet = await ethereum.getWallet(walletAddress);
  const uniswap = await Uniswap.getInstance(network);

  // Resolve token symbols to addresses
  const baseTokenInfo = ethereum.getTokenBySymbol(baseToken);
  const quoteTokenInfo = ethereum.getTokenBySymbol(quoteToken);

  if (!baseTokenInfo || !quoteTokenInfo) {
    throw fastify.httpErrors.badRequest(
      sanitizeErrorMessage(
        'Token not found: {}',
        !baseTokenInfo ? baseToken : quoteToken,
      ),
    );
  }

  // Convert to Uniswap SDK Token objects
  const baseTokenObj = new Token(
    ethereum.chainId,
    baseTokenInfo.address,
    baseTokenInfo.decimals,
    baseTokenInfo.symbol,
    baseTokenInfo.name,
  );

  const quoteTokenObj = new Token(
    ethereum.chainId,
    quoteTokenInfo.address,
    quoteTokenInfo.decimals,
    quoteTokenInfo.symbol,
    quoteTokenInfo.name,
  );

  // Determine input/output based on side
  const exactIn = side === 'SELL';
  const [inputToken, outputToken] = exactIn
    ? [baseTokenObj, quoteTokenObj]
    : [quoteTokenObj, baseTokenObj];

  logger.info(
    `Executing swap for ${amount} ${inputToken.symbol} -> ${outputToken.symbol}`,
  );

  // Create AlphaRouter instance
  const router = new AlphaRouter({
    chainId: ethereum.chainId,
    provider: ethereum.provider,
  });

  // Convert amount to token units
  let tradeAmount: CurrencyAmount<Token>;
  if (exactIn) {
    const scaleFactor = Math.pow(10, inputToken.decimals);
    const rawAmount = Math.floor(amount * scaleFactor).toString();
    tradeAmount = CurrencyAmount.fromRawAmount(inputToken, rawAmount);
  } else {
    const scaleFactor = Math.pow(10, outputToken.decimals);
    const rawAmount = Math.floor(amount * scaleFactor).toString();
    tradeAmount = CurrencyAmount.fromRawAmount(outputToken, rawAmount);
  }

  // Configure swap options with actual wallet address
  const swapOptions: SwapOptionsSwapRouter02 = {
    recipient: walletAddress,
    slippageTolerance: new Percent(Math.floor(slippagePct * 100), 10000),
    deadline: Math.floor(Date.now() / 1000 + 1800), // 30 minutes
    type: SwapType.SWAP_ROUTER_02,
  };

  // Get quote from router
  const routeResponse = await router.route(
    tradeAmount,
    outputToken,
    exactIn ? TradeType.EXACT_INPUT : TradeType.EXACT_OUTPUT,
    swapOptions,
  );

  if (!routeResponse || !routeResponse.methodParameters) {
    throw fastify.httpErrors.notFound('No routes found for this token pair');
  }

  const quote = routeResponse;

  // Check and approve allowance if needed
  if (inputToken.address !== ethereum.nativeTokenSymbol) {
    const tokenContract = ethereum.getContract(inputToken.address, wallet);
    const spender = quote.methodParameters.to; // Router address
    const allowance = await ethereum.getERC20Allowance(
      tokenContract,
      wallet,
      spender,
      inputToken.decimals,
    );

    // Calculate required allowance based on side
    const requiredAmount =
      side === 'SELL'
        ? amount
        : quote.quote
          ? parseFloat(quote.quote.toExact())
          : 0;
    const scaleFactor = Math.pow(10, inputToken.decimals);
    const requiredAllowance = BigNumber.from(
      Math.floor(requiredAmount * scaleFactor).toString(),
    );

    if (BigNumber.from(allowance.value).lt(requiredAllowance)) {
      logger.info(`Approving ${inputToken.symbol} for Uniswap router`);
      await ethereum.approveERC20(
        tokenContract,
        wallet,
        spender,
        requiredAllowance,
      );
    }
  }

  // Execute the swap transaction
  const txData = {
    to: quote.methodParameters.to,
    data: quote.methodParameters.calldata,
    value: quote.methodParameters.value,
    gasLimit:
      maxGas || parseInt(quote.estimatedGasUsed?.toString() || '500000'),
    ...(gasPrice && { gasPrice: BigNumber.from(gasPrice) }),
  };

  const txResponse = await wallet.sendTransaction(txData);
  const txReceipt = await txResponse.wait();

  if (!txReceipt || txReceipt.status !== 1) {
    throw fastify.httpErrors.internalServerError('Transaction failed');
  }

  // Calculate fee from gas used
  const fee =
    parseFloat(txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice).toString()) /
    1e18;

  // Calculate actual amounts (for now use quote amounts)
  let estimatedAmountIn: number;
  let estimatedAmountOut: number;

  if (exactIn) {
    estimatedAmountIn = amount;
    estimatedAmountOut = quote.quote ? parseFloat(quote.quote.toExact()) : 0;
  } else {
    estimatedAmountIn = quote.quote ? parseFloat(quote.quote.toExact()) : 0;
    estimatedAmountOut = amount;
  }

  const baseTokenBalanceChange = side === 'SELL' ? -amount : estimatedAmountOut;
  const quoteTokenBalanceChange =
    side === 'SELL' ? estimatedAmountOut : -amount;

  const totalInputSwapped = Math.abs(
    side === 'SELL' ? baseTokenBalanceChange : quoteTokenBalanceChange,
  );
  const totalOutputSwapped = Math.abs(
    side === 'SELL' ? quoteTokenBalanceChange : baseTokenBalanceChange,
  );

  logger.info(
    `Swap executed successfully: ${totalInputSwapped} ${inputToken.symbol} -> ${totalOutputSwapped} ${outputToken.symbol}`,
  );

  return {
    signature: txReceipt.transactionHash,
    status: 1, // CONFIRMED
    data: {
      totalInputSwapped,
      totalOutputSwapped,
      fee,
      baseTokenBalanceChange,
      quoteTokenBalanceChange,
      tokenIn: inputToken.address,
      tokenOut: outputToken.address,
      tokenInAmount: totalInputSwapped,
      tokenOutAmount: totalOutputSwapped,
    },
  };
}

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Ethereum.getWalletAddressExample();

  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: SwapExecuteResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Quote and execute a token swap on Uniswap in one step',
        tags: ['/connector/uniswap'],
        body: {
          ...UniswapExecuteSwapRequest,
          properties: {
            ...UniswapExecuteSwapRequest.properties,
            walletAddress: { type: 'string', examples: [walletAddressExample] },
            network: { type: 'string', default: 'mainnet' },
            baseToken: { type: 'string', examples: ['WETH'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [1] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            slippagePct: { type: 'number', examples: [1] },
          },
        },
        response: { 200: SwapExecuteResponse },
      },
    },
    async (request) => {
      try {
        const {
          walletAddress,
          network,
          baseToken,
          quoteToken,
          amount,
          side,
          slippagePct,
          gasPrice,
          maxGas,
        } = request.body as typeof UniswapExecuteSwapRequest._type;

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
        logger.error('Error executing swap:', e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default executeSwapRoute;
