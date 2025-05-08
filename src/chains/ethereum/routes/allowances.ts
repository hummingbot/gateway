import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { Ethereum } from '../ethereum';
import { logger } from '../../../services/logger';
import { AllowancesRequestType, AllowancesResponseType } from '../../../schemas/chain-schema';
import { TokenInfo } from '../ethereum';
import { tokenValueToString } from '../../../services/base';

export async function getTokenSymbolsToTokens(
  ethereum: Ethereum,
  tokenSymbols: Array<string>
): Promise<Record<string, TokenInfo>> {
  const tokens: Record<string, TokenInfo> = {};

  for (let i = 0; i < tokenSymbols.length; i++) {
    const symbol = tokenSymbols[i];
    const token = ethereum.getTokenBySymbol(symbol);
    if (token) tokens[symbol] = token;
  }

  return tokens;
}

export async function getEthereumAllowances(
  fastify: FastifyInstance,
  network: string,
  address: string,
  connector: string,
  tokenSymbols: string[],
  schema?: string
) {
  try {
    const ethereum = await Ethereum.getInstance(network);
    await ethereum.init();
    
    const wallet = await ethereum.getWallet(address);
    const tokens = await getTokenSymbolsToTokens(ethereum, tokenSymbols);
    
    // Use the updated getSpender method that handles AMM/CLMM differences
    const spenderAddress = ethereum.getSpender(connector, schema);

    const approvals: Record<string, string> = {};
    await Promise.all(
      Object.keys(tokens).map(async (symbol) => {
        const contract = ethereum.getContract(
          tokens[symbol].address,
          ethereum.provider
        );
        approvals[symbol] = tokenValueToString(
          await ethereum.getERC20Allowance(
            contract,
            wallet,
            spenderAddress,
            tokens[symbol].decimals
          )
        );
      })
    );

    return {
      spender: spenderAddress,
      approvals: approvals,
    };
  } catch (error) {
    logger.error(`Error getting allowances: ${error.message}`);
    throw fastify.httpErrors.internalServerError(`Failed to get allowances: ${error.message}`);
  }
}

export const allowancesRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const ethereum = await Ethereum.getInstance('base');
  let firstWalletAddress = '<ethereum-wallet-address>';
  
  try {
    firstWalletAddress = await ethereum.getFirstWalletAddress() || firstWalletAddress;
  } catch (error) {
    logger.warn('No wallets found for examples in schema');
  }

  fastify.post<{
    Body: AllowancesRequestType;
    Reply: AllowancesResponseType;
  }>(
    '/allowances',
    {
      schema: {
        description: 'Get token allowances',
        tags: ['ethereum'],
        body: Type.Object({
          network: Type.String({ examples: ['base', 'mainnet', 'sepolia', 'polygon'] }),
          address: Type.String({ examples: [firstWalletAddress] }),
          connector: Type.String({ examples: ['uniswap'] }),
          schema: Type.Optional(Type.String({ 
            default: 'clmm',
            examples: ['amm', 'clmm'],
            enum: ['amm', 'clmm']
          })),
          tokenSymbols: Type.Array(Type.String(), { examples: [['USDC', 'DAI']] })
        }),
        response: {
          200: Type.Object({
            spender: Type.String(),
            approvals: Type.Record(Type.String(), Type.String())
          })
        }
      }
    },
    async (request) => {
      const { network, address, connector, tokenSymbols, schema } = request.body;
      return await getEthereumAllowances(
        fastify, 
        network, 
        address, 
        connector, 
        tokenSymbols, 
        schema
      );
    }
  );
};

export default allowancesRoute;