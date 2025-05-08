import { FastifyPluginAsync } from 'fastify';
import { Uniswap } from '../uniswap';
import { Ethereum } from '../../../chains/ethereum/ethereum';
import { logger } from '../../../services/logger';
import { 
  ExecuteSwapRequestType,
  ExecuteSwapRequest,
  ExecuteSwapResponseType,
  ExecuteSwapResponse
} from '../../../schemas/trading-types/swap-schema';
import {
  Token,
  CurrencyAmount,
  Percent,
  TradeType,
} from '@uniswap/sdk-core';
import { formatTokenAmount } from '../uniswap.utils';
import { BigNumber } from 'ethers';
import { ethers } from 'ethers';
import JSBI from 'jsbi';

// Import the getUniversalRouterQuote function from quote-swap
import { getUniversalRouterQuote } from './quote-swap';
// SwapRoute from AlphaRouter
import { SwapRoute } from '@uniswap/smart-order-router';

export const executeSwapRoute: FastifyPluginAsync = async (fastify, _options) => {
  // Import the httpErrors plugin to ensure it's available
  await fastify.register(require('@fastify/sensible'));
  // Get first wallet address for example
  const ethereum = await Ethereum.getInstance('base');
  let firstWalletAddress = '<ethereum-wallet-address>';
  
  try {
    firstWalletAddress = await ethereum.getFirstWalletAddress() || firstWalletAddress;
  } catch (error) {
    logger.warn('No wallets found for examples in schema');
  }
  
  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: ExecuteSwapResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a swap using Uniswap Universal Router (the preferred entry point for trading on Uniswap)',
        tags: ['uniswap'],
        body: {
          type: 'object',
          properties: {
            network: { type: 'string', default: 'base' },
            walletAddress: { type: 'string', examples: [firstWalletAddress] },
            baseToken: { type: 'string', examples: ['WETH'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [0.001] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            slippagePct: { type: 'number', examples: [0.5] }
          },
          required: ['walletAddress', 'baseToken', 'quoteToken', 'amount', 'side']
        },
        response: {
          200: ExecuteSwapResponse
        },
      }
    },
    async (request, reply) => {
      try {
        // Log the request parameters for debugging
        logger.info(`Received execute-swap request: ${JSON.stringify(request.body)}`);
        const { 
          network, 
          walletAddress: requestedWalletAddress,
          baseToken: baseTokenSymbol, 
          quoteToken: quoteTokenSymbol, 
          amount, 
          side, 
          slippagePct 
        } = request.body;
        
        const networkToUse = network || 'base';

        // Validate essential parameters
        if (!baseTokenSymbol || !quoteTokenSymbol || !amount || !side) {
          logger.error('Missing required parameters in request');
          return reply.badRequest('Missing required parameters');
        }
        
        // Get Uniswap and Ethereum instances
        const uniswap = await Uniswap.getInstance(networkToUse);
        const ethereum = await Ethereum.getInstance(networkToUse);
        
        // Get wallet address - either from request or first available
        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          walletAddress = await ethereum.getFirstWalletAddress();
          if (!walletAddress) {
            throw fastify.httpErrors.badRequest('No wallet address provided and no default wallet found');
          }
          logger.info(`Using first available wallet address: ${walletAddress}`);
        }

        // Resolve tokens
        const baseToken = uniswap.getTokenBySymbol(baseTokenSymbol);
        const quoteToken = uniswap.getTokenBySymbol(quoteTokenSymbol);

        if (!baseToken || !quoteToken) {
          logger.error(`Token not found: ${!baseToken ? baseTokenSymbol : quoteTokenSymbol}`);
          return reply.badRequest(`Token not found: ${!baseToken ? baseTokenSymbol : quoteTokenSymbol}`);
        }

        // Get the wallet
        const wallet = await ethereum.getWallet(walletAddress);
        if (!wallet) {
          logger.error(`Wallet not found: ${walletAddress}`);
          return reply.badRequest('Wallet not found');
        }

        // Determine which token is being traded
        const exactIn = side === 'SELL';
        const [inputToken, outputToken] = exactIn 
          ? [baseToken, quoteToken] 
          : [quoteToken, baseToken];

        // Convert amount to token units with decimals
        const inputAmount = CurrencyAmount.fromRawAmount(
          inputToken,
          JSBI.BigInt(Math.floor(amount * Math.pow(10, inputToken.decimals)).toString())
        );

        // Calculate slippage tolerance - use provided slippage or default from config
        const slippageTolerance = slippagePct ? 
          new Percent(Math.floor(slippagePct * 100), 10000) : 
          uniswap.getAllowedSlippage();

        // Check if we have a cached route from quote-swap
        const cacheKey = `${networkToUse}-${baseTokenSymbol}-${quoteTokenSymbol}-${amount}-${side}`;
        const cacheProperty = `uniswapRouteCache_${cacheKey}`;
        
        let swapRoute: SwapRoute;
        
        if (fastify[cacheProperty] && fastify[cacheProperty].expiresAt > Date.now()) {
          // Use the cached route if valid
          logger.info('Using cached route from previous quote');
          swapRoute = fastify[cacheProperty].route;
        } else {
          // If no cached route, generate a new one
          logger.info('Generating new route for swap execution');
          swapRoute = await getUniversalRouterQuote(
            ethereum, 
            inputToken, 
            outputToken, 
            inputAmount, 
            exactIn, 
            slippageTolerance
          );
        }

        // Check if methodParameters are available
        if (!swapRoute.methodParameters) {
          logger.error('Failed to generate swap parameters');
          return reply.internalServerError('Failed to generate swap parameters');
        }

        // Get the Universal Router address for this network
        const { getUniversalRouterAddress } = require('../uniswap.contracts');
        const universalRouterAddress = getUniversalRouterAddress(networkToUse);

        // If input token is not ETH, check allowance for the Universal Router
        if (inputToken.symbol !== 'WETH') {
          // Get token contract
          const tokenContract = ethereum.getContract(
            inputToken.address,
            wallet
          );
          
          // Check existing allowance for the Universal Router
          const allowance = await ethereum.getERC20Allowance(
            tokenContract,
            wallet,
            universalRouterAddress,
            inputToken.decimals
          );
          
          // Calculate required amount
          const amountNeeded = swapRoute.methodParameters && swapRoute.methodParameters.value !== '0x00' ? 
            BigNumber.from(swapRoute.methodParameters.value) : 
            BigNumber.from(inputAmount.quotient.toString());
          
          // Compare allowance to required amount
          const currentAllowance = BigNumber.from(allowance.value);
          
          // Show error if allowance is insufficient
          if (currentAllowance.lt(amountNeeded)) {
            logger.error(`Insufficient allowance for ${inputToken.symbol}`);
            return reply.badRequest(
              `Insufficient allowance for ${inputToken.symbol}. Please approve at least ${formatTokenAmount(amountNeeded.toString(), inputToken.decimals)} ${inputToken.symbol} for the Uniswap Universal Router (${universalRouterAddress})`
            );
          } else {
            logger.info(`Sufficient allowance exists: ${formatTokenAmount(currentAllowance.toString(), inputToken.decimals)} ${inputToken.symbol}`);
          }
        }

        // Extract method parameters from the swap route
        const { calldata, value } = swapRoute.methodParameters;
        
        // Prepare transaction with gas settings
        const txOptions = {
          value: value || '0',
          gasLimit: 500000, // Universal Router swaps need more gas
          gasPrice: await wallet.getGasPrice() // Use network gas price
        };
        
        // Send the calldata to the Universal Router address (not the SwapRouter02 address)
        // This is the key step to use Universal Router even though we generated calldata with SwapRouter02 type
        const tx = await wallet.sendTransaction({
          to: universalRouterAddress,
          data: calldata,
          ...txOptions
        });

        // Wait for transaction confirmation
        const receipt = await tx.wait();
        
        // Calculate estimated amounts
        const totalInputSwapped = Number(formatTokenAmount(
          exactIn ? inputAmount.quotient.toString() : swapRoute.quote.quotient.toString(),
          inputToken.decimals
        ));
        
        const totalOutputSwapped = Number(formatTokenAmount(
          exactIn ? swapRoute.quote.quotient.toString() : inputAmount.quotient.toString(),
          outputToken.decimals
        ));
        
        // Calculate balance changes based on direction
        const baseTokenBalanceChange = side === 'BUY' ? totalOutputSwapped : -totalInputSwapped;
        const quoteTokenBalanceChange = side === 'BUY' ? -totalInputSwapped : totalOutputSwapped;
        
        // Calculate gas fee
        const gasFee = Number(formatTokenAmount(
          receipt.gasUsed.mul(receipt.effectiveGasPrice).toString(),
          18 // ETH has 18 decimals
        ));

        return {
          signature: receipt.transactionHash,
          totalInputSwapped,
          totalOutputSwapped,
          fee: gasFee,
          baseTokenBalanceChange,
          quoteTokenBalanceChange
        };
      } catch (e) {
        logger.error(`Execute swap error: ${e.message}`);
        if (e.stack) {
          logger.debug(`Error stack: ${e.stack}`);
        }
        
        // Specific error handling for allowance issues
        if (e.message && e.message.includes('Insufficient allowance')) {
          return reply.badRequest(e.message);
        }
        
        // Handle transaction failures
        if (e.code === 'UNPREDICTABLE_GAS_LIMIT' || e.message.includes('insufficient funds')) {
          return reply.badRequest('Transaction failed: Insufficient funds or gas estimation error');
        }
        
        // Generic error handling
        return reply.internalServerError(`Failed to execute swap: ${e.message}`);
      }
    }
  );
};

export default executeSwapRoute;