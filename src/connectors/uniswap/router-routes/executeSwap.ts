import { Protocol } from '@uniswap/router-sdk';
import { CurrencyAmount, Percent, TradeType, Token } from '@uniswap/sdk-core';
import { BigNumber } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { ExecuteSwapRequestType, SwapExecuteResponseType, SwapExecuteResponse } from '../../../schemas/router-schema';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { UniswapExecuteSwapRequest } from '../schemas';
import { Uniswap } from '../uniswap';
import { UniversalRouterService } from '../universal-router';

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
  const baseTokenInfo = ethereum.getToken(baseToken);
  const quoteTokenInfo = ethereum.getToken(quoteToken);

  if (!baseTokenInfo || !quoteTokenInfo) {
    throw fastify.httpErrors.badRequest(
      sanitizeErrorMessage('Token not found: {}', !baseTokenInfo ? baseToken : quoteToken),
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
  const [inputToken, outputToken] = exactIn ? [baseTokenObj, quoteTokenObj] : [quoteTokenObj, baseTokenObj];

  logger.info(`Executing swap for ${amount} ${inputToken.symbol} -> ${outputToken.symbol}`);

  // Create Universal Router service
  const universalRouter = new UniversalRouterService(ethereum.provider, ethereum.chainId, network);

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

  // Get quote from Universal Router
  const quote = await universalRouter.getQuote(
    inputToken,
    outputToken,
    tradeAmount,
    exactIn ? TradeType.EXACT_INPUT : TradeType.EXACT_OUTPUT,
    {
      slippageTolerance: new Percent(Math.floor(slippagePct * 100), 10000),
      deadline: Math.floor(Date.now() / 1000 + 1800), // 30 minutes
      recipient: walletAddress,
      protocols: [Protocol.V2, Protocol.V3], // V4 requires different approach
    },
  );

  // Check and approve allowance if needed
  if (inputToken.address !== ethereum.nativeTokenSymbol) {
    const tokenContract = ethereum.getContract(inputToken.address, wallet);
    const spender = quote.methodParameters.to; // Router address
    const allowance = await ethereum.getERC20Allowance(tokenContract, wallet, spender, inputToken.decimals);

    // Calculate required allowance from the trade input amount
    const requiredAllowance = BigNumber.from(quote.trade.inputAmount.quotient.toString());

    if (BigNumber.from(allowance.value).lt(requiredAllowance)) {
      logger.info(`Approving ${inputToken.symbol} for Universal Router`);
      await ethereum.approveERC20(tokenContract, wallet, spender, requiredAllowance);
    }
  }

  // Execute the swap transaction
  const txData = {
    to: quote.methodParameters.to,
    data: quote.methodParameters.calldata,
    value: quote.methodParameters.value,
    gasLimit: maxGas || parseInt(quote.estimatedGasUsed.toString()),
    ...(gasPrice && { gasPrice: BigNumber.from(gasPrice) }),
  };

  const txResponse = await wallet.sendTransaction(txData);
  const txReceipt = await txResponse.wait();

  if (!txReceipt || txReceipt.status !== 1) {
    throw fastify.httpErrors.internalServerError('Transaction failed');
  }

  // Calculate fee from gas used
  const fee = parseFloat(txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice).toString()) / 1e18;

  // Calculate actual amounts from the trade
  const amountIn = parseFloat(quote.trade.inputAmount.toExact());
  const amountOut = parseFloat(quote.trade.outputAmount.toExact());

  const baseTokenBalanceChange = side === 'SELL' ? -amountIn : amountOut;
  const quoteTokenBalanceChange = side === 'SELL' ? amountOut : -amountIn;

  logger.info(`Swap executed successfully: ${amountIn} ${inputToken.symbol} -> ${amountOut} ${outputToken.symbol}`);

  return {
    signature: txReceipt.transactionHash,
    status: 1, // CONFIRMED
    data: {
      tokenIn: inputToken.address,
      tokenOut: outputToken.address,
      amountIn,
      amountOut,
      fee,
      baseTokenBalanceChange,
      quoteTokenBalanceChange,
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
        description: 'Quote and execute a token swap on Uniswap Universal Router in one step',
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
        const { walletAddress, network, baseToken, quoteToken, amount, side, slippagePct, gasPrice, maxGas } =
          request.body as typeof UniswapExecuteSwapRequest._type;

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
