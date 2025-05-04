import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { Ethereum } from '../ethereum';
import { logger } from '../../../services/logger';
import { ApproveRequestType, ApproveResponseType } from '../../../schemas/chain-schema';
import { bigNumberWithDecimalToStr } from '../../../services/base';
import { ethers, BigNumber, constants, utils } from 'ethers';

// Helper function to convert transaction to a format matching the CustomTransactionSchema
const toEthereumTransaction = (transaction: ethers.Transaction) => {
  return {
    data: transaction.data,
    to: transaction.to || ''
  };
};

export async function approveEthereumToken(
  fastify: FastifyInstance,
  network: string,
  address: string, 
  spender: string,
  token: string,
  amount?: string
) {
  try {
    const ethereum = await Ethereum.getInstance(network);
    await ethereum.init();
    
    let wallet: ethers.Wallet;
    try {
      wallet = await ethereum.getWallet(address);
    } catch (err) {
      logger.error(`Failed to load wallet: ${err.message}`);
      throw fastify.httpErrors.internalServerError(`Failed to load wallet: ${err.message}`);
    }
    
    const spenderAddress = ethereum.getSpender(spender);
    const fullToken = ethereum.getTokenBySymbol(token);
    if (!fullToken) {
      throw fastify.httpErrors.badRequest(`Token not supported: ${token}`);
    }
    
    const amountBigNumber = amount
      ? utils.parseUnits(amount, fullToken.decimals)
      : constants.MaxUint256;
    
    // instantiate a contract and pass in wallet, which act on behalf of that signer
    const contract = ethereum.getContract(fullToken.address, wallet);

    // call approve function - let ethereum.ts handle gas params and nonce internally
    const approval = await ethereum.approveERC20(
      contract,
      wallet,
      spenderAddress,
      amountBigNumber,
      undefined, // nonce - let ethereum.ts handle it
      undefined, // maxFeePerGas - let ethereum.ts handle it
      undefined, // maxPriorityFeePerGas - let ethereum.ts handle it
      ethereum.gasPrice
    );

    return {
      tokenAddress: fullToken.address,
      spender: spenderAddress,
      amount: bigNumberWithDecimalToStr(amountBigNumber, fullToken.decimals),
      nonce: approval.nonce,
      approval: toEthereumTransaction(approval),
    };
  } catch (error) {
    if (error.statusCode) {
      throw error; // Re-throw if it's already a Fastify error
    }
    logger.error(`Error approving token: ${error.message}`);
    throw fastify.httpErrors.internalServerError(`Failed to approve token: ${error.message}`);
  }
}

export const approveRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const ethereum = await Ethereum.getInstance('sepolia');
  let firstWalletAddress = '<ethereum-wallet-address>';
  
  try {
    firstWalletAddress = await ethereum.getFirstWalletAddress() || firstWalletAddress;
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
          network: Type.String({ examples: ['mainnet', 'sepolia', 'polygon'] }),
          address: Type.String({ examples: [firstWalletAddress] }),
          spender: Type.String({ examples: ['uniswap', '0xSpender...'] }),
          token: Type.String({ examples: ['USDC', 'DAI'] }),
          amount: Type.Optional(Type.String({ 
            examples: ['10.5'],
            description: 'The amount to approve. If not provided, defaults to maximum amount (unlimited approval).'
          }))
        }),
        response: {
          200: Type.Object({
            tokenAddress: Type.String(),
            spender: Type.String(),
            amount: Type.String(),
            nonce: Type.Number(),
            approval: Type.Object({
              data: Type.String(),
              to: Type.String(),
              maxPriorityFeePerGas: Type.Union([Type.String(), Type.Null()]),
              maxFeePerGas: Type.Union([Type.String(), Type.Null()]),
              gasLimit: Type.Union([Type.String(), Type.Null()]),
              value: Type.String()
            })
          })
        }
      }
    },
    async (request) => {
      const { 
        network, 
        address, 
        spender, 
        token, 
        amount
      } = request.body;
      
      return await approveEthereumToken(
        fastify, 
        network, 
        address, 
        spender, 
        token, 
        amount
      );
    }
  );
};

export default approveRoute;