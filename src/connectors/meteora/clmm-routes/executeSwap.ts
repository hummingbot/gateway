import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Solana } from '../../../chains/solana/solana';
import { PublicKey } from '@solana/web3.js';
import { logger } from '../../../services/logger';
import { getRawSwapQuote } from './quoteSwap';
import { SwapQuoteExactOut, SwapQuote } from '@meteora-ag/dlmm';
import { 
  ExecuteSwapRequestType,
  ExecuteSwapResponseType,
  ExecuteSwapRequest,
  ExecuteSwapResponse
} from '../../../services/swap-interfaces';

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
    inputToken, 
    outputToken, 
    swapAmount, 
    quote: swapQuote, 
    dlmmPool 
  } = await getRawSwapQuote(
    fastify,
    network,
    baseTokenIdentifier,
    quoteTokenIdentifier,
    amount,
    side,
    poolAddress,
    slippagePct
  );

  logger.info(`Executing ${amount.toFixed(4)} ${side} swap in pool ${poolAddress}`);

  const swapTx = side === 'buy'
    ? await dlmmPool.swapExactOut({
        inToken: new PublicKey(inputToken.address),
        outToken: new PublicKey(outputToken.address),
        outAmount: (swapQuote as SwapQuoteExactOut).outAmount,
        maxInAmount: (swapQuote as SwapQuoteExactOut).maxInAmount,
        lbPair: dlmmPool.pubkey,
        user: wallet.publicKey,
        binArraysPubkey: (swapQuote as SwapQuoteExactOut).binArraysPubkey,
      })
    : await dlmmPool.swap({
        inToken: new PublicKey(inputToken.address),
        outToken: new PublicKey(outputToken.address),
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

  logger.info(`Swap executed successfully: ${Math.abs(baseTokenBalanceChange).toFixed(4)} ${inputToken.symbol} -> ${Math.abs(quoteTokenBalanceChange).toFixed(4)} ${outputToken.symbol}`);

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
        body: {
          ...ExecuteSwapRequest,
          properties: {
            ...ExecuteSwapRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            baseToken: { type: 'string', examples: ['SOL'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [0.1] },
            side: { type: 'string', enum: ['buy', 'sell'], examples: ['sell'] },
            poolAddress: { type: 'string', examples: ['2sf5NYcY4zUPXUSmG6f66mskb24t5F8S11pC1Nz5nQT3'] },
            slippagePct: { type: 'number', examples: [1] }
          }
        },
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