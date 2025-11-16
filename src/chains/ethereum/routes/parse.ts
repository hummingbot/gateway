import { ethers } from 'ethers';
import { FastifyPluginAsync } from 'fastify';

import { ParseRequestType, ParseResponseType, ParseResponseSchema } from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { Ethereum } from '../ethereum';
import { EthereumParseRequest } from '../schemas';

export const parseRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: ParseRequestType;
    Reply: ParseResponseType;
  }>(
    '/parse',
    {
      schema: {
        description: 'Parse an Ethereum transaction to extract balance changes and fees',
        tags: ['/chain/ethereum'],
        body: EthereumParseRequest,
        response: {
          200: ParseResponseSchema,
        },
      },
    },
    async (request) => {
      const { network, signature, walletAddress } = request.body;

      const ethereum = await Ethereum.getInstance(network);

      try {
        // Validate transaction hash format
        if (!signature || typeof signature !== 'string' || !signature.match(/^0x[a-fA-F0-9]{64}$/)) {
          return {
            signature,
            slot: null,
            blockTime: null,
            status: 0,
            fee: null,
            error: 'Invalid transaction hash format',
          };
        }

        const txReceipt = await ethereum.getTransactionReceipt(signature);

        if (!txReceipt) {
          return {
            signature,
            slot: null,
            blockTime: null,
            status: 0,
            fee: null,
            error: 'Transaction not found',
          };
        }

        const txData = await ethereum.getTransaction(signature);

        if (!txData) {
          return {
            signature,
            slot: null,
            blockTime: null,
            status: 0,
            fee: null,
            error: 'Transaction data not found',
          };
        }

        // Get block to extract timestamp
        const block = await ethereum.provider.getBlock(txReceipt.blockNumber);
        const blockTime = block?.timestamp || null;

        // Calculate transaction fee
        const gasUsed = txReceipt.gasUsed;
        const effectiveGasPrice = txReceipt.effectiveGasPrice || txData.gasPrice || ethers.BigNumber.from(0);
        const feeInWei = gasUsed.mul(effectiveGasPrice);
        const fee = parseFloat(ethers.utils.formatEther(feeInWei));

        // Transaction status (1 = success, -1 = failed)
        const status = txReceipt.status === 1 ? 1 : -1;

        // Build token balance changes dictionary
        const tokenBalanceChanges: Record<string, number> = {};

        // Calculate native currency (ETH) balance change
        const nativeCurrencySymbol = ethereum.nativeTokenSymbol;

        // For native currency, we need to calculate:
        // - Value sent/received in the transaction
        // - Fee paid
        const value = parseFloat(ethers.utils.formatEther(txData.value));

        // If wallet is sender (from), balance decreases by value + fee
        // If wallet is receiver (to), balance increases by value
        let nativeBalanceChange = 0;
        if (txData.from.toLowerCase() === walletAddress.toLowerCase()) {
          nativeBalanceChange = -(value + fee);
        } else if (txData.to && txData.to.toLowerCase() === walletAddress.toLowerCase()) {
          nativeBalanceChange = value;
        } else {
          // Wallet might be involved in internal transactions
          nativeBalanceChange = -fee; // At minimum, they paid the fee if they initiated it
        }

        tokenBalanceChanges[nativeCurrencySymbol] = nativeBalanceChange;

        // Parse ERC20 Transfer events from logs
        const transferEventSignature = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

        for (const log of txReceipt.logs) {
          if (log.topics[0] === transferEventSignature && log.topics.length >= 3) {
            try {
              // Decode Transfer event: Transfer(address indexed from, address indexed to, uint256 value)
              const from = '0x' + log.topics[1].slice(26); // Remove padding
              const to = '0x' + log.topics[2].slice(26); // Remove padding
              const value = ethers.BigNumber.from(log.data);

              // Check if wallet is involved in this transfer
              const walletLower = walletAddress.toLowerCase();
              if (from.toLowerCase() === walletLower || to.toLowerCase() === walletLower) {
                // Get token info
                const tokenAddress = log.address;
                const token = await ethereum.getToken(tokenAddress);

                // Use token symbol if found, otherwise use address
                const identifier = token ? token.symbol : tokenAddress;
                const decimals = token?.decimals || 18;

                // Calculate balance change
                const amount = parseFloat(ethers.utils.formatUnits(value, decimals));
                const change = from.toLowerCase() === walletLower ? -amount : amount;

                // Accumulate changes for the same token
                tokenBalanceChanges[identifier] = (tokenBalanceChanges[identifier] || 0) + change;

                if (token) {
                  logger.info(`Detected token transfer: ${token.symbol} (${tokenAddress}), change: ${change}`);
                } else {
                  logger.info(`Detected token transfer not in list: ${tokenAddress}, change: ${change}`);
                }
              }
            } catch (error) {
              logger.warn(`Failed to parse transfer event: ${error.message}`);
            }
          }
        }

        logger.info(
          `Parsed transaction ${signature} - Status: ${status}, Fee: ${fee} ${nativeCurrencySymbol}, Token changes: ${Object.entries(
            tokenBalanceChanges,
          )
            .map(([token, change]) => `${token}: ${change}`)
            .join(', ')}`,
        );

        return {
          signature,
          slot: txReceipt.blockNumber,
          blockTime,
          status,
          fee,
          tokenBalanceChanges,
        };
      } catch (error) {
        logger.error(`Error parsing transaction ${signature}: ${error.message}`);
        return {
          signature,
          slot: null,
          blockTime: null,
          status: 0,
          fee: null,
          error: error.message || 'Failed to parse transaction',
        };
      }
    },
  );
};

export default parseRoute;
