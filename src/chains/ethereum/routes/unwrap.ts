import { ethers, utils } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { bigNumberWithDecimalToStr } from '../../../services/base';
import { logger } from '../../../services/logger';
import { Ethereum } from '../ethereum';
import { EthereumLedger } from '../ethereum-ledger';
import { UnwrapRequestSchema, UnwrapResponseSchema, UnwrapRequestType, UnwrapResponseType } from '../schemas';

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

  // Check if this is a hardware wallet
  const isHardware = await ethereum.isHardwareWallet(address);

  // Parse amount to wei
  const amountInWei = utils.parseEther(amount);

  try {
    let transaction;
    let nonce: number;
    let receipt;

    if (isHardware) {
      // Hardware wallet flow
      logger.info(`Hardware wallet detected for ${address}. Building unwrap transaction for Ledger signing.`);

      const ledger = new EthereumLedger();

      // Get nonce for the address
      nonce = await ethereum.provider.getTransactionCount(address, 'latest');

      // Check balance before unwrapping
      const wrappedContract = new ethers.Contract(wrappedInfo.address, WETH9ABI, ethereum.provider);
      const balance = await wrappedContract.balanceOf(address);
      if (balance.lt(amountInWei)) {
        throw fastify.httpErrors.badRequest(
          `Insufficient ${wrappedInfo.symbol} balance. Available: ${utils.formatEther(balance)}, Required: ${amount}`,
        );
      }

      // Build the unwrap transaction data
      const iface = new utils.Interface(WETH9ABI);
      const data = iface.encodeFunctionData('withdraw', [amountInWei]);

      // Get gas options using estimateGasPrice
      const gasOptions = await ethereum.prepareGasOptions(undefined, UNWRAP_GAS_LIMIT);

      // Build unsigned transaction with gas parameters
      const unsignedTx = {
        to: wrappedInfo.address,
        data: data,
        nonce: nonce,
        chainId: ethereum.chainId,
        ...gasOptions, // Include gas parameters from prepareGasOptions
      };

      // Sign with Ledger
      const signedTx = await ledger.signTransaction(address, unsignedTx as any);

      // Send the signed transaction
      const txResponse = await ethereum.provider.sendTransaction(signedTx);

      // Wait for confirmation with timeout
      receipt = await ethereum.handleTransactionExecution(txResponse);

      transaction = {
        hash: receipt.transactionHash,
        nonce: nonce,
      };
    } else {
      // Regular wallet flow
      let wallet: ethers.Wallet;
      try {
        wallet = await ethereum.getWallet(address);
      } catch (err) {
        logger.error(`Failed to load wallet: ${err.message}`);
        throw fastify.httpErrors.internalServerError(`Failed to load wallet: ${err.message}`);
      }

      // Create wrapped token contract instance
      const wrappedContract = new ethers.Contract(wrappedInfo.address, WETH9ABI, wallet);

      // Check balance before unwrapping
      const balance = await wrappedContract.balanceOf(wallet.address);
      if (balance.lt(amountInWei)) {
        throw fastify.httpErrors.badRequest(
          `Insufficient ${wrappedInfo.symbol} balance. Available: ${utils.formatEther(balance)}, Required: ${amount}`,
        );
      }

      // Prepare gas options for unwrap transaction
      const gasOptions = await ethereum.prepareGasOptions(undefined, UNWRAP_GAS_LIMIT);
      const params: any = {
        ...gasOptions,
        nonce: await ethereum.provider.getTransactionCount(wallet.address),
      };

      // Create transaction to call withdraw() function
      const withdrawTx = await wrappedContract.populateTransaction.withdraw(amountInWei, params);
      transaction = await wallet.sendTransaction(withdrawTx);
      nonce = transaction.nonce;

      // Wait for transaction confirmation with timeout
      receipt = await ethereum.handleTransactionExecution(transaction);
    }

    // Calculate actual fee from receipt
    let feeInEth = '0';
    if (receipt.gasUsed && receipt.effectiveGasPrice) {
      const feeInWei = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      feeInEth = utils.formatEther(feeInWei);
    }

    return {
      signature: transaction.hash,
      status: receipt.status,
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
    logger.error(`Error unwrapping ${wrappedInfo.symbol} to ${wrappedInfo.nativeSymbol}: ${error.message}`);

    // Handle specific error cases
    if (error.message && error.message.includes('insufficient funds')) {
      throw fastify.httpErrors.badRequest(
        `Insufficient funds for transaction. Please ensure you have enough ETH for gas costs.`,
      );
    } else if (error.message && error.message.includes('Insufficient') && error.message.includes('balance')) {
      throw error; // Re-throw our custom balance error
    } else if (error.message && error.message.includes('timeout')) {
      throw fastify.httpErrors.requestTimeout(
        `Transaction timeout. The transaction may still be pending. Hash: ${error.transactionHash || 'unknown'}`,
      );
    } else if (error.message.includes('rejected on Ledger')) {
      throw fastify.httpErrors.badRequest('Transaction rejected on Ledger device');
    } else if (error.message.includes('Ledger device is locked')) {
      throw fastify.httpErrors.badRequest(error.message);
    } else if (error.message.includes('Wrong app is open')) {
      throw fastify.httpErrors.badRequest(error.message);
    }

    throw fastify.httpErrors.internalServerError(
      `Failed to unwrap ${wrappedInfo.symbol} to ${wrappedInfo.nativeSymbol}: ${error.message}`,
    );
  }
}

export const unwrapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: UnwrapRequestType;
    Reply: UnwrapResponseType;
  }>(
    '/unwrap',
    {
      schema: {
        description: 'Unwrap wrapped token to native token (e.g., WETH to ETH, WBNB to BNB)',
        tags: ['/chain/ethereum'],
        body: UnwrapRequestSchema,
        response: {
          200: UnwrapResponseSchema,
        },
      },
    },
    async (request) => {
      const { network, address, amount } = request.body;

      return await unwrapEthereum(fastify, network, address, amount);
    },
  );
};

export default unwrapRoute;
