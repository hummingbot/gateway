import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { Solana } from '../../../chains/solana/solana';
import { PublicKey } from '@solana/web3.js';
import { logger } from '../../../services/logger';
import { getMeteoraSwapQuote } from './quoteSwap';
import { SwapQuoteExactOut, SwapQuote } from '@meteora-ag/dlmm';

// Schema definitions
const ExecuteSwapRequest = Type.Object({
  network: Type.Optional(Type.String({ default: 'mainnet-beta' })),
  walletAddress: Type.String({ 
    description: 'Will use first available wallet if not specified',
    examples: [] // Will be populated during route registration
  }),
  baseToken: Type.String({ 
    default: 'M3M3',
    description: 'Token symbol or address'
  }),
  quoteToken: Type.String({ 
    default: 'USDC',
    description: 'Token symbol or address'
  }),
  amount: Type.Number({ default: 10 }),
  side: Type.String({ 
    enum: ['buy', 'sell'],
    default: 'buy',
    description: 'Trade direction'
  }),
  poolAddress: Type.String({ default: 'FtFUzuXbbw6oBbU53SDUGspEka1D5Xyc4cwnkxer6xKz' }),
  slippagePct: Type.Optional(Type.Number({ default: 1 })),
});

const ExecuteSwapResponse = Type.Object({
  signature: Type.String(),
  totalInputSwapped: Type.Number(),
  totalOutputSwapped: Type.Number(),
  fee: Type.Number(),
  baseTokenBalanceChange: Type.Number(),
  quoteTokenBalanceChange: Type.Number(),
});

type ExecuteSwapRequestType = Static<typeof ExecuteSwapRequest>;
type ExecuteSwapResponseType = Static<typeof ExecuteSwapResponse>;

async function executeSwap(
  fastify: FastifyInstance,
  network: string,
  address: string,
  baseTokenIdentifier: string,
  quoteTokenIdentifier: string,
  amount: number,
  side: 'buy' | 'sell',
  poolAddress: string,
  slippagePct?: number
): Promise<ExecuteSwapResponseType> {
  const solana = await Solana.getInstance(network);
  const wallet = await solana.getWallet(address);

  const { 
    inputToken: inToken, 
    outputToken: outToken, 
    swapAmount, 
    quote: swapQuote, 
    dlmmPool 
  } = await getMeteoraSwapQuote(
    fastify,
    network,
    baseTokenIdentifier,
    quoteTokenIdentifier,
    amount,
    side,
    poolAddress,
    slippagePct
  );

  logger.info(`Executing ${side} swap: ${amount.toFixed(4)} ${inToken.symbol} -> ${outToken.symbol} in pool ${poolAddress}`);

  const swapTx = side === 'buy'
    ? await dlmmPool.swapExactOut({
        inToken: new PublicKey(inToken.address),
        outToken: new PublicKey(outToken.address),
        outAmount: (swapQuote as SwapQuoteExactOut).outAmount,
        maxInAmount: (swapQuote as SwapQuoteExactOut).maxInAmount,
        lbPair: dlmmPool.pubkey,
        user: wallet.publicKey,
        binArraysPubkey: (swapQuote as SwapQuoteExactOut).binArraysPubkey,
      })
    : await dlmmPool.swap({
        inToken: new PublicKey(inToken.address),
        outToken: new PublicKey(outToken.address),
        inAmount: swapAmount,
        minOutAmount: (swapQuote as SwapQuote).minOutAmount,
        lbPair: dlmmPool.pubkey,
        user: wallet.publicKey,
        binArraysPubkey: (swapQuote as SwapQuote).binArraysPubkey,
      });

  const { signature, fee } = await solana.sendAndConfirmTransaction(swapTx, [wallet], 150_000);

  const { baseTokenBalanceChange, quoteTokenBalanceChange } = 
    await solana.extractPairBalanceChangesAndFee(
      signature,
      await solana.getToken(dlmmPool.tokenX.publicKey.toBase58()),
      await solana.getToken(dlmmPool.tokenY.publicKey.toBase58()),
      wallet.publicKey.toBase58()
    );

  logger.info(`Swap executed successfully: ${Math.abs(baseTokenBalanceChange).toFixed(4)} ${inToken.symbol} -> ${Math.abs(quoteTokenBalanceChange).toFixed(4)} ${outToken.symbol}`);

  return {
    signature,
    totalInputSwapped: Math.abs(baseTokenBalanceChange),
    totalOutputSwapped: Math.abs(quoteTokenBalanceChange),
    fee,
    baseTokenBalanceChange,
    quoteTokenBalanceChange,
  };
}

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const solana = await Solana.getInstance('mainnet-beta');
  let firstWalletAddress = '<solana-wallet-address>';
  
  try {
    firstWalletAddress = await solana.getFirstWalletAddress();
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
        description: 'Execute a token swap on Meteora',
        tags: ['meteora'],
        body: ExecuteSwapRequest,
        response: {
          200: ExecuteSwapResponse
        },
      }
    },
    async (request) => {
      try {
        const { walletAddress, baseToken, quoteToken, amount, side, poolAddress, slippagePct } = request.body;
        const network = request.body.network || 'mainnet-beta';
        
        logger.info(`Received swap request: ${amount} ${baseToken} -> ${quoteToken} in pool ${poolAddress}`);
        
        return await executeSwap(
          fastify,
          network,
          walletAddress,
          baseToken,
          quoteToken,
          amount,
          side as 'buy' | 'sell',
          poolAddress,
          slippagePct
        );
      } catch (e) {
        if (e.statusCode) return e;
        logger.error('Error executing swap:', e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default executeSwapRoute; 