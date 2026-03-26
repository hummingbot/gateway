/**
 * Ethereum Execute Transaction Route
 * Executes transaction payloads from external APIs
 */

import { BigNumber, utils } from 'ethers';
import { FastifyInstance, FastifyPluginAsync } from 'fastify';

import {
  EthereumExecuteTxRequest,
  EthereumExecuteTxRequestSchema,
  ExecuteTxResponse,
  ExecuteTxResponseSchema,
} from '../../../schemas/execute-tx-schema';
import { logger } from '../../../services/logger';
import { PrivyEvmSigner } from '../../../wallet/privy';
import { isPrivyWallet, getPrivyWalletByAddress } from '../../../wallet/utils';
import { Ethereum } from '../ethereum';
import { getEthereumChainConfig } from '../ethereum.config';

/**
 * Parse a serialized transaction (hex encoded)
 */
function parseSerializedTransaction(serializedTx: string): any {
  // Remove 0x prefix if present
  const hexData = serializedTx.startsWith('0x') ? serializedTx : `0x${serializedTx}`;
  return utils.parseTransaction(hexData);
}

/**
 * Execute an Ethereum transaction
 */
export async function executeEthereumTransaction(
  fastify: FastifyInstance,
  request: EthereumExecuteTxRequest,
): Promise<ExecuteTxResponse> {
  // Apply config defaults
  const chainConfig = getEthereumChainConfig();
  const network = request.network || chainConfig.defaultNetwork;
  const walletAddress = request.walletAddress || chainConfig.defaultWallet;

  if (!walletAddress) {
    throw fastify.httpErrors.badRequest('No wallet address provided and no default wallet configured');
  }

  // Validate inputs
  if (!request.serializedTx && !request.to && !request.data) {
    throw fastify.httpErrors.badRequest('Must provide either serializedTx or transaction parameters (to, data)');
  }

  try {
    const ethereum = await Ethereum.getInstance(network);

    // Determine wallet type
    const isHardware = await ethereum.isHardwareWallet(walletAddress);
    const isPrivy = await isPrivyWallet('ethereum', walletAddress);

    if (request.serializedTx) {
      // Handle pre-serialized transaction
      if (request.skipSign) {
        // Broadcast directly
        const txResponse = await ethereum.provider.sendTransaction(request.serializedTx);
        const receipt = await ethereum.handleTransactionExecution(txResponse);

        if (receipt) {
          const fee = parseFloat(
            utils.formatEther(receipt.gasUsed.mul(receipt.effectiveGasPrice || BigNumber.from(0))),
          );
          return {
            signature: receipt.transactionHash,
            status: receipt.status === 1 ? 1 : -1,
            fee,
          };
        } else {
          return {
            signature: txResponse.hash,
            status: 0, // PENDING
          };
        }
      } else {
        // Parse and re-sign the transaction
        const parsedTx = parseSerializedTransaction(request.serializedTx);

        // Build transaction request from parsed tx
        const txRequest = {
          to: parsedTx.to,
          data: parsedTx.data,
          value: parsedTx.value,
          nonce: parsedTx.nonce,
          gasLimit: parsedTx.gasLimit,
          gasPrice: parsedTx.gasPrice,
          maxFeePerGas: parsedTx.maxFeePerGas,
          maxPriorityFeePerGas: parsedTx.maxPriorityFeePerGas,
          chainId: parsedTx.chainId,
        };

        return await sendTransaction(fastify, ethereum, walletAddress, txRequest, isHardware, isPrivy);
      }
    } else {
      // Build transaction from parameters
      const txRequest: any = {
        to: request.to,
        data: request.data,
        value: request.value ? BigNumber.from(request.value) : BigNumber.from(0),
        chainId: ethereum.chainId,
      };

      // Add gas options if provided
      if (request.gasLimit) {
        txRequest.gasLimit = request.gasLimit;
      }
      if (request.nonce !== undefined) {
        txRequest.nonce = request.nonce;
      }

      // Handle EIP-1559 vs legacy gas pricing
      if (request.maxFeePerGas !== undefined || request.maxPriorityFeePerGas !== undefined) {
        txRequest.type = 2;
        if (request.maxFeePerGas !== undefined) {
          txRequest.maxFeePerGas = utils.parseUnits(request.maxFeePerGas.toString(), 'gwei');
        }
        if (request.maxPriorityFeePerGas !== undefined) {
          txRequest.maxPriorityFeePerGas = utils.parseUnits(request.maxPriorityFeePerGas.toString(), 'gwei');
        }
      } else if (request.gasPrice !== undefined) {
        txRequest.type = 0;
        txRequest.gasPrice = utils.parseUnits(request.gasPrice.toString(), 'gwei');
      } else {
        // Use default gas options from chain
        const gasOptions = await ethereum.prepareGasOptions();
        Object.assign(txRequest, gasOptions);
      }

      return await sendTransaction(fastify, ethereum, walletAddress, txRequest, isHardware, isPrivy);
    }
  } catch (error: any) {
    logger.error(`Execute transaction failed: ${error.message}`);

    // Re-throw HTTP errors
    if (error.statusCode) {
      throw error;
    }

    throw fastify.httpErrors.internalServerError(`Execute transaction failed: ${error.message}`);
  }
}

/**
 * Send a transaction using the appropriate signer
 */
async function sendTransaction(
  fastify: FastifyInstance,
  ethereum: Ethereum,
  walletAddress: string,
  txRequest: any,
  isHardware: boolean,
  isPrivy: boolean,
): Promise<ExecuteTxResponse> {
  if (isHardware) {
    throw fastify.httpErrors.badRequest(
      'Hardware wallet signing not supported for execute-tx. Use skipSign=true with pre-signed transaction.',
    );
  }

  let txResponse;

  if (isPrivy) {
    // Sign and send via Privy
    logger.info(`Signing transaction with Privy wallet ${walletAddress}`);
    const privyWallet = await getPrivyWalletByAddress('ethereum', walletAddress);
    if (!privyWallet) {
      throw fastify.httpErrors.badRequest(`Privy wallet not found for address: ${walletAddress}`);
    }

    const privySigner = new PrivyEvmSigner(
      privyWallet.privyWalletId,
      walletAddress,
      ethereum.chainId,
      ethereum.provider,
    );

    // Fill in nonce if not provided
    if (txRequest.nonce === undefined) {
      txRequest.nonce = await ethereum.provider.getTransactionCount(walletAddress, 'pending');
    }

    txResponse = await privySigner.sendTransaction(txRequest);
  } else {
    // Sign and send with local wallet
    const wallet = await ethereum.getWallet(walletAddress);

    // Fill in nonce if not provided
    if (txRequest.nonce === undefined) {
      txRequest.nonce = await ethereum.provider.getTransactionCount(walletAddress, 'pending');
    }

    txResponse = await wallet.sendTransaction(txRequest);
    logger.info(`Sent transaction with local wallet: ${txResponse.hash}`);
  }

  // Wait for confirmation
  const receipt = await ethereum.handleTransactionExecution(txResponse);

  if (receipt) {
    const fee = parseFloat(utils.formatEther(receipt.gasUsed.mul(receipt.effectiveGasPrice || BigNumber.from(0))));
    return {
      signature: receipt.transactionHash,
      status: receipt.status === 1 ? 1 : -1,
      fee,
      error: receipt.status === 0 ? 'Transaction reverted' : undefined,
    };
  } else {
    return {
      signature: txResponse.hash,
      status: 0, // PENDING
    };
  }
}

/**
 * Route handler for execute-tx endpoint
 */
export const executeTxRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: EthereumExecuteTxRequest;
    Reply: ExecuteTxResponse;
  }>(
    '/execute-tx',
    {
      schema: {
        description:
          'Execute a transaction payload. Accepts either a serialized transaction (hex) or transaction parameters. Supports local wallets, hardware wallets (with skipSign), and Privy wallets.',
        tags: ['/chain/ethereum'],
        body: {
          ...EthereumExecuteTxRequestSchema,
          examples: [
            {
              to: '0x1234567890123456789012345678901234567890',
              data: '0x',
              value: '1000000000000000000',
            },
            {
              serializedTx: '0x02f8...',
              skipSign: true,
            },
          ],
        },
        response: {
          200: {
            ...ExecuteTxResponseSchema,
            examples: [
              {
                signature: '0x1234567890abcdef...',
                status: 1,
                fee: 0.001,
              },
            ],
          },
        },
      },
    },
    async (request) => {
      return await executeEthereumTransaction(fastify, request.body);
    },
  );
};

export default executeTxRoute;
