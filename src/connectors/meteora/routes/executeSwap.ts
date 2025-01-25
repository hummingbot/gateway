import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { Meteora } from '../meteora';
import { Solana } from '../../../chains/solana/solana';
import { PublicKey } from '@solana/web3.js';
import { BN } from 'bn.js';
import { logger } from '../../../services/logger';

// Schema definitions
const ExecuteSwapRequest = Type.Object({
  network: Type.String({ default: 'mainnet-beta' }),
  address: Type.String({ default: '<your-wallet-address>' }),
  inputTokenSymbol: Type.String({ default: 'M3M3' }),
  outputTokenSymbol: Type.String({ default: 'USDC' }),
  amount: Type.Number({ default: 10 }),
  poolAddress: Type.String({ default: 'FtFUzuXbbw6oBbU53SDUGspEka1D5Xyc4cwnkxer6xKz' }),
  slippagePct: Type.Optional(Type.Number()),
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
  inputTokenSymbol: string,
  outputTokenSymbol: string,
  amount: number,
  poolAddress: string,
  slippagePct?: number
): Promise<ExecuteSwapResponseType> {
  const solana = await Solana.getInstance(network);
  const meteora = await Meteora.getInstance(network);
  const wallet = await solana.getWallet(address);
  const inputToken = await solana.getTokenBySymbol(inputTokenSymbol);
  const outputToken = await solana.getTokenBySymbol(outputTokenSymbol);

  if (!inputToken || !outputToken) {
    throw fastify.httpErrors.notFound(
      `Token not found: ${!inputToken ? inputTokenSymbol : outputTokenSymbol}`
    );
  }

  const dlmmPool = await meteora.getDlmmPool(poolAddress);
  if (!dlmmPool) {
    throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
  }

  await dlmmPool.refetchStates();

  const swapAmount = new BN(amount * 10 ** inputToken.decimals);
  const swapForY = inputToken.address === dlmmPool.tokenX.publicKey.toBase58();

  const binArrays = await dlmmPool.getBinArrayForSwap(swapForY);
  const effectiveSlippage = new BN((slippagePct ?? meteora.getSlippagePct()) * 100);
  const swapQuote = dlmmPool.swapQuote(swapAmount, swapForY, effectiveSlippage, binArrays);

  const swapTx = await dlmmPool.swap({
    inToken: new PublicKey(inputToken.address),
    outToken: new PublicKey(outputToken.address),
    inAmount: swapAmount,
    minOutAmount: swapQuote.minOutAmount,
    lbPair: dlmmPool.pubkey,
    user: wallet.publicKey,
    binArraysPubkey: swapQuote.binArraysPubkey,
  });

  const signature = await solana.sendAndConfirmTransaction(swapTx, [wallet], 150_000);

  let inputBalanceChange: number, outputBalanceChange: number, fee: number;

  if (inputToken.symbol === 'SOL') {
    ({ balanceChange: inputBalanceChange, fee } = await solana.extractAccountBalanceChangeAndFee(signature, 0));
  } else {
    ({ balanceChange: inputBalanceChange, fee } = await solana.extractTokenBalanceChangeAndFee(
      signature,
      inputToken.address,
      wallet.publicKey.toBase58()
    ));
  }

  if (outputToken.symbol === 'SOL') {
    ({ balanceChange: outputBalanceChange } = await solana.extractAccountBalanceChangeAndFee(signature, 0));
  } else {
    ({ balanceChange: outputBalanceChange } = await solana.extractTokenBalanceChangeAndFee(
      signature,
      outputToken.address,
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
  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: ExecuteSwapResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a swap on Meteora',
        tags: ['meteora'],
        body: ExecuteSwapRequest,
        response: {
          200: ExecuteSwapResponse
        },
      }
    },
    async (request) => {
      try {
        const { network, address, inputTokenSymbol, outputTokenSymbol, amount, poolAddress, slippagePct } = request.body;
        
        return await executeSwap(
          fastify,
          network,
          address,
          inputTokenSymbol,
          outputTokenSymbol,
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