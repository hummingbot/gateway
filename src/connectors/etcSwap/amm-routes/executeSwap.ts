import { BigNumber, Contract } from 'ethers';
import { FastifyPluginAsync } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { wrapEthereum } from '../../../chains/ethereum/routes/wrap';
import {
  ExecuteSwapRequest,
  ExecuteSwapRequestType,
  ExecuteSwapResponse,
  ExecuteSwapResponseType,
} from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { ETCSwap } from '../etcSwap';
import { getETCSwapV2RouterAddress, IETCSwapV2Router02ABI } from '../etcSwap.contracts';
import { formatTokenAmount } from '../etcSwap.utils';

import { getETCSwapAmmQuote } from './quoteSwap';

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  // Import the httpErrors plugin to ensure it's available
  await fastify.register(require('@fastify/sensible'));
  const walletAddressExample = await Ethereum.getWalletAddressExample();

  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: ExecuteSwapResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a swap on ETCSwap V2 AMM using Router02',
        tags: ['/connector/etcSwap'],
        body: {
          ...ExecuteSwapRequest,
          properties: {
            ...ExecuteSwapRequest.properties,
            walletAddress: { type: 'string', examples: [walletAddressExample] },
            network: { type: 'string', default: 'base' },
            poolAddress: { type: 'string', examples: [''] },
            baseToken: { type: 'string', examples: ['WETC'] },
            quoteToken: { type: 'string', examples: ['USC'] },
            amount: { type: 'number', examples: [0.001] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            slippagePct: { type: 'number', examples: [1] },
          },
        },
        response: { 200: ExecuteSwapResponse },
      },
    },
    async (request) => {
      try {
        const {
          network,
          poolAddress: requestedPoolAddress,
          baseToken,
          quoteToken,
          amount,
          side,
          slippagePct,
          walletAddress: requestedWalletAddress,
          priorityFeePerCU,
          computeUnits,
        } = request.body;

        const networkToUse = network;

        // Validate essential parameters
        if (!baseToken || !quoteToken || !amount || !side) {
          throw fastify.httpErrors.badRequest('Missing required parameters');
        }

        // Get wallet address - either from request or first available
        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          walletAddress = await Ethereum.getFirstWalletAddress();
          if (!walletAddress) {
            throw fastify.httpErrors.badRequest('No wallet address provided and no wallets found.');
          }
          logger.info(`Using first available wallet address: ${walletAddress}`);
        }

        // Find pool address if not provided
        const etcSwap = await ETCSwap.getInstance(networkToUse);
        let poolAddress = requestedPoolAddress;
        if (!poolAddress) {
          poolAddress = await etcSwap.findDefaultPool(baseToken, quoteToken, 'amm');

          if (!poolAddress) {
            throw fastify.httpErrors.notFound(`No AMM pool found for pair ${baseToken}-${quoteToken}`);
          }
        }

        // Get quote using the shared quote function - this eliminates duplication
        const { quote, ethereum } = await getETCSwapAmmQuote(
          fastify,
          networkToUse,
          poolAddress,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct,
        );

        // Get the wallet
        const wallet = await ethereum.getWallet(walletAddress);
        if (!wallet) {
          throw fastify.httpErrors.badRequest('Wallet not found');
        }

        // Extract info from quote
        let wrapTxHash = null;
        let inputTokenAddress = quote.inputToken.address;
        let outputTokenAddress = quote.outputToken.address;

        // Handle ETC->WETC wrapping if needed
        if (baseToken === 'ETC' && side === 'SELL') {
          const wethToken = etcSwap.getTokenBySymbol('WETC');
          if (!wethToken) {
            throw new Error('WETC token not found');
          }

          logger.info(`ETC detected as input token, wrapping ${amount} ETC to WETC first`);

          const wrapResult = await wrapEthereum(fastify, networkToUse, walletAddress, amount.toString());
          wrapTxHash = wrapResult.signature;
          inputTokenAddress = wethToken.address;

          logger.info(`Successfully wrapped ${amount} ETC to WETC, transaction hash: ${wrapTxHash}`);
        }

        // Handle output ETC conversion (we're using WETC)
        if (quoteToken === 'ETC' && side === 'BUY') {
          const wethToken = etcSwap.getTokenBySymbol('WETC');
          if (!wethToken) {
            throw new Error('WETC token not found');
          }
          outputTokenAddress = wethToken.address;
          logger.info('ETC detected as output token, will use WETC instead');
        }

        // Get Router02 contract
        const routerAddress = getETCSwapV2RouterAddress(networkToUse);
        const routerContract = new Contract(routerAddress, IETCSwapV2Router02ABI.abi, wallet);

        logger.info(`Executing swap using Router02:`);
        logger.info(`Router address: ${routerAddress}`);
        logger.info(`Pool address: ${poolAddress}`);
        logger.info(`Input token: ${inputTokenAddress}`);
        logger.info(`Output token: ${outputTokenAddress}`);
        logger.info(`Side: ${side}`);
        logger.info(`Path: ${quote.pathAddresses.join(' -> ')}`);

        // Check allowance for input token (all are now ERC20 tokens after potential wrapping)
        const tokenContract = ethereum.getContract(inputTokenAddress, wallet);
        const allowance = await ethereum.getERC20Allowance(
          tokenContract,
          wallet,
          routerAddress,
          quote.inputToken.decimals,
        );

        const amountNeeded = side === 'SELL' ? quote.rawAmountIn : quote.rawMaxAmountIn;
        const currentAllowance = BigNumber.from(allowance.value);

        logger.info(
          `Current allowance: ${formatTokenAmount(currentAllowance.toString(), quote.inputToken.decimals)} ${quote.inputToken.symbol}`,
        );
        logger.info(
          `Amount needed: ${formatTokenAmount(amountNeeded, quote.inputToken.decimals)} ${quote.inputToken.symbol}`,
        );

        // Check if allowance is sufficient
        if (currentAllowance.lt(amountNeeded)) {
          logger.error(`Insufficient allowance for ${quote.inputToken.symbol}`);
          throw new Error(
            `Insufficient allowance for ${quote.inputToken.symbol}. Please approve at least ${formatTokenAmount(amountNeeded, quote.inputToken.decimals)} ${quote.inputToken.symbol} for the ETCSwap router (${routerAddress})`,
          );
        } else {
          logger.info(
            `Sufficient allowance exists: ${formatTokenAmount(currentAllowance.toString(), quote.inputToken.decimals)} ${quote.inputToken.symbol}`,
          );
        }

        // Prepare transaction parameters
        const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now

        // Use provided gas parameters or defaults
        const gasLimit = computeUnits || 300000;

        // For Ethereum, priorityFeePerCU is interpreted as gas price in Gwei
        const txOptions: any = { gasLimit };

        if (priorityFeePerCU !== undefined) {
          // Convert from Gwei to Wei (1 Gwei = 1e9 Wei)
          const gasPriceWei = BigNumber.from(priorityFeePerCU).mul(1e9);
          txOptions.gasPrice = gasPriceWei;
          logger.info(`Using custom gas price: ${priorityFeePerCU} Gwei`);
        }

        logger.info(`Using gas limit: ${gasLimit}`);

        let tx;
        if (side === 'SELL') {
          // swapExactTokensForTokens - we know the exact input amount
          logger.info(`ExactTokensForTokens params:`);
          logger.info(`  amountIn: ${quote.rawAmountIn}`);
          logger.info(`  amountOutMin: ${quote.rawMinAmountOut}`);
          logger.info(`  path: ${quote.pathAddresses}`);
          logger.info(`  deadline: ${deadline}`);

          tx = await routerContract.swapExactTokensForTokens(
            quote.rawAmountIn,
            quote.rawMinAmountOut,
            quote.pathAddresses,
            walletAddress,
            deadline,
            txOptions,
          );
        } else {
          // swapTokensForExactTokens - we know the exact output amount
          logger.info(`TokensForExactTokens params:`);
          logger.info(`  amountOut: ${quote.rawAmountOut}`);
          logger.info(`  amountInMax: ${quote.rawMaxAmountIn}`);
          logger.info(`  path: ${quote.pathAddresses}`);
          logger.info(`  deadline: ${deadline}`);

          tx = await routerContract.swapTokensForExactTokens(
            quote.rawAmountOut,
            quote.rawMaxAmountIn,
            quote.pathAddresses,
            walletAddress,
            deadline,
            txOptions,
          );
        }

        logger.info(`Transaction sent: ${tx.hash}`);

        // Calculate amounts using quote values
        const amountIn = quote.estimatedAmountIn;
        const amountOut = quote.estimatedAmountOut;

        // Calculate balance changes as numbers
        const baseTokenBalanceChange = side === 'BUY' ? amountOut : -amountIn;
        const quoteTokenBalanceChange = side === 'BUY' ? -amountIn : amountOut;

        // Determine token addresses for computed fields
        const tokenIn = quote.inputToken.address;
        const tokenOut = quote.outputToken.address;

        return {
          signature: tx.hash,
          status: 0, // UNCONFIRMED
          data: undefined,
        };
      } catch (error) {
        logger.error(`Swap execution error: ${error.message}`);
        if (error.transaction) {
          logger.debug(`Transaction details: ${JSON.stringify(error.transaction)}`);
        }
        if (error.receipt) {
          logger.debug(`Transaction receipt: ${JSON.stringify(error.receipt)}`);
        }

        // Check if this is already a fastify error
        if (error.statusCode) {
          throw error;
        }

        // Provide more detailed error messages for common issues
        const errorMessage = error.reason || error.message;
        throw fastify.httpErrors.internalServerError(`Failed to execute swap: ${errorMessage}`);
      }
    },
  );
};

export default executeSwapRoute;
