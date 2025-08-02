import { ethers, utils } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { bigNumberWithDecimalToStr } from '../../../services/base';
import { logger } from '../../../services/logger';
import { Ethereum } from '../ethereum';
import { EthereumLedger } from '../ethereum-ledger';
import { waitForTransactionWithTimeout } from '../ethereum.utils';
import { UnwrapRequestSchema, UnwrapResponseSchema, UnwrapRequestType, UnwrapResponseType } from '../schemas';

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

// Define wrapped native token addresses for different networks
const WRAPPED_ADDRESSES: {
  [key: string]: { address: string; symbol: string; nativeSymbol: string };
} = {
  mainnet: {
    address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    symbol: 'WETH',
    nativeSymbol: 'ETH',
  },
  arbitrum: {
    address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    symbol: 'WETH',
    nativeSymbol: 'ETH',
  },
  optimism: {
    address: '0x4200000000000000000000000000000000000006',
    symbol: 'WETH',
    nativeSymbol: 'ETH',
  },
  base: {
    address: '0x4200000000000000000000000000000000000006',
    symbol: 'WETH',
    nativeSymbol: 'ETH',
  },
  sepolia: {
    address: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    symbol: 'WETH',
    nativeSymbol: 'ETH',
  },
  polygon: {
    address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    symbol: 'WETH',
    nativeSymbol: 'MATIC',
  },
  bsc: {
    address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    symbol: 'WBNB',
    nativeSymbol: 'BNB',
  },
  avalanche: {
    address: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
    symbol: 'WAVAX',
    nativeSymbol: 'AVAX',
  },
  celo: {
    address: '0x471EcE3750Da237f93B8E339c536989b8978a438',
    symbol: 'WCELO',
    nativeSymbol: 'CELO',
  },
};

export async function unwrapEthereum(fastify: FastifyInstance, network: string, address: string, amount: string) {
  // Get Ethereum instance for the specified network
  const ethereum = await Ethereum.getInstance(network);
  await ethereum.init();

  // Get wrapped token info for the network
  const wrappedInfo = WRAPPED_ADDRESSES[network];
  if (!wrappedInfo) {
    throw fastify.httpErrors.badRequest(`Wrapped token address not found for network: ${network}`);
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
      const gasOptions = await ethereum.prepareGasOptions();

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

      // Wait for confirmation with timeout (30 seconds for hardware wallets)
      receipt = await waitForTransactionWithTimeout(txResponse, 30000);

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
      const gasOptions = await ethereum.prepareGasOptions();
      const params: any = {
        ...gasOptions,
        nonce: await ethereum.provider.getTransactionCount(wallet.address),
      };

      // Create transaction to call withdraw() function
      const withdrawTx = await wrappedContract.populateTransaction.withdraw(amountInWei, params);
      transaction = await wallet.sendTransaction(withdrawTx);
      nonce = transaction.nonce;

      // Wait for transaction confirmation with timeout
      receipt = await waitForTransactionWithTimeout(transaction);
    }

    // Calculate actual fee from receipt
    let feeInEth = '0';
    if (receipt.gasUsed && receipt.effectiveGasPrice) {
      const feeInWei = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      feeInEth = utils.formatEther(feeInWei);
    }

    return {
      signature: transaction.hash,
      status: 1, // CONFIRMED
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
