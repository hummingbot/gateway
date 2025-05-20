import { Type } from '@sinclair/typebox';
import { ethers, constants, utils } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import {
  ApproveRequestType,
  ApproveResponseType,
} from '../../../schemas/chain-schema';
import { bigNumberWithDecimalToStr } from '../../../services/base';
import { logger } from '../../../services/logger';
import { Ethereum, TokenInfo } from '../ethereum';
import { getSpender } from '../../../connectors/uniswap/uniswap.contracts';

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

  let wallet: ethers.Wallet;
  try {
    wallet = await ethereum.getWallet(address);
  } catch (err) {
    logger.error(`Failed to load wallet: ${err.message}`);
    throw fastify.httpErrors.internalServerError(
      `Failed to load wallet: ${err.message}`,
    );
  }

  // Try to find the token by symbol or address
  const fullToken = ethereum.getTokenBySymbol(token);
  if (!fullToken) {
    // Check if the token string is a valid Ethereum address
    try {
      const normalizedAddress = utils.getAddress(token);
      // If it's a valid address but not in our token list, we create a basic contract
      // and try to get its decimals, symbol, and name directly
      try {
        const contract = ethereum.getContract(normalizedAddress, wallet);
        logger.info(
          `Token ${token} not found in list but has valid address format. Fetching token info from chain...`,
        );

        // Try to fetch token information directly from the contract
        const [decimals, symbol, name] = await Promise.all([
          contract.decimals(),
          contract.symbol(),
          contract.name(),
        ]);

        // Create a token info object
        const tokenInfo: TokenInfo = {
          chainId: ethereum.chainId,
          address: normalizedAddress,
          name: name,
          symbol: symbol,
          decimals: decimals,
        };

        // Use this token for the approval
        const amountBigNumber = amount
          ? utils.parseUnits(amount, tokenInfo.decimals)
          : constants.MaxUint256;

        // Call approve function
        const approval = await ethereum.approveERC20(
          contract,
          wallet,
          spenderAddress,
          amountBigNumber,
        );

        return {
          tokenAddress: tokenInfo.address,
          spender: spenderAddress,
          amount: bigNumberWithDecimalToStr(
            amountBigNumber,
            tokenInfo.decimals,
          ),
          nonce: approval.nonce,
          txHash: approval.hash,
          approval: toEthereumTransaction(approval),
        };
      } catch (contractErr) {
        logger.error(
          `Failed to interact with token contract at ${normalizedAddress}: ${contractErr.message}`,
        );
        throw fastify.httpErrors.badRequest(
          `Invalid token address or not an ERC20 token: ${token}`,
        );
      }
    } catch (addressErr) {
      // Not a valid Ethereum address or symbol
      throw fastify.httpErrors.badRequest(
        `Token not supported and not a valid Ethereum address: ${token}`,
      );
    }
  }

  const amountBigNumber = amount
    ? utils.parseUnits(amount, fullToken.decimals)
    : constants.MaxUint256;

  // Instantiate a contract and pass in wallet, which act on behalf of that signer
  const contract = ethereum.getContract(fullToken.address, wallet);

  try {
    // Call approve function
    const approval = await ethereum.approveERC20(
      contract,
      wallet,
      spenderAddress,
      amountBigNumber,
    );

    return {
      tokenAddress: fullToken.address,
      spender: spenderAddress,
      amount: bigNumberWithDecimalToStr(amountBigNumber, fullToken.decimals),
      nonce: approval.nonce,
      txHash: approval.hash,
      approval: toEthereumTransaction(approval),
    };
  } catch (error) {
    logger.error(`Error approving token: ${error.message}`);

    // Handle specific error cases
    if (error.message && error.message.includes('insufficient funds')) {
      throw fastify.httpErrors.badRequest(
        'Insufficient funds for transaction. Please ensure you have enough ETH to cover gas costs.',
      );
    }

    throw fastify.httpErrors.internalServerError(
      `Failed to approve token: ${error.message}`,
    );
  }
}

export const approveRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const ethereum = await Ethereum.getInstance('base');
  let firstWalletAddress = '<ethereum-wallet-address>';

  try {
    firstWalletAddress =
      (await ethereum.getFirstWalletAddress()) || firstWalletAddress;
  } catch (error) {
    logger.warn('No wallets found for examples in schema');
  }

  fastify.post<{
    Body: ApproveRequestType;
    Reply: ApproveResponseType;
  }>(
    '/approve',
    {
      schema: {
        description: 'Approve token spending',
        tags: ['ethereum'],
        body: Type.Object({
          network: Type.String({
            examples: [
              'mainnet',
              'arbitrum',
              'optimism',
              'base',
              'sepolia',
              'bsc',
              'avalanche',
              'celo',
              'polygon',
              'blast',
              'zora',
              'worldchain',
            ],
          }),
          address: Type.String({ examples: [firstWalletAddress] }),
          spender: Type.String({
            examples: ['uniswap/clmm', 'uniswap', '0xC36442b4a4522E871399CD717aBDD847Ab11FE88'],
            description: 'Spender can be a connector name (e.g., uniswap/clmm, uniswap/amm, uniswap) or a direct contract address',
          }),
          token: Type.String({ examples: ['USDC', 'DAI'] }),
          amount: Type.Optional(
            Type.String({
              examples: [''], // No examples since it's typically omitted for max approval
              description:
                'The amount to approve. If not provided, defaults to maximum amount (unlimited approval).',
            }),
          ),
        }),
        response: {
          200: Type.Object({
            tokenAddress: Type.String(),
            spender: Type.String(),
            amount: Type.String(),
            nonce: Type.Number(),
            txHash: Type.String(),
            approval: Type.Object({
              data: Type.String(),
              to: Type.String(),
              maxPriorityFeePerGas: Type.Union([Type.String(), Type.Null()]),
              maxFeePerGas: Type.Union([Type.String(), Type.Null()]),
              gasLimit: Type.Union([Type.String(), Type.Null()]),
              value: Type.String(),
            }),
          }),
        },
      },
    },
    async (request) => {
      const { network, address, spender, token, amount } = request.body;

      return await approveEthereumToken(
        fastify,
        network,
        address,
        spender,
        token,
        amount,
      );
    },
  );
};

export default approveRoute;
