import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Solana } from '../../../chains/solana/solana';
import { Jupiter } from '../jupiter';
import { logger } from '../../../services/logger';
import {
  ExecuteSwapRequest,
  ExecuteSwapResponse,
  ExecuteSwapRequestType,
  ExecuteSwapResponseType
} from '../../../schemas/trading-types/swap-schema';
import { Wallet } from '@coral-xyz/anchor';
import Decimal from 'decimal.js-light';

async function executeJupiterSwap(
  fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct?: number,
  poolAddress?: string
): Promise<ExecuteSwapResponseType> {
  const solana = await Solana.getInstance(network);
  const jupiter = await Jupiter.getInstance(network);
  const keypair = await solana.getWallet(walletAddress);
  const wallet = new Wallet(keypair as any);

  const baseTokenInfo = await solana.getToken(baseToken);
  const quoteTokenInfo = await solana.getToken(quoteToken);

  if (!baseTokenInfo || !quoteTokenInfo) {
    throw fastify.httpErrors.notFound(`Token not found: ${!baseTokenInfo ? baseToken : quoteToken}`);
  }

  const tradeSide = side === 'BUY' ? 'BUY' : 'SELL';
  const amountValue = side === 'SELL' ? amount : amount;

  try {
    const quote = await jupiter.getQuote(
      tradeSide === 'BUY' ? quoteTokenInfo.address : baseTokenInfo.address,
      tradeSide === 'BUY' ? baseTokenInfo.address : quoteTokenInfo.address,
      amountValue,
      slippagePct || jupiter.getSlippagePct(),
      false,
      false,
      tradeSide === 'BUY' ? 'ExactOut' : 'ExactIn',
      poolAddress // Pass the poolAddress parameter
    );

    const { signature, feeInLamports } = await jupiter.executeSwap(
      wallet,
      quote
    );
    const { baseTokenBalanceChange, quoteTokenBalanceChange } = 
      await solana.extractPairBalanceChangesAndFee(
        signature,
        baseTokenInfo,
        quoteTokenInfo,
        wallet.publicKey.toBase58()
      );

    return {
      signature,
      totalInputSwapped: Math.abs(side === 'SELL' ? baseTokenBalanceChange : quoteTokenBalanceChange),
      totalOutputSwapped: Math.abs(side === 'SELL' ? quoteTokenBalanceChange : baseTokenBalanceChange),
      fee: feeInLamports / 1e9,
      baseTokenBalanceChange: baseTokenBalanceChange,
      quoteTokenBalanceChange: quoteTokenBalanceChange
    };
  } catch (error) {
    logger.error(`Jupiter swap error: ${error}`);
    throw fastify.httpErrors.internalServerError('Failed to execute Jupiter swap');
  }
}

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const solana = await Solana.getInstance('mainnet-beta');
  let firstWalletAddress = '<solana-wallet-address>';
  
  try {
    firstWalletAddress = await solana.getFirstWalletAddress() || firstWalletAddress;
  } catch (error) {
    logger.warn('No wallets found for examples in schema');
  }
  
  // Update schema example
  ExecuteSwapRequest.properties.walletAddress.examples = [firstWalletAddress];

  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: ExecuteSwapResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute Jupiter swap',
        tags: ['jupiter'],
        body: {
          ...ExecuteSwapRequest,
          properties: {
            ...ExecuteSwapRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            walletAddress: { type: 'string', examples: [firstWalletAddress] },
            baseToken: { type: 'string', examples: ['SOL'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [0.1] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            slippagePct: { type: 'number', examples: [0.5], description: 'Slippage tolerance in percentage (e.g., 0.5 for 0.5%)' },
            poolAddress: { type: 'string', examples: ['jupiter-aggregator'], description: 'Optional pool address for routing' }
          }
        },
        response: { 200: ExecuteSwapResponse }
      }
    },
    async (request) => {
      const { network, walletAddress, baseToken, quoteToken, amount, side, slippagePct, poolAddress } = request.body;
      
      // For Jupiter, same token pair rules apply:
      // 1. If poolAddress is provided, use it to identify the specific market
      // 2. If only baseToken/quoteToken are provided, use default routing
      
      // Verify we have the needed parameters
      if (!baseToken || !quoteToken) {
        throw fastify.httpErrors.badRequest('baseToken and quoteToken are required');
      }
      
      // Log the operation
      if (poolAddress) {
        logger.debug(`Executing Jupiter swap for ${baseToken}-${quoteToken} with pool: ${poolAddress}`);
      } else {
        logger.debug(`Executing Jupiter swap for ${baseToken}-${quoteToken} with default routing`);
      }
      
      return await executeJupiterSwap(
        fastify,
        network || 'mainnet-beta',
        walletAddress,
        baseToken,
        quoteToken,
        amount,
        side as 'BUY' | 'SELL',
        slippagePct,
        poolAddress
      );
    }
  );
};

export default executeSwapRoute; 