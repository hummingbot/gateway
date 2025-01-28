import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { Meteora } from '../meteora';
import { Solana } from '../../../chains/solana/solana';
import { PublicKey } from '@solana/web3.js';
import { BN } from 'bn.js';
import { logger } from '../../../services/logger';

// Schema definitions
const ExecuteSwapRequest = Type.Object({
  network: Type.Optional(Type.String({ default: 'mainnet-beta' })),
  walletAddress: Type.String({ 
    description: 'Will use first available wallet if not specified',
    examples: [] // Will be populated during route registration
  }),
  inputToken: Type.String({ 
    default: 'M3M3',
    description: 'Token symbol or address'
  }),
  outputToken: Type.String({ 
    default: 'USDC',
    description: 'Token symbol or address'
  }),
  amount: Type.Number({ default: 10 }),
  poolAddress: Type.String({ default: 'FtFUzuXbbw6oBbU53SDUGspEka1D5Xyc4cwnkxer6xKz' }),
  slippagePct: Type.Optional(Type.Number({ default: 1 })),
});

const ExecuteSwapResponse = Type.Object({
  signature: Type.String(),
  totalInputSwapped: Type.Number(),
  totalOutputSwapped: Type.Number(),
  fee: Type.Number(),
});

type ExecuteSwapRequestType = Static<typeof ExecuteSwapRequest>;
type ExecuteSwapResponseType = Static<typeof ExecuteSwapResponse>;

async function executeSwap(
  fastify: FastifyInstance,
  network: string,
  address: string,
  inputTokenIdentifier: string,
  outputTokenIdentifier: string,
  amount: number,
  poolAddress: string,
  slippagePct?: number
): Promise<ExecuteSwapResponseType> {
  const solana = await Solana.getInstance(network);
  const meteora = await Meteora.getInstance(network);
  const wallet = await solana.getWallet(address);
  
  const inToken = await solana.getToken(inputTokenIdentifier);
  const outToken = await solana.getToken(outputTokenIdentifier);

  if (!inToken || !outToken) {
    throw fastify.httpErrors.badRequest(
      `Token not found: ${!inToken ? inputTokenIdentifier : outputTokenIdentifier}`
    );
  }

  const dlmmPool = await meteora.getDlmmPool(poolAddress);
  if (!dlmmPool) {
    throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
  }

  await dlmmPool.refetchStates();

  const swapAmount = new BN(amount * 10 ** inToken.decimals);
  const swapForY = inToken.address === dlmmPool.tokenX.publicKey.toBase58();

  const binArrays = await dlmmPool.getBinArrayForSwap(swapForY);
  const effectiveSlippage = new BN((slippagePct ?? meteora.getSlippagePct()) * 100);
  const swapQuote = dlmmPool.swapQuote(swapAmount, swapForY, effectiveSlippage, binArrays);

  const swapTx = await dlmmPool.swap({
    inToken: new PublicKey(inToken.address),
    outToken: new PublicKey(outToken.address),
    inAmount: swapAmount,
    minOutAmount: swapQuote.minOutAmount,
    lbPair: dlmmPool.pubkey,
    user: wallet.publicKey,
    binArraysPubkey: swapQuote.binArraysPubkey,
  });

  const signature = await solana.sendAndConfirmTransaction(swapTx, [wallet], 150_000);

  let inputBalanceChange: number, outputBalanceChange: number, fee: number;

  if (inToken.symbol === 'SOL') {
    ({ balanceChange: inputBalanceChange, fee } = await solana.extractAccountBalanceChangeAndFee(signature, 0));
  } else {
    ({ balanceChange: inputBalanceChange, fee } = await solana.extractTokenBalanceChangeAndFee(
      signature,
      inToken.address,
      wallet.publicKey.toBase58()
    ));
  }

  if (outToken.symbol === 'SOL') {
    ({ balanceChange: outputBalanceChange } = await solana.extractAccountBalanceChangeAndFee(signature, 0));
  } else {
    ({ balanceChange: outputBalanceChange } = await solana.extractTokenBalanceChangeAndFee(
      signature,
      outToken.address,
      wallet.publicKey.toBase58()
    ));
  }

  return {
    signature,
    totalInputSwapped: Math.abs(inputBalanceChange),
    totalOutputSwapped: Math.abs(outputBalanceChange),
    fee,
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
        const { walletAddress, inputToken, outputToken, amount, poolAddress, slippagePct } = request.body;
        const network = request.body.network || 'mainnet-beta';
        
        return await executeSwap(
          fastify,
          network,
          walletAddress,
          inputToken,
          outputToken,
          amount,
          poolAddress,
          slippagePct
        );
      } catch (e) {
        if (e.statusCode) return e;
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default executeSwapRoute; 