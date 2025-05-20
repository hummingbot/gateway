import { Contract } from '@ethersproject/contracts';
import { Token, CurrencyAmount, Percent, TradeType } from '@uniswap/sdk-core';
import {
  Pool as V3Pool,
  SwapRouter,
  Route as V3Route,
  Trade as V3Trade,
  MethodParameters,
  FeeAmount,
} from '@uniswap/v3-sdk';
import { BigNumber, utils } from 'ethers';
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import JSBI from 'jsbi';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { wrapEthereum } from '../../../chains/ethereum/routes/wrap';
import {
  ExecuteSwapRequestType,
  ExecuteSwapRequest,
  ExecuteSwapResponseType,
  ExecuteSwapResponse,
} from '../../../schemas/trading-types/swap-schema';
import { logger } from '../../../services/logger';
import { Uniswap } from '../uniswap';
import { formatTokenAmount, parseFeeTier } from '../uniswap.utils';

// Define a minimal ABI for ERC20 tokens
const ERC20_ABI = [
  {
    constant: false,
    inputs: [
      { name: '_spender', type: 'address' },
      { name: '_value', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

/**
 * Helper function to handle ETH to WETH wrapping when needed
 * Uses the existing wrapping functionality from wrap.ts
 */
async function handleWethWrapping(
  fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  inputToken: Token,
  amountInEth: string,
): Promise<string | null> {
  // Check if input token is WETH
  if (inputToken.symbol === 'WETH') {
    try {
      logger.info(`WETH detected as input token, checking if wrapping is needed`);

      // Use the existing wrapEthereum function from wrap.ts
      const wrapResult = await wrapEthereum(
        fastify,
        network,
        walletAddress,
        amountInEth,
      );

      logger.info(`Successfully wrapped ${amountInEth} ETH to WETH, txHash: ${wrapResult.txHash}`);
      return wrapResult.txHash;
    } catch (error) {
      logger.error(`Failed to wrap ETH to WETH: ${error.message}`);
      throw error; // Propagate the error to the caller
    }
  }

  // No wrapping needed
  return null;
}

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const ethereum = await Ethereum.getInstance('base');
  let firstWalletAddress = '<ethereum-wallet-address>';

  try {
    firstWalletAddress =
      (await ethereum.getFirstWalletAddress()) || firstWalletAddress;
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
        description: 'Execute a swap on Uniswap V3 CLMM',
        tags: ['uniswap/clmm'],
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
            poolAddress: { type: 'string', examples: [''] },
            slippagePct: { type: 'number', examples: [1] },
          },
        },
        response: {
          200: ExecuteSwapResponse,
        },
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
        } = request.body;

        const networkToUse = network || 'base';
        const chain = 'ethereum'; // Default to ethereum

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
          walletAddress = await uniswap.getFirstWalletAddress();
          if (!walletAddress) {
            throw fastify.httpErrors.badRequest(
              'No wallet address provided and no default wallet found',
            );
          }
          logger.info(`Using first available wallet address: ${walletAddress}`);
        }

        // Resolve tokens
        const baseTokenObj = uniswap.getTokenBySymbol(baseToken);
        const quoteTokenObj = uniswap.getTokenBySymbol(quoteToken);

        if (!baseTokenObj || !quoteTokenObj) {
          throw fastify.httpErrors.badRequest(
            `Token not found: ${!baseTokenObj ? baseToken : quoteToken}`,
          );
        }

        // Find pool address if not provided
        let poolAddress = requestedPoolAddress;
        if (!poolAddress) {
          poolAddress = await uniswap.findDefaultPool(
            baseToken,
            quoteToken,
            'clmm',
          );

          if (!poolAddress) {
            throw fastify.httpErrors.notFound(
              `No CLMM pool found for pair ${baseToken}-${quoteToken}`,
            );
          }
        }

        // Get the wallet
        const wallet = await ethereum.getWallet(walletAddress);
        if (!wallet) {
          throw fastify.httpErrors.badRequest('Wallet not found');
        }

        // We don't use feeTier anymore from request parameters
        // Get the V3 pool
        const pool = await uniswap.getV3Pool(
          baseTokenObj,
          quoteTokenObj,
          undefined,
          poolAddress,
        );
        if (!pool) {
          throw fastify.httpErrors.notFound(
            `Pool not found for ${baseToken}-${quoteToken}`,
          );
        }

        // Determine which token is being traded
        const exactIn = side === 'SELL';
        const [inputToken, outputToken] = exactIn
          ? [baseTokenObj, quoteTokenObj]
          : [quoteTokenObj, baseTokenObj];

        // Convert amount to token units with decimals
        const inputAmount = CurrencyAmount.fromRawAmount(
          inputToken,
          JSBI.BigInt(
            Math.floor(amount * Math.pow(10, inputToken.decimals)).toString(),
          ),
        );

        // Create a route for the trade
        const route = new V3Route([pool], inputToken, outputToken);

        // Create the V3 trade
        const trade = await V3Trade.fromRoute(
          route,
          inputAmount,
          exactIn ? TradeType.EXACT_INPUT : TradeType.EXACT_OUTPUT,
        );

        // Calculate slippage-adjusted amounts
        // Convert slippagePct to integer basis points (0.5% -> 50 basis points)
        const slippageTolerance = slippagePct !== undefined
          ? new Percent(Math.floor(slippagePct * 100), 10000)
          : uniswap.getAllowedSlippage();

        // Get swap parameters for V3 swap
        const routerSwapParams = SwapRouter.swapCallParameters(trade, {
          slippageTolerance,
          recipient: walletAddress,
          deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 20 minutes from now
        });

        // If input token is not ETH, check allowance for the router
        if (inputToken.symbol !== 'WETH') {
          // Get the router address that needs approval
          const router =
            uniswap.config.uniswapV3SmartOrderRouterAddress(networkToUse);

          // Get token contract
          const tokenContract = ethereum.getContract(
            inputToken.address,
            wallet,
          );

          // Check existing allowance
          const allowance = await ethereum.getERC20Allowance(
            tokenContract,
            wallet,
            router,
            inputToken.decimals,
          );

          // Calculate required amount
          const amountNeeded =
            routerSwapParams.value && routerSwapParams.value !== '0'
              ? BigNumber.from(routerSwapParams.value)
              : BigNumber.from(inputAmount.quotient.toString());

          const currentAllowance = BigNumber.from(allowance.value);

          // Instead of approving, throw an error if allowance is insufficient
          if (currentAllowance.lt(amountNeeded)) {
            logger.error(`Insufficient allowance for ${inputToken.symbol}`);
            throw new Error(
              `Insufficient allowance for ${inputToken.symbol}. Please approve at least ${formatTokenAmount(amountNeeded.toString(), inputToken.decimals)} ${inputToken.symbol} for the Uniswap router (${router})`,
            );
          } else {
            logger.info(
              `Sufficient allowance exists: ${formatTokenAmount(currentAllowance.toString(), inputToken.decimals)} ${inputToken.symbol}`,
            );
          }
        }

        // Execute the swap
        // In Uniswap V3, we use the SDK to generate the proper calldata
        // SwapRouter methods typically include:
        // - exactInput: For exact input swaps
        // - exactOutput: For exact output swaps

        // Use the parameters directly from the SDK
        const { value, calldata } = routerSwapParams;

        // Get the exact path from the trade to debug
        const pathAddresses = trade.swaps[0].route.tokenPath.map(t => t.address);
        const pathDescription = pathAddresses.join(' → ');
        logger.info(`Executing swap with path: ${pathDescription}`);
        logger.info(`Fee amount used: ${pool.fee}`);
        logger.info(`Swap call to: ${uniswap.config.uniswapV3SmartOrderRouterAddress(networkToUse)}`);
        logger.info(`Input amount: ${inputAmount.toSignificant(6)} ${inputToken.symbol}`);
        logger.info(`Expected output: ${trade.outputAmount.toSignificant(6)} ${outputToken.symbol}`);

        // If WETH is the input token, we need to wrap ETH first
        let wrapTxHash = null;
        if (inputToken.symbol === 'WETH' && value) {
          // Convert the value from wei to eth for the wrapping function
          const amountInEth = utils.formatEther(value);
          logger.info(`WETH detected as input token with value ${amountInEth} ETH, wrapping ETH to WETH first`);

          // Use the wrap function to convert ETH to WETH
          wrapTxHash = await handleWethWrapping(
            fastify,
            networkToUse,
            walletAddress,
            inputToken,
            amountInEth,
          );

          if (wrapTxHash) {
            logger.info(`Successfully wrapped ETH to WETH, transaction hash: ${wrapTxHash}`);
          }
        }

        try {
          // Execute the swap using the calldata from the SDK
          // If we already wrapped ETH to WETH, we don't need to send value with the transaction
          const tx = await wallet.sendTransaction({
            to: uniswap.config.uniswapV3SmartOrderRouterAddress(networkToUse),
            data: calldata,
            value: wrapTxHash ? '0' : (value ? value : '0'), // Don't send value if we already wrapped
            gasLimit: 350000, // V3 swaps use more gas
          });

          // Wait for transaction confirmation
          const receipt = await tx.wait();

          // Check if the transaction was successful
          if (receipt.status === 0) {
            logger.error(`Transaction failed on-chain. Receipt: ${JSON.stringify(receipt)}`);
            throw new Error("Transaction reverted on-chain. This could be due to slippage, insufficient funds, or other blockchain issues.");
          }

          // Calculate amounts for input and output
          const totalInputSwapped = formatTokenAmount(
            inputAmount.quotient.toString(),
            inputToken.decimals,
          );

          const totalOutputSwapped = formatTokenAmount(
            trade.outputAmount.quotient.toString(),
            outputToken.decimals,
          );

          // formatTokenAmount already returns numbers, so no conversion needed

          // Calculate balance changes as numbers
          const baseTokenBalanceChange =
            side === 'BUY' ? totalOutputSwapped : -totalInputSwapped;
          const quoteTokenBalanceChange =
            side === 'BUY' ? -totalInputSwapped : totalOutputSwapped;

          // Calculate gas fee (formatTokenAmount already returns a number)
          const gasFee = formatTokenAmount(
            receipt.gasUsed.mul(receipt.effectiveGasPrice).toString(),
            18, // ETH has 18 decimals
          );

          // Include both swap and wrap txHash in the response if applicable
          const txSignature = wrapTxHash
            ? `swap:${receipt.transactionHash},wrap:${wrapTxHash}`
            : receipt.transactionHash;

          return {
            signature: txSignature,
            totalInputSwapped: totalInputSwapped,
            totalOutputSwapped: totalOutputSwapped,
            fee: gasFee,
            baseTokenBalanceChange,
            quoteTokenBalanceChange,
          };
        } catch (error) {
          logger.error(`Swap execution error: ${error.message}`);
          if (error.transaction) {
            logger.debug(`Transaction details: ${JSON.stringify(error.transaction)}`);
          }
          if (error.receipt) {
            logger.debug(`Transaction receipt: ${JSON.stringify(error.receipt)}`);
          }

          // Provide more detailed error messages for common issues
          if (inputToken.symbol === 'WETH') {
            if (wrapTxHash) {
              logger.error(`ETH was wrapped (tx: ${wrapTxHash}) but swap failed. This could be a problem with the swap itself.`);
            } else if (!value) {
              logger.error('Possible ETH wrapping issue: Attempting to swap WETH but no ETH value was provided');
            } else {
              logger.error(`ETH wrapping may have failed. Check if you have enough ETH for both wrapping and gas fees.`);
            }
          }

          // Extract and log the specific error message
          const errorMessage = error.reason || error.message;
          throw new Error(`Failed to execute swap: ${errorMessage}`);
        }
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to execute swap');
      }
    },
  );
};

export default executeSwapRoute;
