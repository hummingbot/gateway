import { BigNumber, ethers } from 'ethers';
import { FastifyPluginAsync } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  ExecuteSwapRequest,
  ExecuteSwapResponse,
  ExecuteSwapRequestType,
  ExecuteSwapResponseType,
} from '../../../schemas/swap-schema';
import { logger } from '../../../services/logger';
import { ZeroX } from '../0x';
import { ZeroXConfig } from '../0x.config';

export const executeSwapRoute: FastifyPluginAsync = async (
  fastify,
  _options,
) => {
  // Import the httpErrors plugin to ensure it's available
  await fastify.register(require('@fastify/sensible'));

  // Get first wallet address for example
  const walletAddressExample = await Ethereum.getWalletAddressExample();

  // Get available networks from 0x configuration
  const networks = ZeroXConfig.networks.mainnet.availableNetworks;

  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: ExecuteSwapResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a swap using 0x DEX aggregator',
        tags: ['/connector/0x'],
        body: {
          ...ExecuteSwapRequest,
          properties: {
            ...ExecuteSwapRequest.properties,
            network: { type: 'string', default: 'mainnet', enum: networks },
            walletAddress: { type: 'string', examples: [walletAddressExample] },
            baseToken: { type: 'string', examples: ['WETH'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [0.1] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            slippagePct: { type: 'number', examples: [0.5] },
          },
        },
        response: {
          200: ExecuteSwapResponse,
        },
      },
    },
    async (request, reply) => {
      try {
        logger.info(
          `Received execute-swap request: ${JSON.stringify(request.body)}`,
        );

        const {
          network = 'mainnet',
          walletAddress: requestedWalletAddress,
          baseToken: baseTokenSymbol,
          quoteToken: quoteTokenSymbol,
          amount,
          side,
          slippagePct,
        } = request.body;

        // Validate essential parameters
        if (!baseTokenSymbol || !quoteTokenSymbol || !amount || !side) {
          logger.error('Missing required parameters in request');
          return reply.badRequest('Missing required parameters');
        }

        // Get Ethereum instance for the network
        const ethereum = await Ethereum.getInstance(network);

        // Get wallet address - either from request or first available
        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          walletAddress = await Ethereum.getFirstWalletAddress();
          if (!walletAddress) {
            return reply.badRequest(
              'No wallet address provided and no default wallet found',
            );
          }
          logger.info(`Using first available wallet address: ${walletAddress}`);
        }

        // Get the wallet
        const wallet = await ethereum.getWallet(walletAddress);
        if (!wallet) {
          logger.error(`Wallet not found: ${walletAddress}`);
          return reply.badRequest('Wallet not found');
        }

        // Get token information
        const baseToken = await ethereum.getTokenBySymbol(baseTokenSymbol);
        const quoteToken = await ethereum.getTokenBySymbol(quoteTokenSymbol);

        if (!baseToken) {
          logger.error(`Base token not found: ${baseTokenSymbol}`);
          return reply.notFound(`Token not found: ${baseTokenSymbol}`);
        }

        if (!quoteToken) {
          logger.error(`Quote token not found: ${quoteTokenSymbol}`);
          return reply.notFound(`Token not found: ${quoteTokenSymbol}`);
        }

        // Get 0x instance
        const zeroX = await ZeroX.getInstance(network);

        // Determine input/output tokens based on side
        let sellToken: string;
        let buyToken: string;
        let sellAmount: string | undefined;
        let buyAmount: string | undefined;
        let inputToken: typeof baseToken;
        let outputToken: typeof quoteToken;

        if (side === 'SELL') {
          // SELL means we're selling the base token for quote token
          sellToken = baseToken.address;
          buyToken = quoteToken.address;
          sellAmount = zeroX.parseTokenAmount(amount, baseToken.decimals);
          inputToken = baseToken;
          outputToken = quoteToken;
        } else {
          // BUY means we're buying the base token with quote token
          sellToken = quoteToken.address;
          buyToken = baseToken.address;
          buyAmount = zeroX.parseTokenAmount(amount, baseToken.decimals);
          inputToken = quoteToken;
          outputToken = baseToken;
        }

        // Get quote from 0x using the /quote endpoint for execution
        const slippagePercentage =
          slippagePct !== undefined
            ? zeroX.convertSlippageToPercentage(slippagePct)
            : zeroX.convertSlippageToPercentage(zeroX.allowedSlippage * 100);

        const quoteResponse = await zeroX.getQuote({
          sellToken,
          buyToken,
          sellAmount,
          buyAmount,
          takerAddress: walletAddress,
          slippagePercentage,
        });

        // Check balance of input token
        logger.info(
          `Checking balance of ${inputToken.symbol} for wallet ${walletAddress}`,
        );
        let inputTokenBalance;
        if (inputToken.symbol === 'ETH') {
          // For native ETH, use getNativeBalance
          inputTokenBalance = await ethereum.getNativeBalance(wallet);
        } else {
          // For ERC20 tokens (including WETH), use getERC20Balance
          const contract = await ethereum.getContract(
            inputToken.address,
            ethereum.provider,
          );
          inputTokenBalance = await ethereum.getERC20Balance(
            contract,
            wallet,
            inputToken.decimals,
            5000, // 5 second timeout
          );
        }

        const inputBalanceFormatted = Number(
          zeroX.formatTokenAmount(
            inputTokenBalance.value.toString(),
            inputToken.decimals,
          ),
        );
        logger.info(`${inputToken.symbol} balance: ${inputBalanceFormatted}`);

        // Calculate required input amount
        const requiredInputAmount = Number(
          zeroX.formatTokenAmount(
            quoteResponse.sellAmount,
            inputToken.decimals,
          ),
        );

        // Check if balance is sufficient
        if (inputBalanceFormatted < requiredInputAmount) {
          logger.error(
            `Insufficient ${inputToken.symbol} balance: have ${inputBalanceFormatted}, need ${requiredInputAmount}`,
          );
          throw fastify.httpErrors.badRequest(
            'Insufficient token balance to complete this swap',
          );
        }

        // If input token is not ETH, check allowance for the 0x Exchange Proxy
        if (inputToken.symbol !== 'ETH') {
          // Get token contract
          const tokenContract = await ethereum.getContract(
            inputToken.address,
            wallet,
          );

          // Check existing allowance for the 0x Exchange Proxy
          const allowance = await ethereum.getERC20Allowance(
            tokenContract,
            wallet,
            quoteResponse.allowanceTarget,
            inputToken.decimals,
          );

          // Calculate required amount
          const amountNeeded = BigNumber.from(quoteResponse.sellAmount);
          const currentAllowance = BigNumber.from(allowance.value);

          // Throw an error if allowance is insufficient
          if (currentAllowance.lt(amountNeeded)) {
            logger.error(`Insufficient allowance for ${inputToken.symbol}`);
            return reply.badRequest(
              'Insufficient token allowance. Please approve the token for the 0x Exchange Proxy using the /ethereum/approve endpoint',
            );
          } else {
            logger.info(
              `Sufficient allowance exists: ${zeroX.formatTokenAmount(currentAllowance.toString(), inputToken.decimals)} ${inputToken.symbol}`,
            );
          }
        }

        // Extract only the required fields for ethers.js transaction
        const txRequest = {
          to: quoteResponse.to,
          data: quoteResponse.data,
          value: quoteResponse.value,
          gasLimit: BigNumber.from(quoteResponse.gas),
          gasPrice: ethers.utils.parseUnits(
            zeroX.formatTokenAmount(quoteResponse.gasPrice, 9), // Gas price is in gwei
            'gwei',
          ),
          chainId: quoteResponse.chainId,
        };

        // Execute the swap by sending the transaction
        logger.info(`Executing swap to 0x Exchange: ${quoteResponse.to}`);
        logger.info(`Transaction data length: ${quoteResponse.data.length}`);

        const tx = await wallet.sendTransaction(txRequest);

        // Wait for transaction confirmation
        logger.info(`Transaction sent: ${tx.hash}`);
        const receipt = await tx.wait();
        logger.info(`Transaction confirmed: ${receipt.transactionHash}`);

        // Calculate actual amounts swapped
        let totalInputSwapped: number;
        let totalOutputSwapped: number;

        if (side === 'SELL') {
          // For SELL, we know the exact input amount
          totalInputSwapped = amount;
          totalOutputSwapped = Number(
            zeroX.formatTokenAmount(
              quoteResponse.buyAmount,
              outputToken.decimals,
            ),
          );
        } else {
          // For BUY, we know the exact output amount
          totalOutputSwapped = amount;
          totalInputSwapped = Number(
            zeroX.formatTokenAmount(
              quoteResponse.sellAmount,
              inputToken.decimals,
            ),
          );
        }

        // Set balance changes based on direction
        const baseTokenBalanceChange =
          side === 'BUY' ? totalOutputSwapped : -totalInputSwapped;
        const quoteTokenBalanceChange =
          side === 'BUY' ? -totalInputSwapped : totalOutputSwapped;

        // Calculate gas fee
        const gasFee = Number(
          zeroX.formatTokenAmount(
            receipt.gasUsed.mul(receipt.effectiveGasPrice).toString(),
            18, // ETH has 18 decimals
          ),
        );

        return {
          signature: receipt.transactionHash,
          status: 1, // CONFIRMED
          data: {
            totalInputSwapped,
            totalOutputSwapped,
            fee: gasFee,
            baseTokenBalanceChange,
            quoteTokenBalanceChange,
          },
        };
      } catch (e: any) {
        logger.error(`Execute swap error: ${e.message}`);
        if (e.stack) {
          logger.debug(`Error stack: ${e.stack}`);
        }

        if (e.code === 'UNPREDICTABLE_GAS_LIMIT') {
          return reply.badRequest(
            'Transaction failed: Insufficient funds or gas estimation error',
          );
        }

        // Check if it's a Fastify HTTP error - if so, re-throw to preserve the message
        if (e.statusCode) {
          throw e;
        }

        if (e.message.includes('0x API Error:')) {
          // Handle specific 0x API errors
          if (e.message.includes('Invalid token')) {
            logger.error('Not found error:', e);
            return reply.notFound('Resource not found');
          }
          if (e.message.includes('Insufficient liquidity')) {
            logger.error('Request error:', e);
            return reply.badRequest('Invalid request');
          }
          logger.error('Request error:', e);
          return reply.badRequest('Invalid request');
        }

        logger.error('Unexpected error executing swap:', e);
        return reply.internalServerError('Failed to execute swap');
      }
    },
  );
};

export default executeSwapRoute;
