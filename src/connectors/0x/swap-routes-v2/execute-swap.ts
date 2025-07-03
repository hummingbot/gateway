import { BigNumber } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  ExecuteSwapRequestType,
  SwapExecuteResponseType,
  SwapExecuteResponse,
} from '../../../schemas/swap-schema';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { ZeroX } from '../0x';
import { ZeroXExecuteSwapRequest } from '../schemas';

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
  _excludedSources?: string[],
  _includedSources?: string[],
): Promise<SwapExecuteResponseType> {
  const ethereum = await Ethereum.getInstance(network);
  const wallet = await ethereum.getWallet(walletAddress);
  const zeroX = await ZeroX.getInstance(network);

  // Resolve token symbols to addresses
  const baseTokenInfo = await ethereum.getTokenBySymbol(baseToken);
  const quoteTokenInfo = await ethereum.getTokenBySymbol(quoteToken);

  if (!baseTokenInfo || !quoteTokenInfo) {
    throw fastify.httpErrors.badRequest(
      sanitizeErrorMessage(
        'Token not found: {}',
        !baseTokenInfo ? baseToken : quoteToken,
      ),
    );
  }

  // Determine input/output based on side
  const sellToken =
    side === 'SELL' ? baseTokenInfo.address : quoteTokenInfo.address;
  const buyToken =
    side === 'SELL' ? quoteTokenInfo.address : baseTokenInfo.address;
  const tokenDecimals =
    side === 'SELL' ? baseTokenInfo.decimals : quoteTokenInfo.decimals;
  const sellTokenInfo = side === 'SELL' ? baseTokenInfo : quoteTokenInfo;
  const buyTokenInfo = side === 'SELL' ? quoteTokenInfo : baseTokenInfo;

  // Convert amount to token units
  const tokenAmount = zeroX.parseTokenAmount(amount, tokenDecimals);

  logger.info(
    `Executing swap for ${amount} ${side === 'SELL' ? baseToken : quoteToken} -> ${side === 'SELL' ? quoteToken : baseToken}`,
  );

  // Get quote from 0x API
  const quoteResponse = await zeroX.getQuote({
    sellToken,
    buyToken,
    sellAmount: side === 'SELL' ? tokenAmount : undefined,
    buyAmount: side === 'BUY' ? tokenAmount : undefined,
    takerAddress: walletAddress,
    slippagePercentage: zeroX.convertSlippageToPercentage(slippagePct),
    skipValidation: false,
  });

  // Check and approve allowance if needed
  if (sellTokenInfo.address !== ethereum.nativeTokenSymbol) {
    const tokenContract = ethereum.getContract(sellTokenInfo.address, wallet);
    const allowance = await ethereum.getERC20Allowance(
      tokenContract,
      wallet,
      quoteResponse.allowanceTarget,
      sellTokenInfo.decimals,
    );

    const requiredAllowance = BigNumber.from(quoteResponse.sellAmount);
    if (BigNumber.from(allowance.value).lt(requiredAllowance)) {
      logger.info(`Approving ${sellTokenInfo.symbol} for 0x swap`);
      await ethereum.approveERC20(
        tokenContract,
        wallet,
        quoteResponse.allowanceTarget,
        requiredAllowance,
      );
    }
  }

  // Execute the swap transaction
  const txData = {
    to: quoteResponse.to,
    data: quoteResponse.data,
    value: quoteResponse.value,
    gasLimit:
      maxGas || parseInt(quoteResponse.estimatedGas || quoteResponse.gas),
    ...(gasPrice && { gasPrice: BigNumber.from(gasPrice) }),
  };

  const txResponse = await wallet.sendTransaction(txData);
  const txReceipt = await txResponse.wait();

  if (!txReceipt || txReceipt.status !== 1) {
    throw fastify.httpErrors.internalServerError('Transaction failed');
  }

  // Calculate fee from gas used
  const fee = parseFloat(
    zeroX.formatTokenAmount(
      txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice).toString(),
      18,
    ),
  );

  // For now, use the quote amounts as the actual amounts
  // In a real implementation, you would extract actual amounts from events
  const baseTokenBalanceChange =
    side === 'SELL'
      ? -parseFloat(
          zeroX.formatTokenAmount(
            quoteResponse.sellAmount,
            baseTokenInfo.decimals,
          ),
        )
      : parseFloat(
          zeroX.formatTokenAmount(
            quoteResponse.buyAmount,
            baseTokenInfo.decimals,
          ),
        );
  const quoteTokenBalanceChange =
    side === 'SELL'
      ? parseFloat(
          zeroX.formatTokenAmount(
            quoteResponse.buyAmount,
            quoteTokenInfo.decimals,
          ),
        )
      : -parseFloat(
          zeroX.formatTokenAmount(
            quoteResponse.sellAmount,
            quoteTokenInfo.decimals,
          ),
        );

  // Calculate actual amounts swapped
  const totalInputSwapped =
    side === 'SELL'
      ? Math.abs(baseTokenBalanceChange)
      : Math.abs(quoteTokenBalanceChange);
  const totalOutputSwapped =
    side === 'SELL'
      ? Math.abs(quoteTokenBalanceChange)
      : Math.abs(baseTokenBalanceChange);

  logger.info(
    `Swap executed successfully: ${totalInputSwapped.toFixed(4)} ${sellTokenInfo.symbol} -> ${totalOutputSwapped.toFixed(4)} ${buyTokenInfo.symbol}`,
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
      tokenIn: sellToken,
      tokenOut: buyToken,
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
        description: 'Quote and execute a token swap on 0x in one step',
        tags: ['/connector/0x'],
        body: {
          ...ZeroXExecuteSwapRequest,
          properties: {
            ...ZeroXExecuteSwapRequest.properties,
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
          excludedSources,
          includedSources,
        } = request.body as typeof ZeroXExecuteSwapRequest._type;

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
          excludedSources,
          includedSources,
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
