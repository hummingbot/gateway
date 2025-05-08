import { FastifyPluginAsync } from 'fastify';
import { Ethereum } from '../../../chains/ethereum/ethereum';
import { logger } from '../../../services/logger';
import { 
  ExecuteSwapRequestType,
  ExecuteSwapResponseType,
  ExecuteSwapResponse
} from '../../../schemas/trading-types/swap-schema';
import { formatTokenAmount } from '../uniswap.utils';
import { Contract } from '@ethersproject/contracts';
import { BigNumber, ethers } from 'ethers';
import { getUniswapQuote } from './quote-swap';

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
        description: 'Execute a swap using Uniswap V3 Smart Order Router',
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
        
        // Get Ethereum instance for wallet operations
        const ethereum = await Ethereum.getInstance(networkToUse);
        
        // Get wallet address - either from request or first available
        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          walletAddress = await ethereum.getFirstWalletAddress();
          if (!walletAddress) {
            return reply.badRequest('No wallet address provided and no default wallet found');
          }
          logger.info(`Using first available wallet address: ${walletAddress}`);
        }

        // Get the wallet
        const wallet = await ethereum.getWallet(walletAddress);
        if (!wallet) {
          logger.error(`Wallet not found: ${walletAddress}`);
          return reply.badRequest('Wallet not found');
        }

        // Get a quote using the shared function
        // Use the wallet address as recipient for execution
        const quoteResult = await getUniswapQuote(
          fastify,
          networkToUse,
          baseTokenSymbol,
          quoteTokenSymbol,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct,
          walletAddress // Use real wallet address as recipient
        );
        
        // Extract what we need from the quote
        const { 
          route, 
          baseToken, 
          quoteToken, 
          inputToken, 
          outputToken, 
          inputAmount,
          slippageTolerance,
          exactIn
        } = quoteResult;

        // Get the router address using getSpender from contracts
        const { getSpender } = require('../uniswap.contracts');
        const routerAddress = getSpender(networkToUse, 'uniswap');
        logger.info(`Using Swap Router address: ${routerAddress}`);

        // If input token is not ETH, check allowance for the router
        if (inputToken.symbol !== 'ETH') {
          // Get token contract
          const tokenContract = ethereum.getContract(
            inputToken.address,
            wallet
          );
          
          // Check existing allowance for the router
          const allowance = await ethereum.getERC20Allowance(
            tokenContract,
            wallet,
            routerAddress,
            inputToken.decimals
          );
          
          // Calculate required amount
          const amountNeeded = BigNumber.from(inputAmount.quotient.toString());
          const currentAllowance = BigNumber.from(allowance.value);
          
          // Throw an error if allowance is insufficient
          if (currentAllowance.lt(amountNeeded)) {
            logger.error(`Insufficient allowance for ${inputToken.symbol}`);
            return reply.badRequest(
              `Insufficient allowance for ${inputToken.symbol}. Please approve at least ${formatTokenAmount(amountNeeded.toString(), inputToken.decimals)} ${inputToken.symbol} for the Uniswap router (${routerAddress}) using the /ethereum/approve endpoint`
            );
          } else {
            logger.info(`Sufficient allowance exists: ${formatTokenAmount(currentAllowance.toString(), inputToken.decimals)} ${inputToken.symbol}`);
          }
        }

        // Get transaction parameters from the route
        const { methodParameters } = route;
        
        if (!methodParameters) {
          logger.error('Failed to generate swap parameters');
          return reply.internalServerError('Failed to generate swap parameters');
        }

        logger.info('Generated method parameters successfully');
        logger.info(`Calldata length: ${methodParameters.calldata.length}`);
        logger.info(`Value: ${methodParameters.value}`);

        // Create the SwapRouter contract instance with the specific router address
        const swapRouter = new Contract(
          routerAddress,
          [SwapRouter02ABI],
          wallet
        );

        // Prepare transaction with gas settings from quote
        const txOptions = {
          value: methodParameters.value === '0x' ? '0' : methodParameters.value,
          gasLimit: quoteResult.gasLimit || 350000, // Use estimated gas from quote
          gasPrice: ethers.utils.parseUnits(quoteResult.gasPrice.toString(), 'gwei') // Convert the gas price from quote to wei
        };
        
        // Execute the swap using the multicall function
        logger.info(`Executing swap via multicall to router: ${routerAddress}`);
        const tx = await swapRouter.multicall(
          methodParameters.calldata,
          txOptions
        );

        // Wait for transaction confirmation
        logger.info(`Transaction sent: ${tx.hash}`);
        const receipt = await tx.wait();
        logger.info(`Transaction confirmed: ${receipt.transactionHash}`);
        
        // Get expected amounts from the route
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
        if (e.stack) {
          logger.debug(`Error stack: ${e.stack}`);
        }
        
        if (e.code === 'UNPREDICTABLE_GAS_LIMIT') {
          return reply.badRequest('Transaction failed: Insufficient funds or gas estimation error');
        }
        
        return reply.internalServerError(`Failed to execute swap: ${e.message}`);
      }
    }
  );
};

export default executeSwapRoute;