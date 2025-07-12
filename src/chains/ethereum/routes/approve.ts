import { ethers, constants, utils } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { getSpender } from '../../../connectors/uniswap/uniswap.contracts';
import { bigNumberWithDecimalToStr } from '../../../services/base';
import { logger } from '../../../services/logger';
import { TokenInfo, Ethereum } from '../ethereum';
import { EthereumLedger } from '../ethereum-ledger';
import { waitForTransactionWithTimeout } from '../ethereum.utils';
import { ApproveRequestSchema, ApproveResponseSchema, ApproveRequestType, ApproveResponseType } from '../schemas';

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

export async function approveEthereumToken(
  fastify: FastifyInstance,
  network: string,
  address: string,
  spender: string,
  token: string,
  amount?: string,
) {
  const ethereum = await Ethereum.getInstance(network);
  await ethereum.init();

  // Determine the spender address based on the input
  let spenderAddress: string;
  try {
    // Check if the spender parameter is a connector name
    if (spender.includes('/') || spender === 'uniswap') {
      logger.info(`Looking up spender address for connector: ${spender}`);
      spenderAddress = getSpender(network, spender);
      logger.info(`Resolved connector ${spender} to spender address: ${spenderAddress}`);
    } else {
      // Otherwise assume it's a direct address
      spenderAddress = spender;
    }
  } catch (error) {
    logger.error(`Failed to resolve spender address: ${error.message}`);
    throw fastify.httpErrors.badRequest(`Invalid spender: ${error.message}`);
  }

  // Check if this is a hardware wallet
  const isHardware = await ethereum.isHardwareWallet(address);

  // Try to find the token by symbol or address
  const fullToken = ethereum.getToken(token);
  if (!fullToken) {
    throw fastify.httpErrors.badRequest(`Token not found in token list: ${token}`);
  }

  const amountBigNumber = amount ? utils.parseUnits(amount, fullToken.decimals) : constants.MaxUint256;

  try {
    let approval;

    if (isHardware) {
      // Hardware wallet flow
      logger.info(`Hardware wallet detected for ${address}. Building approve transaction for Ledger signing.`);

      const ledger = new EthereumLedger();

      // Get nonce for the address
      const nonce = await ethereum.provider.getTransactionCount(address, 'latest');

      // Build the approve transaction data
      const iface = new utils.Interface(['function approve(address spender, uint256 amount)']);
      const data = iface.encodeFunctionData('approve', [spenderAddress, amountBigNumber]);

      // Get gas price
      const gasPrice = await ethereum.provider.getGasPrice();
      const feeData = await ethereum.provider.getFeeData();

      // Build unsigned transaction
      const unsignedTx = {
        to: fullToken.address,
        data: data,
        nonce: nonce,
        chainId: ethereum.chainId,
        gasLimit: ethers.BigNumber.from('100000'), // Standard gas limit for approve
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      };

      // Sign with Ledger
      const signedTx = await ledger.signTransaction(address, unsignedTx as any);

      // Send the signed transaction
      const txResponse = await ethereum.provider.sendTransaction(signedTx);

      // Wait for confirmation with timeout
      const receipt = await waitForTransactionWithTimeout(txResponse);

      approval = {
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

      // Instantiate a contract and pass in wallet, which act on behalf of that signer
      const contract = ethereum.getContract(fullToken.address, wallet);

      // Call approve function
      const tx = await ethereum.approveERC20(contract, wallet, spenderAddress, amountBigNumber);

      // Wait for the transaction to be mined with timeout
      const receipt = await waitForTransactionWithTimeout(tx);

      approval = {
        hash: tx.hash,
        nonce: tx.nonce,
        gasUsed: receipt.gasUsed,
        effectiveGasPrice: receipt.effectiveGasPrice,
      };
    }

    // Calculate the actual fee in ETH
    let feeInEth = '0';
    if (approval.gasUsed && approval.effectiveGasPrice) {
      const feeInWei = approval.gasUsed.mul(approval.effectiveGasPrice);
      feeInEth = utils.formatEther(feeInWei);
    }

    return {
      signature: approval.hash,
      status: 1, // CONFIRMED
      data: {
        tokenAddress: fullToken.address,
        spender: spenderAddress,
        amount: bigNumberWithDecimalToStr(amountBigNumber, fullToken.decimals),
        nonce: approval.nonce,
        fee: feeInEth,
      },
    };
  } catch (error) {
    logger.error(`Error approving token: ${error.message}`);

    // Handle specific error cases
    if (error.message && error.message.includes('insufficient funds')) {
      throw fastify.httpErrors.badRequest(
        'Insufficient funds for transaction. Please ensure you have enough ETH to cover gas costs.',
      );
    } else if (error.message.includes('rejected on Ledger')) {
      throw fastify.httpErrors.badRequest('Transaction rejected on Ledger device');
    } else if (error.message.includes('Ledger device is locked')) {
      throw fastify.httpErrors.badRequest(error.message);
    } else if (error.message.includes('Wrong app is open')) {
      throw fastify.httpErrors.badRequest(error.message);
    }

    throw fastify.httpErrors.internalServerError(`Failed to approve token: ${error.message}`);
  }
}

export const approveRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: ApproveRequestType;
    Reply: ApproveResponseType;
  }>(
    '/approve',
    {
      schema: {
        description: 'Approve token spending',
        tags: ['/chain/ethereum'],
        body: ApproveRequestSchema,
        response: {
          200: ApproveResponseSchema,
        },
      },
    },
    async (request) => {
      const { network, address, spender, token, amount } = request.body;

      return await approveEthereumToken(fastify, network, address, spender, token, amount);
    },
  );
};

export default approveRoute;
