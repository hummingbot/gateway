import { ethers, utils } from 'ethers';
import { FastifyInstance } from 'fastify';

import { TransactionStatus } from '../../../schemas/chain-schema';
import { bigNumberWithDecimalToStr } from '../../../services/base';
import { logger } from '../../../services/logger';
import { Ethereum } from '../ethereum';
import { rethrowIfCaptured } from '../evm-build-mode';

// Default gas limit for unwrap operations
const UNWRAP_GAS_LIMIT = 50000;

// WETH ABI for wrap/unwrap operations
const WETH9ABI = [
  // Standard ERC20 functions
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',

  // WETH-specific functions
  'function deposit() public payable',
  'function withdraw(uint256 amount) public',
];

/**
 * Get wrapped token info for a network by looking up W+nativeCurrencySymbol in token list
 * @param ethereum Ethereum instance
 * @returns Wrapped token info (address, symbol, nativeSymbol)
 */
async function getWrappedTokenInfo(
  ethereum: Ethereum,
): Promise<{ address: string; symbol: string; nativeSymbol: string }> {
  const nativeSymbol = ethereum.nativeTokenSymbol;
  const wrappedSymbol = `W${nativeSymbol}`;

  // Look up wrapped token in token list
  const wrappedToken = await ethereum.getToken(wrappedSymbol);

  if (!wrappedToken) {
    throw new Error(
      `Wrapped token ${wrappedSymbol} not found in token list for network ${ethereum.network}. ` +
        `Please ensure ${wrappedSymbol} is configured in the token list.`,
    );
  }

  return {
    address: wrappedToken.address,
    symbol: wrappedSymbol,
    nativeSymbol: nativeSymbol,
  };
}

export async function unwrapEthereum(fastify: FastifyInstance, network: string, address: string, amount: string) {
  // Get Ethereum instance for the specified network
  const ethereum = await Ethereum.getInstance(network);
  await ethereum.init();

  // Get wrapped token info from token list
  let wrappedInfo;
  try {
    wrappedInfo = await getWrappedTokenInfo(ethereum);
  } catch (error: any) {
    throw fastify.httpErrors.badRequest(error.message);
  }

  // Parse amount to wei
  const amountInWei = utils.parseEther(amount);

  try {
    // Check balance before unwrapping
    const wrappedContract = new ethers.Contract(wrappedInfo.address, WETH9ABI, ethereum.provider);
    const balance = await wrappedContract.balanceOf(address);
    if (balance.lt(amountInWei)) {
      throw fastify.httpErrors.badRequest(
        `Insufficient ${wrappedInfo.symbol} balance. Available: ${utils.formatEther(balance)}, Required: ${amount}`,
      );
    }

    const transaction = await ethereum.sendTransactionForWallet(address, {
      to: wrappedInfo.address,
      data: new utils.Interface(WETH9ABI).encodeFunctionData('withdraw', [amountInWei]),
      gasLimit: UNWRAP_GAS_LIMIT,
      description: `unwrap of ${amount} ${wrappedInfo.symbol}`,
    });
    const nonce = transaction.nonce;
    const outcome = await ethereum.handleTransactionConfirmation(transaction);

    // A revert threw out of the confirmation helper as a 400 TRANSACTION_FAILED — it is never
    // reported as PENDING (receipt.status 0 and TransactionStatus.PENDING are the same number).
    if (!outcome.confirmed) {
      return { signature: outcome.signature, status: TransactionStatus.PENDING };
    }

    // Calculate actual fee from the confirmed receipt
    const feeInEth = utils.formatEther(outcome.receipt.gasUsed.mul(outcome.receipt.effectiveGasPrice));

    return {
      signature: outcome.signature,
      status: TransactionStatus.CONFIRMED,
      data: {
        nonce: nonce,
        fee: feeInEth,
        amount: bigNumberWithDecimalToStr(amountInWei, 18),
        wrappedAddress: wrappedInfo.address,
        nativeToken: wrappedInfo.nativeSymbol,
        wrappedToken: wrappedInfo.symbol,
      },
    };
  } catch (error) {
    rethrowIfCaptured(error);
    if (error.statusCode) throw error;
    logger.error(`Error in unwrap: ${error.message}`);
    throw fastify.httpErrors.internalServerError(
      `Failed to unwrap ${wrappedInfo.symbol} to ${wrappedInfo.nativeSymbol}: ${error.message}`,
    );
  }
}
