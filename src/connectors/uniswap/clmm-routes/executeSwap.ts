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
import {
  Pool as V3Pool,
  SwapRouter,
  Route as V3Route,
  Trade as V3Trade,
  MethodParameters,
  FeeAmount
} from '@uniswap/v3-sdk';
import { formatTokenAmount, parseFeeTier } from '../uniswap.utils';
import { Contract } from '@ethersproject/contracts';
import { BigNumber } from 'ethers';
import JSBI from 'jsbi';

// Define a minimal ABI for ERC20 tokens
const ERC20_ABI = [
  {
    constant: false,
    inputs: [
      { name: '_spender', type: 'address' },
      { name: '_value', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function'
  }
];

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: ExecuteSwapResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a swap on Uniswap V3 CLMM',
        tags: ['uniswap/clmm'],
        body: {
          ...ExecuteSwapRequest,
          properties: {
            ...ExecuteSwapRequest.properties,
            network: { type: 'string', default: 'base' },
            walletAddress: { type: 'string', examples: ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'] },
            baseToken: { type: 'string', examples: ['WETH'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [0.01] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            feeTier: { type: 'string', enum: ['LOWEST', 'LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' },
            slippagePct: { type: 'number', examples: [1] }
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
          poolAddress: requestedPoolAddress, 
          baseToken, 
          quoteToken, 
          amount, 
          side, 
          feeTier, 
          slippagePct, 
          walletAddress: requestedWalletAddress 
        } = request.body;
        
        const networkToUse = network || 'base';
        const chain = 'ethereum'; // Default to ethereum

        // Validate essential parameters
        if (!baseToken || !quoteToken || !amount || !side) {
          throw fastify.httpErrors.badRequest('Missing required parameters');
        }

        // Get Uniswap and Ethereum instances
        const uniswap = await Uniswap.getInstance(chain, networkToUse);
        const ethereum = await Ethereum.getInstance(networkToUse);
        
        // Get wallet address - either from request or first available
        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          walletAddress = await uniswap.getFirstWalletAddress();
          if (!walletAddress) {
            throw fastify.httpErrors.badRequest('No wallet address provided and no default wallet found');
          }
          logger.info(`Using first available wallet address: ${walletAddress}`);
        }

        // Resolve tokens
        const baseTokenObj = uniswap.getTokenBySymbol(baseToken);
        const quoteTokenObj = uniswap.getTokenBySymbol(quoteToken);

        if (!baseTokenObj || !quoteTokenObj) {
          throw fastify.httpErrors.badRequest(`Token not found: ${!baseTokenObj ? baseToken : quoteToken}`);
        }

        // Find pool address if not provided
        let poolAddress = requestedPoolAddress;
        if (!poolAddress) {
          poolAddress = await uniswap.findDefaultPool(baseToken, quoteToken, 'clmm');
          
          if (!poolAddress) {
            throw fastify.httpErrors.notFound(
              `No CLMM pool found for pair ${baseToken}-${quoteToken}`
            );
          }
        }

        // Get the wallet
        const wallet = await ethereum.getWallet(walletAddress);
        if (!wallet) {
          throw fastify.httpErrors.badRequest('Wallet not found');
        }

        // Convert feeTier to FeeAmount if provided
        const feeAmount = feeTier ? parseFeeTier(feeTier) : undefined;

        // Get the V3 pool
        const pool = await uniswap.getV3Pool(baseTokenObj, quoteTokenObj, feeAmount, poolAddress);
        if (!pool) {
          throw fastify.httpErrors.notFound(`Pool not found for ${baseToken}-${quoteToken}`);
        }

        // Determine which token is being traded
        const exactIn = side === 'SELL';
        const [inputToken, outputToken] = exactIn 
          ? [baseTokenObj, quoteTokenObj] 
          : [quoteTokenObj, baseTokenObj];

        // Convert amount to token units with decimals
        const inputAmount = CurrencyAmount.fromRawAmount(
          inputToken,
          JSBI.BigInt(Math.floor(amount * Math.pow(10, inputToken.decimals)).toString())
        );

        // Create a route for the trade
        const route = new V3Route([pool], inputToken, outputToken);

        // Create the V3 trade
        const trade = await V3Trade.fromRoute(
          route,
          inputAmount,
          exactIn ? TradeType.EXACT_INPUT : TradeType.EXACT_OUTPUT
        );

        // Calculate slippage-adjusted amounts
        const slippageTolerance = slippagePct 
          ? new Percent(slippagePct, 100) 
          : uniswap.getAllowedSlippage();

        // Get swap parameters for V3 swap
        const routerSwapParams = SwapRouter.swapCallParameters(trade, {
          slippageTolerance,
          recipient: walletAddress,
          deadline: Math.floor(Date.now() / 1000) + 60 * 20 // 20 minutes from now
        });

        // If input token is not ETH, approve the router to spend the tokens
        if (inputToken.symbol !== 'WETH') {
          const tokenContract = new Contract(
            inputToken.address,
            ERC20_ABI,
            wallet
          );
          
          // Approve the router to spend tokens
          const router = uniswap.config.uniswapV3SmartOrderRouterAddress(chain, networkToUse);
          const approvalTx = await tokenContract.approve(
            router,
            routerSwapParams.value && routerSwapParams.value !== '0' ? 
              BigNumber.from(routerSwapParams.value) : 
              inputAmount.quotient.toString()
          );
          
          // Wait for approval transaction to be mined
          await approvalTx.wait();
        }

        // Create the SwapRouter contract instance
        const swapRouter = new Contract(
          uniswap.config.uniswapV3SmartOrderRouterAddress(chain, networkToUse),
          [
            {
              inputs: [
                { internalType: 'bytes', name: 'data', type: 'bytes' }
              ],
              name: 'multicall',
              outputs: [
                { internalType: 'bytes[]', name: 'results', type: 'bytes[]' }
              ],
              stateMutability: 'payable',
              type: 'function'
            }
          ],
          wallet
        );
        
        // Execute the swap
        // In Uniswap V3, the exact method depends on the swap type, but we'll use a simplified approach
        // SwapRouter methods typically include:
        // - exactInput: For exact input swaps
        // - exactOutput: For exact output swaps
        
        // For simplicity, we'll use a single call method
        const swapMethod = exactIn ? 'exactInput' : 'exactOutput';
        const encodedSwapParams = {
          // We need to create the path differently since V3Route structure is different
          path: Buffer.from(trade.swaps[0].route.tokenPath.map(t => t.address).join('')),
          recipient: walletAddress,
          deadline: Math.floor(Date.now() / 1000) + 60 * 20,
          amountIn: inputAmount.quotient.toString(),
          amountOutMinimum: trade.minimumAmountOut(slippageTolerance).quotient.toString()
        };
        
        const tx = await swapRouter.multicall(
          [swapMethod, encodedSwapParams],
          { 
            value: inputToken.symbol === 'WETH' ? inputAmount.quotient.toString() : 0,
            gasLimit: 350000 // V3 swaps use more gas
          }
        );

        // Wait for transaction confirmation
        const receipt = await tx.wait();
        
        // Calculate amounts for response
        const totalInputSwapped = formatTokenAmount(
          inputAmount.quotient.toString(),
          inputToken.decimals
        );
        
        const totalOutputSwapped = formatTokenAmount(
          trade.outputAmount.quotient.toString(),
          outputToken.decimals
        );

        const baseTokenBalanceChange = side === 'BUY' ? totalOutputSwapped : -totalInputSwapped;
        const quoteTokenBalanceChange = side === 'BUY' ? -totalInputSwapped : totalOutputSwapped;
        
        // Calculate gas fee
        const gasFee = formatTokenAmount(
          receipt.gasUsed.mul(receipt.effectiveGasPrice).toString(),
          18 // ETH has 18 decimals
        );

        return {
          signature: receipt.transactionHash,
          totalInputSwapped,
          totalOutputSwapped,
          fee: gasFee,
          baseTokenBalanceChange,
          quoteTokenBalanceChange
        };
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to execute swap');
      }
    }
  );
};

export default executeSwapRoute;