import { ethers, constants, utils } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { getSpender } from '../../../connectors/uniswap/uniswap.contracts';
import { bigNumberWithDecimalToStr } from '../../../services/base';
import { logger } from '../../../services/logger';
import { Ethereum } from '../ethereum';
import { EthereumLedger } from '../ethereum-ledger';
import { waitForTransactionWithTimeout } from '../ethereum.utils';
import { ApproveRequestSchema, ApproveResponseSchema, ApproveRequestType, ApproveResponseType } from '../schemas';

// Default gas limit for approve operations
const APPROVE_GAS_LIMIT = 100000;

// Permit2 address is constant across all chains
const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

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

  // Track if this is a Universal Router approval that needs Permit2
  let isUniversalRouter = false;
  let universalRouterAddress: string | null = null;

  // Determine the spender address based on the input
  let spenderAddress: string;
  try {
    // Check if the spender parameter is a connector name
    if (spender.includes('/') || spender === 'uniswap') {
      // Special case: Universal Router V2 uses Permit2 for approvals
      if (spender === 'uniswap/router') {
        logger.info(`Universal Router V2 approval requested - will handle Permit2 flow`);
        isUniversalRouter = true;
        // First approve to Permit2
        spenderAddress = PERMIT2_ADDRESS;
        // Get the actual Universal Router address for the second step
        universalRouterAddress = getSpender(network, spender);
        logger.info(
          `Will approve token to Permit2, then grant Universal Router (${universalRouterAddress}) permission via Permit2`,
        );
      } else {
        logger.info(`Looking up spender address for connector: ${spender}`);
        spenderAddress = getSpender(network, spender);
        logger.info(`Resolved connector ${spender} to spender address: ${spenderAddress}`);
      }
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

      // Get gas options using estimateGasPrice
      const gasOptions = await ethereum.prepareGasOptions(undefined, APPROVE_GAS_LIMIT);

      // Build unsigned transaction with gas parameters
      const unsignedTx = {
        to: fullToken.address,
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
      const receipt = await waitForTransactionWithTimeout(tx as any);

      approval = {
        hash: tx.hash,
        nonce: tx.nonce,
        gasUsed: receipt.gasUsed,
        effectiveGasPrice: receipt.effectiveGasPrice,
      };
    }

    // Calculate the actual fee in ETH for first approval
    let feeInEth = '0';
    if (approval.gasUsed && approval.effectiveGasPrice) {
      const feeInWei = approval.gasUsed.mul(approval.effectiveGasPrice);
      feeInEth = utils.formatEther(feeInWei);
    }

    // If this is a Universal Router approval, we need to do a second step
    if (isUniversalRouter && universalRouterAddress) {
      logger.info(`Step 2: Calling Permit2.approve() to grant Universal Router permission`);

      // Permit2 approve function ABI
      const permit2ApproveABI = [
        'function approve(address token, address spender, uint160 amount, uint48 expiration) external',
      ];

      // Calculate expiration (48 hours from now)
      const expiration = Math.floor(Date.now() / 1000) + 48 * 60 * 60;

      // Convert amount to uint160 (Permit2 uses uint160 for amounts)
      // Max uint160 is 2^160 - 1, which is smaller than uint256
      const maxUint160 = ethers.BigNumber.from('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF');
      const permit2Amount = amountBigNumber.gt(maxUint160) ? maxUint160 : amountBigNumber;

      if (isHardware) {
        // Hardware wallet flow for Permit2 approve
        logger.info(`Hardware wallet: Building Permit2.approve() transaction`);

        const ledger = new EthereumLedger();
        const nonce = await ethereum.provider.getTransactionCount(address, 'latest');

        // Build the Permit2 approve transaction data
        const iface = new utils.Interface(permit2ApproveABI);
        const data = iface.encodeFunctionData('approve', [
          fullToken.address,
          universalRouterAddress,
          permit2Amount,
          expiration,
        ]);

        // Get gas options
        const gasOptions = await ethereum.prepareGasOptions(undefined, APPROVE_GAS_LIMIT);

        // Build unsigned transaction
        const unsignedTx = {
          to: PERMIT2_ADDRESS,
          data: data,
          nonce: nonce,
          chainId: ethereum.chainId,
          ...gasOptions,
        };

        // Sign with Ledger
        const signedTx = await ledger.signTransaction(address, unsignedTx as any);

        // Send the signed transaction
        const txResponse = await ethereum.provider.sendTransaction(signedTx);

        // Wait for confirmation
        const permit2Receipt = await waitForTransactionWithTimeout(txResponse);

        logger.info(`Permit2 approval transaction confirmed: ${permit2Receipt.transactionHash}`);

        // Update fee to include both transactions
        if (permit2Receipt.gasUsed && permit2Receipt.effectiveGasPrice) {
          const permit2FeeInWei = permit2Receipt.gasUsed.mul(permit2Receipt.effectiveGasPrice);
          const totalFeeInWei = approval.gasUsed.mul(approval.effectiveGasPrice).add(permit2FeeInWei);
          feeInEth = utils.formatEther(totalFeeInWei);
        }
      } else {
        // Regular wallet flow for Permit2 approve
        const wallet = await ethereum.getWallet(address);
        const permit2Contract = new ethers.Contract(PERMIT2_ADDRESS, permit2ApproveABI, wallet);

        logger.info(
          `Calling Permit2.approve(${fullToken.address}, ${universalRouterAddress}, ${permit2Amount.toString()}, ${expiration})`,
        );

        const permit2Tx = await permit2Contract.approve(
          fullToken.address,
          universalRouterAddress,
          permit2Amount,
          expiration,
        );

        // Wait for confirmation
        const permit2Receipt = await waitForTransactionWithTimeout(permit2Tx);

        logger.info(`Permit2 approval transaction confirmed: ${permit2Receipt.transactionHash}`);

        // Update fee to include both transactions
        if (permit2Receipt.gasUsed && permit2Receipt.effectiveGasPrice) {
          const permit2FeeInWei = permit2Receipt.gasUsed.mul(permit2Receipt.effectiveGasPrice);
          const totalFeeInWei = approval.gasUsed.mul(approval.effectiveGasPrice).add(permit2FeeInWei);
          feeInEth = utils.formatEther(totalFeeInWei);
        }
      }

      logger.info(
        `Universal Router V2 approval complete: Token approved to Permit2 and Permit2 approved to Universal Router`,
      );
    }

    return {
      signature: approval.hash,
      status: 1, // CONFIRMED
      data: {
        tokenAddress: fullToken.address,
        spender: isUniversalRouter ? universalRouterAddress || spenderAddress : spenderAddress,
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
