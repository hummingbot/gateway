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
import { Contract } from '@ethersproject/contracts';
import { BigNumber, utils } from 'ethers';
import { AlphaRouter, SwapType, SwapOptions } from '@uniswap/smart-order-router';
import { ethers } from 'ethers';
import JSBI from 'jsbi';

// Router02 ABI for executing swaps
const SwapRouter02ABI = {
  inputs: [
    { internalType: 'bytes', name: 'data', type: 'bytes' }
  ],
  name: 'multicall',
  outputs: [
    { internalType: 'bytes[]', name: 'results', type: 'bytes[]' }
  ],
  stateMutability: 'payable',
  type: 'function'
};

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
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
        description: 'Execute a swap using Uniswap V3 SmartOrderRouter',
        tags: ['uniswap'],
        body: {
          ...ExecuteSwapRequest,
          properties: {
            ...ExecuteSwapRequest.properties,
            network: { type: 'string', default: 'base' },
            walletAddress: { type: 'string', examples: [firstWalletAddress] },
            baseToken: { type: 'string', examples: ['WETH'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [0.001] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            slippagePct: { type: 'number', examples: [0.5] }
          }
        },
        response: {
          200: ExecuteSwapResponse
        },
      }
    },
    async (request) => {
      try {
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
          throw fastify.httpErrors.badRequest('Missing required parameters');
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
          throw fastify.httpErrors.badRequest(`Token not found: ${!baseToken ? baseTokenSymbol : quoteTokenSymbol}`);
        }

        // Get the wallet
        const wallet = await ethereum.getWallet(walletAddress);
        if (!wallet) {
          throw fastify.httpErrors.badRequest('Wallet not found');
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

        // Calculate slippage tolerance
        const slippageTolerance = slippagePct 
          ? new Percent(Math.floor(slippagePct * 100), 10000)  // Convert to basis points
          : new Percent(50, 10000); // 0.5% default slippage

        // Initialize AlphaRouter for optimal routing
        const alphaRouter = new AlphaRouter({
          chainId: ethereum.chainId,
          provider: ethereum.provider as ethers.providers.JsonRpcProvider,
        });

        // Configure swap options
        const swapOptions: SwapOptions = {
          recipient: walletAddress,
          slippageTolerance,
          deadline: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
          type: SwapType.SWAP_ROUTER_02,
        };

        // Generate a swap route
        const route = await alphaRouter.route(
          inputAmount,
          outputToken,
          exactIn ? TradeType.EXACT_INPUT : TradeType.EXACT_OUTPUT,
          swapOptions
        );

        if (!route) {
          throw fastify.httpErrors.badRequest(`Could not find a route for ${baseTokenSymbol}-${quoteTokenSymbol}`);
        }

        // If input token is not ETH, check allowance for the router
        if (inputToken.symbol !== 'WETH') {
          // Get the router address that needs approval
          const router = uniswap.config.uniswapV3SmartOrderRouterAddress(networkToUse);
          
          // Get token contract
          const tokenContract = ethereum.getContract(
            inputToken.address,
            wallet
          );
          
          // Check existing allowance
          const allowance = await ethereum.getERC20Allowance(
            tokenContract,
            wallet,
            router,
            inputToken.decimals
          );
          
          // Calculate required amount
          const amountNeeded = route.methodParameters && route.methodParameters.value !== '0x00' ? 
            BigNumber.from(route.methodParameters.value) : 
            BigNumber.from(inputAmount.quotient.toString());
            
          const currentAllowance = BigNumber.from(allowance.value);
          
          // Instead of approving, throw an error if allowance is insufficient
          if (currentAllowance.lt(amountNeeded)) {
            logger.error(`Insufficient allowance for ${inputToken.symbol}`);
            throw new Error(
              `Insufficient allowance for ${inputToken.symbol}. Please approve at least ${formatTokenAmount(amountNeeded.toString(), inputToken.decimals)} ${inputToken.symbol} for the Uniswap router (${router})`
            );
          } else {
            logger.info(`Sufficient allowance exists: ${formatTokenAmount(currentAllowance.toString(), inputToken.decimals)} ${inputToken.symbol}`);
          }
        }

        // Get transaction parameters
        const { methodParameters } = route;
        
        if (!methodParameters) {
          throw fastify.httpErrors.internalServerError('Failed to generate swap parameters');
        }

        // Create the SwapRouter contract instance
        const swapRouter = new Contract(
          uniswap.config.uniswapV3SmartOrderRouterAddress(networkToUse),
          [SwapRouter02ABI],
          wallet
        );

        // Prepare transaction with gas settings
        const txOptions = {
          value: methodParameters.value === '0x' ? '0' : methodParameters.value,
          gasLimit: 350000, // V3 swaps need more gas
          gasPrice: await wallet.getGasPrice() // Use network gas price
        };
        
        // Execute the swap
        const tx = await swapRouter.multicall(
          methodParameters.calldata,
          txOptions
        );

        // Wait for transaction confirmation
        const receipt = await tx.wait();
        
        // Get expected and actual amounts from the route
        let totalInputSwapped, totalOutputSwapped;
        
        // For SELL (exactIn), we know the exact input amount, output is estimated
        if (exactIn) {
          totalInputSwapped = Number(formatTokenAmount(
            inputAmount.quotient.toString(),
            inputToken.decimals
          ));
          
          totalOutputSwapped = Number(formatTokenAmount(
            route.quote.quotient.toString(),
            outputToken.decimals
          ));
        } 
        // For BUY (exactOut), the output is exact, input is estimated
        else {
          totalOutputSwapped = Number(formatTokenAmount(
            inputAmount.quotient.toString(),
            outputToken.decimals
          ));
          
          totalInputSwapped = Number(formatTokenAmount(
            route.quote.quotient.toString(),
            inputToken.decimals
          ));
        }
        
        // Set balance changes based on direction
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
        
        // Specific error handling for allowance issues
        if (e.message && e.message.includes('Insufficient allowance')) {
          throw fastify.httpErrors.badRequest(e.message);
        }
        
        // Handle transaction failures
        if (e.code === 'UNPREDICTABLE_GAS_LIMIT' || e.message.includes('insufficient funds')) {
          throw fastify.httpErrors.badRequest('Transaction failed: Insufficient funds or gas estimation error');
        }
        
        throw e.statusCode ? e : fastify.httpErrors.internalServerError(`Failed to execute swap: ${e.message}`);
      }
    }
  );
};

export default executeSwapRoute;