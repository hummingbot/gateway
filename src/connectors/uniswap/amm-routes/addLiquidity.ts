import { Contract } from '@ethersproject/contracts';
import { Percent } from '@uniswap/sdk-core';
import { BigNumber } from 'ethers';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { wrapEthereum } from '../../../chains/ethereum/routes/wrap';
import { AddLiquidityResponseType } from '../../../schemas/amm-schema';
import { TransactionStatus } from '../../../schemas/chain-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Uniswap } from '../uniswap';
import { UniswapConfig } from '../uniswap.config';
import { IUniswapV2Router02ABI } from '../uniswap.contracts';
import { formatTokenAmount, getUniswapPoolInfo } from '../uniswap.utils';

import { getUniswapAmmLiquidityQuote } from './quoteLiquidity';

// Default gas limit for AMM add liquidity operations
const AMM_ADD_LIQUIDITY_GAS_LIMIT = 500000;

async function addLiquidityInternal(
  fastify: any,
  network: string,
  walletAddress: string,
  poolAddress: string,
  baseToken: string,
  quoteToken: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct: number = UniswapConfig.config.slippagePct,
): Promise<AddLiquidityResponseType> {
  const networkToUse = network;

  // Handle ETH->WETH wrapping if needed for baseToken
  let actualBaseToken = baseToken;
  let baseWrapTxHash = null;
  if (baseToken === 'ETH') {
    // Declared here, as the quote-token branch below does. It used to resolve to a
    // function-scope binding declared further down, which made this branch a
    // guaranteed ReferenceError: adding liquidity with ETH as the base token could
    // never have worked. The dead-code sweep that removed the unused later binding is
    // what surfaced it.
    const uniswap = await Uniswap.getInstance(networkToUse);
    const wethToken = await uniswap.getToken('WETH');
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
    const uniswap = await Uniswap.getInstance(networkToUse);
    const wethToken = await uniswap.getToken('WETH');
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
  const quote = await getUniswapAmmLiquidityQuote(
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
  const router = new Contract(quote.routerAddress, IUniswapV2Router02ABI.abi, wallet);

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
        `Insufficient allowance for ${quote.quoteTokenObj.symbol}. Please approve at least ${formatTokenAmount(quote.rawQuoteTokenAmount.toString(), quote.quoteTokenObj.decimals)} ${quote.quoteTokenObj.symbol} for the Uniswap router (${quote.routerAddress})`,
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
        `Insufficient allowance for ${quote.baseTokenObj.symbol}. Please approve at least ${formatTokenAmount(quote.rawBaseTokenAmount.toString(), quote.baseTokenObj.decimals)} ${quote.baseTokenObj.symbol} for the Uniswap router (${quote.routerAddress})`,
      );
    }

    // Add liquidity Token + ETH
    // Convert gasPrice from wei to gwei if provided
    const gasOptions = await ethereum.prepareGasOptions(undefined, AMM_ADD_LIQUIDITY_GAS_LIMIT);
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
        `Insufficient allowance for ${quote.baseTokenObj.symbol}. Please approve at least ${formatTokenAmount(quote.rawBaseTokenAmount.toString(), quote.baseTokenObj.decimals)} ${quote.baseTokenObj.symbol} for the Uniswap router (${quote.routerAddress})`,
      );
    }

    if (currentQuoteAllowance.lt(quote.rawQuoteTokenAmount)) {
      throw new Error(
        `Insufficient allowance for ${quote.quoteTokenObj.symbol}. Please approve at least ${formatTokenAmount(quote.rawQuoteTokenAmount.toString(), quote.quoteTokenObj.decimals)} ${quote.quoteTokenObj.symbol} for the Uniswap router (${quote.routerAddress})`,
      );
    }

    // Add liquidity Token + Token
    // Convert gasPrice from wei to gwei if provided
    const gasOptions = await ethereum.prepareGasOptions(undefined, AMM_ADD_LIQUIDITY_GAS_LIMIT);

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
  const outcome = await ethereum.handleTransactionConfirmation(tx);
  if (!outcome.confirmed) {
    // Still pending — the quoted amounts were computed before sending and have not moved.
    return { signature: outcome.signature, status: TransactionStatus.PENDING };
  }

  return {
    signature: outcome.signature,
    status: TransactionStatus.CONFIRMED,
    data: {
      fee: outcome.fee,
      baseTokenAmountAdded: quote.baseTokenAmount,
      quoteTokenAmountAdded: quote.quoteTokenAmount,
      ...(baseWrapTxHash && { baseWrapTxHash }),
      ...(quoteWrapTxHash && { quoteWrapTxHash }),
    },
  };
}

/**
 * Standard AMM add-liquidity entry point (network-based) — consumed by the unified /trading/amm
 * dispatcher. Base/quote tokens are derived from the pool; gasPrice/maxGas are optional EVM extras.
 */
export async function addLiquidity(
  network: string,
  walletAddress: string,
  poolAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct: number = UniswapConfig.config.slippagePct,
): Promise<AddLiquidityResponseType> {
  const poolInfo = await getUniswapPoolInfo(poolAddress, network, 'amm');
  if (!poolInfo) throw httpErrors.notFound(`Pool not found: ${poolAddress}`);
  return await addLiquidityInternal(
    { httpErrors },
    network,
    walletAddress,
    poolAddress,
    poolInfo.baseTokenAddress,
    poolInfo.quoteTokenAddress,
    baseTokenAmount,
    quoteTokenAmount,
    slippagePct,
  );
}
