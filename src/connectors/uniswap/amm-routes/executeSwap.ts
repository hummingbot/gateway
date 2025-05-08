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
  Pair as V2Pair,
  Route as V2Route,
  Trade as V2Trade
} from '@uniswap/v2-sdk';
import { formatTokenAmount } from '../uniswap.utils';
import { BigNumber, Wallet } from 'ethers';
import { Contract } from '@ethersproject/contracts';

// Define V2 Router ABI
const IUniswapV2Router02ABI = {
  abi: [
    // Router methods for swapping
    {
      inputs: [
        { internalType: 'uint256', name: 'amountOutMin', type: 'uint256' },
        { internalType: 'address[]', name: 'path', type: 'address[]' },
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'deadline', type: 'uint256' }
      ],
      name: 'swapExactETHForTokens',
      outputs: [{ internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' }],
      stateMutability: 'payable',
      type: 'function'
    },
    {
      inputs: [
        { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
        { internalType: 'uint256', name: 'amountOutMin', type: 'uint256' },
        { internalType: 'address[]', name: 'path', type: 'address[]' },
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'deadline', type: 'uint256' }
      ],
      name: 'swapExactTokensForETH',
      outputs: [{ internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' }],
      stateMutability: 'nonpayable',
      type: 'function'
    },
    {
      inputs: [
        { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
        { internalType: 'uint256', name: 'amountOutMin', type: 'uint256' },
        { internalType: 'address[]', name: 'path', type: 'address[]' },
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'deadline', type: 'uint256' }
      ],
      name: 'swapExactTokensForTokens',
      outputs: [{ internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' }],
      stateMutability: 'nonpayable',
      type: 'function'
    },
    {
      inputs: [
        { internalType: 'uint256', name: 'amountOut', type: 'uint256' },
        { internalType: 'address[]', name: 'path', type: 'address[]' },
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'deadline', type: 'uint256' }
      ],
      name: 'swapETHForExactTokens',
      outputs: [{ internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' }],
      stateMutability: 'payable',
      type: 'function'
    },
    {
      inputs: [
        { internalType: 'uint256', name: 'amountOut', type: 'uint256' },
        { internalType: 'uint256', name: 'amountInMax', type: 'uint256' },
        { internalType: 'address[]', name: 'path', type: 'address[]' },
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'deadline', type: 'uint256' }
      ],
      name: 'swapTokensForExactETH',
      outputs: [{ internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' }],
      stateMutability: 'nonpayable',
      type: 'function'
    },
    {
      inputs: [
        { internalType: 'uint256', name: 'amountOut', type: 'uint256' },
        { internalType: 'uint256', name: 'amountInMax', type: 'uint256' },
        { internalType: 'address[]', name: 'path', type: 'address[]' },
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'deadline', type: 'uint256' }
      ],
      name: 'swapTokensForExactTokens',
      outputs: [{ internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' }],
      stateMutability: 'nonpayable',
      type: 'function'
    }
  ]
};

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: ExecuteSwapResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a swap on Uniswap V2 AMM',
        tags: ['uniswap/amm'],
        body: {
          ...ExecuteSwapRequest,
          properties: {
            ...ExecuteSwapRequest.properties,
            network: { type: 'string', default: 'base' },
            walletAddress: { type: 'string', examples: ['0x...'] },
            baseToken: { type: 'string', examples: ['WETH'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [0.01] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            poolAddress: { type: 'string', examples: [''] },
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
        const { network, poolAddress: requestedPoolAddress, baseToken, quoteToken, amount, side, slippagePct, walletAddress: requestedWalletAddress } = request.body;
        const networkToUse = network || 'base';

        // Validate essential parameters
        if (!baseToken || !quoteToken || !amount || !side) {
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
        const baseTokenObj = uniswap.getTokenBySymbol(baseToken);
        const quoteTokenObj = uniswap.getTokenBySymbol(quoteToken);

        if (!baseTokenObj || !quoteTokenObj) {
          throw fastify.httpErrors.badRequest(`Token not found: ${!baseTokenObj ? baseToken : quoteToken}`);
        }

        // Find pool address if not provided
        let poolAddressToUse = requestedPoolAddress;
        if (!poolAddressToUse) {
          poolAddressToUse = await uniswap.findDefaultPool(baseToken, quoteToken, 'amm');
          if (!poolAddressToUse) {
            throw fastify.httpErrors.notFound(
              `No AMM pool found for pair ${baseToken}-${quoteToken}`
            );
          }
        }

        // Get the wallet
        const wallet = await ethereum.getWallet(walletAddress);
        if (!wallet) {
          throw fastify.httpErrors.badRequest('Wallet not found');
        }

        // Get the V2 pair
        const pair = await uniswap.getV2Pool(baseTokenObj, quoteTokenObj, poolAddressToUse);
        if (!pair) {
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
          Math.floor(amount * Math.pow(10, inputToken.decimals)).toString()
        );

        // Create a route for the trade
        const route = new V2Route([pair], inputToken, outputToken);

        // Create the V2 trade
        const trade = new V2Trade(
          route,
          inputAmount,
          exactIn ? TradeType.EXACT_INPUT : TradeType.EXACT_OUTPUT
        );

        // Calculate slippage-adjusted amounts
        const slippageTolerance = slippagePct 
          ? new Percent(slippagePct, 100) 
          : uniswap.getAllowedSlippage();

        // Get the router contract with signer
        const routerAddress = uniswap.config.uniswapV2RouterAddress(networkToUse);
        const router = new Contract(
          routerAddress,
          IUniswapV2Router02ABI.abi,
          wallet
        );

        // Prepare the transaction parameters
        const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now
        const path = trade.route.path.map(token => token.address);
        
        let tx;
        if (exactIn) {
          // SwapExactTokensForTokens or SwapExactETHForTokens
          const amountOutMin = trade.minimumAmountOut(slippageTolerance).quotient.toString();
          
          if (inputToken.symbol === 'WETH') {
            // Swap exact ETH for tokens
            tx = await router.swapExactETHForTokens(
              amountOutMin,
              path,
              walletAddress,
              deadline,
              { 
                value: inputAmount.quotient.toString(),
                gasLimit: 250000
              }
            );
          } else if (outputToken.symbol === 'WETH') {
            // Swap exact tokens for ETH
            // First, approve router to spend tokens
            const tokenContract = new Contract(
              inputToken.address,
              [
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
              ],
              wallet
            );
            await tokenContract.approve(routerAddress, inputAmount.quotient.toString());
            
            tx = await router.swapExactTokensForETH(
              inputAmount.quotient.toString(),
              amountOutMin,
              path,
              walletAddress,
              deadline,
              { gasLimit: 250000 }
            );
          } else {
            // Swap exact tokens for tokens
            // First, approve router to spend tokens
            const tokenContract = new Contract(
              inputToken.address,
              [
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
              ],
              wallet
            );
            await tokenContract.approve(routerAddress, inputAmount.quotient.toString());
            
            tx = await router.swapExactTokensForTokens(
              inputAmount.quotient.toString(),
              amountOutMin,
              path,
              walletAddress,
              deadline,
              { gasLimit: 250000 }
            );
          }
        } else {
          // SwapTokensForExactTokens or SwapETHForExactTokens
          const amountInMax = trade.maximumAmountIn(slippageTolerance).quotient.toString();
          const amountOut = inputAmount.quotient.toString();
          
          if (inputToken.symbol === 'WETH') {
            // Swap ETH for exact tokens
            tx = await router.swapETHForExactTokens(
              amountOut,
              path,
              walletAddress,
              deadline,
              { 
                value: amountInMax,
                gasLimit: 250000
              }
            );
          } else if (outputToken.symbol === 'WETH') {
            // Swap tokens for exact ETH
            // First, approve router to spend tokens
            const tokenContract = new Contract(
              inputToken.address,
              [
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
              ],
              wallet
            );
            await tokenContract.approve(routerAddress, amountInMax);
            
            tx = await router.swapTokensForExactETH(
              amountOut,
              amountInMax,
              path,
              walletAddress,
              deadline,
              { gasLimit: 250000 }
            );
          } else {
            // Swap tokens for exact tokens
            // First, approve router to spend tokens
            const tokenContract = new Contract(
              inputToken.address,
              [
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
              ],
              wallet
            );
            await tokenContract.approve(routerAddress, amountInMax);
            
            tx = await router.swapTokensForExactTokens(
              amountOut,
              amountInMax,
              path,
              walletAddress,
              deadline,
              { gasLimit: 250000 }
            );
          }
        }

        // Wait for transaction confirmation
        const receipt = await tx.wait();
        
        // Calculate balance changes
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