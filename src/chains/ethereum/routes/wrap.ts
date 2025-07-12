import { ethers, utils } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { bigNumberWithDecimalToStr } from '../../../services/base';
import { logger } from '../../../services/logger';
import { Ethereum } from '../ethereum';
import { EthereumLedger } from '../ethereum-ledger';
import { waitForTransactionWithTimeout } from '../ethereum.utils';
import { WrapRequestSchema, WrapResponseSchema, WrapRequestType, WrapResponseType } from '../schemas';

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

// Helper function to convert transaction to a format matching the CustomTransactionSchema
const toEthereumTransaction = (transaction: ethers.Transaction) => {
  return {
    data: transaction.data,
    to: transaction.to || '',
    maxPriorityFeePerGas: transaction.maxPriorityFeePerGas?.toString() || null,
    maxFeePerGas: transaction.maxFeePerGas?.toString() || null,
    gasLimit: transaction.gasLimit?.toString() || null,
    value: transaction.value?.toString() || '0',
  };
};

export async function wrapEthereum(fastify: FastifyInstance, network: string, address: string, amount: string) {
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

    if (isHardware) {
      // Hardware wallet flow
      logger.info(`Hardware wallet detected for ${address}. Building wrap transaction for Ledger signing.`);

      const ledger = new EthereumLedger();

      // Get nonce for the address
      nonce = await ethereum.provider.getTransactionCount(address, 'latest');

      // Build the wrap transaction data
      const iface = new utils.Interface(WETH9ABI);
      const data = iface.encodeFunctionData('deposit');

      // Get gas price
      const feeData = await ethereum.provider.getFeeData();

      // Build unsigned transaction
      const unsignedTx = {
        to: wrappedInfo.address,
        data: data,
        value: amountInWei,
        nonce: nonce,
        chainId: ethereum.chainId,
        gasLimit: ethers.BigNumber.from(ethereum.gasLimitTransaction),
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      };

      // Sign with Ledger
      const signedTx = await ledger.signTransaction(address, unsignedTx as any);

      // Send the signed transaction
      const txResponse = await ethereum.provider.sendTransaction(signedTx);

      // Wait for confirmation with timeout
      const receipt = await waitForTransactionWithTimeout(txResponse);

      transaction = {
        hash: receipt.transactionHash,
        nonce: nonce,
        gasUsed: receipt.gasUsed,
        effectiveGasPrice: receipt.effectiveGasPrice,
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

      // Set transaction parameters
      const params: any = {
        gasLimit: ethereum.gasLimitTransaction,
        nonce: await ethereum.provider.getTransactionCount(wallet.address),
        value: amountInWei, // Send native token with the transaction
      };

      // Always fetch gas price from the network
      const currentGasPrice = await ethereum.provider.getGasPrice();
      params.gasPrice = currentGasPrice.toString();
      logger.info(`Using network gas price: ${utils.formatUnits(currentGasPrice, 'gwei')} GWEI`);

      // Create transaction to call deposit() function
      const depositTx = await wrappedContract.populateTransaction.deposit(params);
      transaction = await wallet.sendTransaction(depositTx);
      nonce = transaction.nonce;
    }

    // Wait for transaction confirmation with timeout
    const receipt = await waitForTransactionWithTimeout(transaction as any);

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
    logger.error(`Error wrapping ${wrappedInfo.nativeSymbol} to ${wrappedInfo.symbol}: ${error.message}`);

    // Handle specific error cases
    if (error.message && error.message.includes('insufficient funds')) {
      throw fastify.httpErrors.badRequest(
        `Insufficient funds for transaction. Please ensure you have enough ${wrappedInfo.nativeSymbol} to wrap.`,
      );
    } else if (error.message.includes('rejected on Ledger')) {
      throw fastify.httpErrors.badRequest('Transaction rejected on Ledger device');
    } else if (error.message.includes('Ledger device is locked')) {
      throw fastify.httpErrors.badRequest(error.message);
    } else if (error.message.includes('Wrong app is open')) {
      throw fastify.httpErrors.badRequest(error.message);
    }

    throw fastify.httpErrors.internalServerError(
      `Failed to wrap ${wrappedInfo.nativeSymbol} to ${wrappedInfo.symbol}: ${error.message}`,
    );
  }
}

export const wrapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: WrapRequestType;
    Reply: WrapResponseType;
  }>(
    '/wrap',
    {
      schema: {
        description: 'Wrap native token to wrapped token (e.g., ETH to WETH, BNB to WBNB)',
        tags: ['/chain/ethereum'],
        body: WrapRequestSchema,
        response: {
          200: WrapResponseSchema,
        },
      },
    },
    async (request) => {
      const { network, address, amount } = request.body;

      return await wrapEthereum(fastify, network, address, amount);
    },
  );
};

export default wrapRoute;
