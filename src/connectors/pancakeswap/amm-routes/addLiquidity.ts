import { Contract } from '@ethersproject/contracts';
import { Percent } from '@pancakeswap/sdk';
import { Static } from '@sinclair/typebox';
import { BigNumber, utils } from 'ethers';
import { FastifyPluginAsync } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { wrapEthereum } from '../../../chains/ethereum/routes/wrap';
import { AddLiquidityResponseType, AddLiquidityResponse } from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Pancakeswap } from '../pancakeswap';
import { PancakeswapConfig } from '../pancakeswap.config';
import { IPancakeswapV2Router02ABI } from '../pancakeswap.contracts';
import { formatTokenAmount, getPancakeswapPoolInfo } from '../pancakeswap.utils';
import { PancakeswapAmmAddLiquidityRequest } from '../schemas';

import { getPancakeswapAmmLiquidityQuote } from './quoteLiquidity';

// Default gas limit for AMM add liquidity operations
const AMM_ADD_LIQUIDITY_GAS_LIMIT = 500000;

async function addLiquidity(
  fastify: any,
  network: string,
  walletAddress: string,
  poolAddress: string,
  baseToken: string,
  quoteToken: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct: number = PancakeswapConfig.config.slippagePct,
  gasPrice?: string,
  maxGas?: number,
): Promise<AddLiquidityResponseType> {
  const networkToUse = network;

  // Handle ETH->WETH wrapping if needed for baseToken
  let actualBaseToken = baseToken;
  let baseWrapTxHash = null;
  if (baseToken === 'ETH') {
    const pancakeswap = await Pancakeswap.getInstance(networkToUse);
    const wethToken = await pancakeswap.getToken('WETH');
    if (!wethToken) {
      throw new Error('WETH token not found');
    }

    logger.info(`ETH detected as base token, wrapping ${baseTokenAmount} ETH to WETH first`);

    const wrapResult = await wrapEthereum(fastify, networkToUse, walletAddress, baseTokenAmount.toString());
    baseWrapTxHash = wrapResult.signature;
    actualBaseToken = 'WETH';

    logger.info(`Successfully wrapped ${baseTokenAmount} ETH to WETH, transaction hash: ${baseWrapTxHash}`);
  }

  // Handle ETH->WETH wrapping if needed for quoteToken
  let actualQuoteToken = quoteToken;
  let quoteWrapTxHash = null;
  if (quoteToken === 'ETH') {
    const pancakeswap = await Pancakeswap.getInstance(networkToUse);
    const wethToken = await pancakeswap.getToken('WETH');
    if (!wethToken) {
      throw new Error('WETH token not found');
    }

    logger.info(`ETH detected as quote token, wrapping ${quoteTokenAmount} ETH to WETH first`);

    const wrapResult = await wrapEthereum(fastify, networkToUse, walletAddress, quoteTokenAmount.toString());
    quoteWrapTxHash = wrapResult.signature;
    actualQuoteToken = 'WETH';

    logger.info(`Successfully wrapped ${quoteTokenAmount} ETH to WETH, transaction hash: ${quoteWrapTxHash}`);
  }

  // Get quote first to calculate optimal amounts and get execution data
  const quote = await getPancakeswapAmmLiquidityQuote(
    networkToUse,
    poolAddress,
    actualBaseToken,
    actualQuoteToken,
    baseTokenAmount,
    quoteTokenAmount,
    slippagePct,
  );

  // Get Ethereum instance
  const ethereum = await Ethereum.getInstance(networkToUse);

  // Get wallet
  const wallet = await ethereum.getWallet(walletAddress);
  if (!wallet) {
    throw new Error('Wallet not found');
  }

  // Get the router contract with signer
  const router = new Contract(quote.routerAddress, IPancakeswapV2Router02ABI.abi, wallet);

  // Calculate slippage-adjusted amounts
  const slippageTolerance = new Percent(Math.floor(slippagePct * 100), 10000);

  const slippageMultiplier = new Percent(1).subtract(slippageTolerance);

  const baseTokenMinAmount = quote.rawBaseTokenAmount
    .mul(slippageMultiplier.numerator.toString())
    .div(slippageMultiplier.denominator.toString());

  const quoteTokenMinAmount = quote.rawQuoteTokenAmount
    .mul(slippageMultiplier.numerator.toString())
    .div(slippageMultiplier.denominator.toString());

  // Prepare the transaction parameters
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now

  let tx;

  // Check if one of the tokens is WETH
  if (quote.baseTokenObj.symbol === 'WETH') {
    // Check allowance for quote token
    const tokenContract = ethereum.getContract(quote.quoteTokenObj.address, wallet);
    const allowance = await ethereum.getERC20Allowance(
      tokenContract,
      wallet,
      quote.routerAddress,
      quote.quoteTokenObj.decimals,
    );

    const currentAllowance = BigNumber.from(allowance.value);
    logger.info(
      `Current allowance for ${quote.quoteTokenObj.symbol}: ${formatTokenAmount(currentAllowance.toString(), quote.quoteTokenObj.decimals)}`,
    );
    logger.info(
      `Amount needed for ${quote.quoteTokenObj.symbol}: ${formatTokenAmount(quote.rawQuoteTokenAmount.toString(), quote.quoteTokenObj.decimals)}`,
    );

    // Check if allowance is sufficient
    if (currentAllowance.lt(quote.rawQuoteTokenAmount)) {
      throw new Error(
        `Insufficient allowance for ${quote.quoteTokenObj.symbol}. Please approve at least ${formatTokenAmount(quote.rawQuoteTokenAmount.toString(), quote.quoteTokenObj.decimals)} ${quote.quoteTokenObj.symbol} for the Pancakeswap router (${quote.routerAddress})`,
      );
    }

    // Add liquidity ETH + Token
    tx = await router.addLiquidityETH(
      quote.quoteTokenObj.address,
      quote.rawQuoteTokenAmount,
      quoteTokenMinAmount,
      baseTokenMinAmount,
      walletAddress,
      deadline,
      {
        value: quote.rawBaseTokenAmount,
        gasLimit: 300000,
      },
    );
  } else if (quote.quoteTokenObj.symbol === 'WETH') {
    // Check allowance for base token
    const tokenContract = ethereum.getContract(quote.baseTokenObj.address, wallet);
    const allowance = await ethereum.getERC20Allowance(
      tokenContract,
      wallet,
      quote.routerAddress,
      quote.baseTokenObj.decimals,
    );

    const currentAllowance = BigNumber.from(allowance.value);
    logger.info(
      `Current allowance for ${quote.baseTokenObj.symbol}: ${formatTokenAmount(currentAllowance.toString(), quote.baseTokenObj.decimals)}`,
    );
    logger.info(
      `Amount needed for ${quote.baseTokenObj.symbol}: ${formatTokenAmount(quote.rawBaseTokenAmount.toString(), quote.baseTokenObj.decimals)}`,
    );

    // Check if allowance is sufficient
    if (currentAllowance.lt(quote.rawBaseTokenAmount)) {
      throw new Error(
        `Insufficient allowance for ${quote.baseTokenObj.symbol}. Please approve at least ${formatTokenAmount(quote.rawBaseTokenAmount.toString(), quote.baseTokenObj.decimals)} ${quote.baseTokenObj.symbol} for the Pancakeswap router (${quote.routerAddress})`,
      );
    }

    // Add liquidity Token + ETH
    // Convert gasPrice from wei to gwei if provided
    const gasPriceGwei = gasPrice ? parseFloat(utils.formatUnits(gasPrice, 'gwei')) : undefined;
    const gasOptions = await ethereum.prepareGasOptions(gasPriceGwei, maxGas || AMM_ADD_LIQUIDITY_GAS_LIMIT);
    gasOptions.value = quote.rawQuoteTokenAmount;

    tx = await router.addLiquidityETH(
      quote.baseTokenObj.address,
      quote.rawBaseTokenAmount,
      baseTokenMinAmount,
      quoteTokenMinAmount,
      walletAddress,
      deadline,
      gasOptions,
    );
  } else {
    // Both tokens are ERC20 - check allowances for both
    const baseTokenContract = ethereum.getContract(quote.baseTokenObj.address, wallet);
    const baseAllowance = await ethereum.getERC20Allowance(
      baseTokenContract,
      wallet,
      quote.routerAddress,
      quote.baseTokenObj.decimals,
    );

    const quoteTokenContract = ethereum.getContract(quote.quoteTokenObj.address, wallet);
    const quoteAllowance = await ethereum.getERC20Allowance(
      quoteTokenContract,
      wallet,
      quote.routerAddress,
      quote.quoteTokenObj.decimals,
    );

    const currentBaseAllowance = BigNumber.from(baseAllowance.value);
    const currentQuoteAllowance = BigNumber.from(quoteAllowance.value);

    logger.info(
      `Current base allowance for ${quote.baseTokenObj.symbol}: ${formatTokenAmount(currentBaseAllowance.toString(), quote.baseTokenObj.decimals)}`,
    );
    logger.info(
      `Amount needed for ${quote.baseTokenObj.symbol}: ${formatTokenAmount(quote.rawBaseTokenAmount.toString(), quote.baseTokenObj.decimals)}`,
    );
    logger.info(
      `Current quote allowance for ${quote.quoteTokenObj.symbol}: ${formatTokenAmount(currentQuoteAllowance.toString(), quote.quoteTokenObj.decimals)}`,
    );
    logger.info(
      `Amount needed for ${quote.quoteTokenObj.symbol}: ${formatTokenAmount(quote.rawQuoteTokenAmount.toString(), quote.quoteTokenObj.decimals)}`,
    );

    // Check if both allowances are sufficient
    if (currentBaseAllowance.lt(quote.rawBaseTokenAmount)) {
      throw new Error(
        `Insufficient allowance for ${quote.baseTokenObj.symbol}. Please approve at least ${formatTokenAmount(quote.rawBaseTokenAmount.toString(), quote.baseTokenObj.decimals)} ${quote.baseTokenObj.symbol} for the Pancakeswap router (${quote.routerAddress})`,
      );
    }

    if (currentQuoteAllowance.lt(quote.rawQuoteTokenAmount)) {
      throw new Error(
        `Insufficient allowance for ${quote.quoteTokenObj.symbol}. Please approve at least ${formatTokenAmount(quote.rawQuoteTokenAmount.toString(), quote.quoteTokenObj.decimals)} ${quote.quoteTokenObj.symbol} for the Pancakeswap router (${quote.routerAddress})`,
      );
    }

    // Add liquidity Token + Token
    // Convert gasPrice from wei to gwei if provided
    const gasPriceGwei = gasPrice ? parseFloat(utils.formatUnits(gasPrice, 'gwei')) : undefined;
    const gasOptions = await ethereum.prepareGasOptions(gasPriceGwei, maxGas || AMM_ADD_LIQUIDITY_GAS_LIMIT);

    tx = await router.addLiquidity(
      quote.baseTokenObj.address,
      quote.quoteTokenObj.address,
      quote.rawBaseTokenAmount,
      quote.rawQuoteTokenAmount,
      baseTokenMinAmount,
      quoteTokenMinAmount,
      walletAddress,
      deadline,
      gasOptions,
    );
  }

  // Wait for transaction confirmation
  const receipt = await ethereum.handleTransactionExecution(tx);

  // Calculate gas fee
  const gasFee = formatTokenAmount(
    receipt.gasUsed.mul(receipt.effectiveGasPrice).toString(),
    18, // ETH has 18 decimals
  );

  return {
    signature: receipt.transactionHash,
    status: receipt.status,
    data: {
      fee: gasFee,
      baseTokenAmountAdded: quote.baseTokenAmount,
      quoteTokenAmountAdded: quote.quoteTokenAmount,
      ...(baseWrapTxHash && { baseWrapTxHash }),
      ...(quoteWrapTxHash && { quoteWrapTxHash }),
    },
  };
}

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  await fastify.register(require('@fastify/sensible'));

  fastify.post<{
    Body: Static<typeof PancakeswapAmmAddLiquidityRequest>;
    Reply: AddLiquidityResponseType;
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to a Pancakeswap V2 pool',
        tags: ['/connector/pancakeswap'],
        body: PancakeswapAmmAddLiquidityRequest,
        response: {
          200: AddLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          network,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
          walletAddress: requestedWalletAddress,
          gasPrice,
          maxGas,
        } = request.body;

        // Validate essential parameters
        if (!poolAddress || !baseTokenAmount || !quoteTokenAmount) {
          throw fastify.httpErrors.badRequest('Missing required parameters');
        }

        const networkToUse = network;

        // Get wallet address - either from request or first available
        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          walletAddress = await Ethereum.getFirstWalletAddress();
          if (!walletAddress) {
            throw fastify.httpErrors.badRequest('No wallet address provided and no wallets found.');
          }
          logger.info(`Using first available wallet address: ${walletAddress}`);
        }

        // Get pool information to determine tokens
        const poolInfo = await getPancakeswapPoolInfo(poolAddress, networkToUse, 'amm');
        if (!poolInfo) {
          throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
        }

        const baseToken = poolInfo.baseTokenAddress;
        const quoteToken = poolInfo.quoteTokenAddress;

        return await addLiquidity(
          fastify,
          networkToUse,
          walletAddress,
          poolAddress,
          baseToken,
          quoteToken,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
          gasPrice,
          maxGas,
        );
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }

        // Handle specific user-actionable errors
        if (e.message && e.message.includes('Insufficient allowance')) {
          logger.error('Request error:', e);
          throw fastify.httpErrors.badRequest('Invalid request');
        }

        // Handle insufficient funds errors
        if (e.code === 'INSUFFICIENT_FUNDS' || (e.message && e.message.includes('insufficient funds'))) {
          throw fastify.httpErrors.badRequest(
            'Insufficient ETH balance to pay for gas fees. Please add more ETH to your wallet.',
          );
        }

        throw fastify.httpErrors.internalServerError('Failed to add liquidity');
      }
    },
  );
};

export default addLiquidityRoute;
