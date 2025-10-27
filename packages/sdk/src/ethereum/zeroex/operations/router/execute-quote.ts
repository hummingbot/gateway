/**
 * 0x Execute Quote Operation
 *
 * Execute a previously fetched quote from the quote cache.
 */

import { BigNumber, Wallet } from 'ethers';
import { ZeroXConnector } from '../../connector';
import { ExecuteQuoteParams, ExecuteQuoteResult } from '../../types';

export interface ExecuteQuoteDependencies {
  /** 0x connector instance */
  connector: ZeroXConnector;
  /** Quote cache for retrieving stored quotes */
  quoteCache?: {
    get: (quoteId: string) => any;
    set: (quoteId: string, quote: any, metadata: any) => void;
    delete: (quoteId: string) => void;
  };
  /** Function to get wallet instance */
  getWallet: (address: string) => Promise<Wallet>;
  /** Function to get token info */
  getTokenInfo: (addressOrSymbol: string) => { address: string; decimals: number; symbol: string } | undefined;
  /** Function to check ERC20 allowance */
  getERC20Allowance: (
    tokenContract: any,
    wallet: Wallet,
    spender: string,
    decimals: number,
  ) => Promise<{ value: any; decimals: number }>;
  /** Function to get token contract */
  getContract: (address: string, wallet: Wallet) => any;
  /** Function to wait for transaction */
  waitForTransaction: (txResponse: any) => Promise<any>;
  /** Function to handle transaction confirmation */
  handleTransactionConfirmation: (
    receipt: any,
    tokenIn: string,
    tokenOut: string,
    expectedAmountIn: number,
    expectedAmountOut: number,
  ) => ExecuteQuoteResult;
  /** Native token symbol (e.g., 'ETH') */
  nativeTokenSymbol: string;
}

/**
 * Execute a quote operation
 */
export async function executeQuote(
  params: ExecuteQuoteParams,
  deps: ExecuteQuoteDependencies,
): Promise<ExecuteQuoteResult> {
  const { walletAddress, network, quoteId, gasPrice, maxGas } = params;
  const {
    connector,
    quoteCache,
    getWallet,
    getTokenInfo,
    getERC20Allowance,
    getContract,
    waitForTransaction,
    handleTransactionConfirmation,
    nativeTokenSymbol,
  } = deps;

  // Retrieve cached quote
  if (!quoteCache) {
    throw new Error('Quote cache not available');
  }
  const quote = quoteCache.get(quoteId);
  if (!quote) {
    throw new Error('Quote not found or expired');
  }

  const wallet = await getWallet(walletAddress);

  // Check allowance for the sell token
  if (quote.sellTokenAddress !== nativeTokenSymbol) {
    const sellTokenInfo = getTokenInfo(quote.sellTokenAddress);
    if (!sellTokenInfo) {
      throw new Error(`Token ${quote.sellTokenAddress} not found`);
    }

    const tokenContract = getContract(quote.sellTokenAddress, wallet);
    const allowance = await getERC20Allowance(tokenContract, wallet, quote.allowanceTarget, sellTokenInfo.decimals);

    const requiredAllowance = BigNumber.from(quote.sellAmount);
    if (BigNumber.from(allowance.value).lt(requiredAllowance)) {
      throw new Error(
        `Insufficient allowance for ${sellTokenInfo.symbol}. Required: ${connector.formatTokenAmount(quote.sellAmount, sellTokenInfo.decimals)}, Current: ${connector.formatTokenAmount(allowance.value.toString(), sellTokenInfo.decimals)}`,
      );
    }
  }

  // Execute the swap transaction
  const txData: any = {
    to: quote.to,
    data: quote.data,
    value: quote.value,
    gasLimit: maxGas || parseInt(quote.estimatedGas || quote.gas),
  };

  if (gasPrice) {
    txData.gasPrice = BigNumber.from(gasPrice);
  }

  const txResponse = await wallet.sendTransaction(txData);
  const txReceipt = await waitForTransaction(txResponse);

  // Get token info for formatting amounts
  const sellTokenInfo = getTokenInfo(quote.sellTokenAddress);
  const buyTokenInfo = getTokenInfo(quote.buyTokenAddress);

  if (!sellTokenInfo || !buyTokenInfo) {
    throw new Error('Token info not found');
  }

  // Calculate expected amounts from the quote
  const expectedAmountIn = parseFloat(connector.formatTokenAmount(quote.sellAmount, sellTokenInfo.decimals));
  const expectedAmountOut = parseFloat(connector.formatTokenAmount(quote.buyAmount, buyTokenInfo.decimals));

  // Handle transaction confirmation
  const result = handleTransactionConfirmation(
    txReceipt,
    quote.sellTokenAddress,
    quote.buyTokenAddress,
    expectedAmountIn,
    expectedAmountOut,
  );

  // Handle different transaction states
  if (result.status === -1) {
    throw new Error('Transaction failed on-chain');
  }

  if (result.status === 0) {
    // Transaction is still pending
    return result;
  }

  // Transaction confirmed (status === 1)
  // Remove quote from cache only after successful execution
  if (quoteCache) {
    quoteCache.delete(quoteId);
  }

  return result;
}
