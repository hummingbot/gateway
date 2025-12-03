import { Percentage, TransactionBuilder } from '@orca-so/common-sdk';
import {
  ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil,
  WhirlpoolIx,
  swapQuoteByInputToken,
  swapQuoteByOutputToken,
  IGNORE_CACHE,
  SwapQuote,
} from '@orca-so/whirlpools-sdk';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { getSolanaChainConfig } from '../../../chains/solana/solana.config';
import { ExecuteSwapResponseType, ExecuteSwapResponse } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { handleWsolAta } from '../orca.utils';
import { OrcaClmmExecuteSwapRequest, OrcaClmmExecuteSwapRequestType } from '../schemas';

export async function executeSwap(
  network: string,
  address: string,
  baseTokenIdentifier: string,
  quoteTokenIdentifier: string,
  amount: number,
  side: 'BUY' | 'SELL',
  poolAddress: string,
  slippagePct: number = 1,
): Promise<ExecuteSwapResponseType> {
  const solana = await Solana.getInstance(network);
  const orca = await Orca.getInstance(network);
  const wallet = await solana.getWallet(address);
  const client = await orca.getWhirlpoolClientForWallet(address);
  const whirlpoolPubkey = new PublicKey(poolAddress);
  const whirlpool = await client.getPool(whirlpoolPubkey, IGNORE_CACHE);

  await whirlpool.refreshData();

  // Get token info
  const baseTokenInfo = await solana.getToken(baseTokenIdentifier);
  const quoteTokenInfo = await solana.getToken(quoteTokenIdentifier);

  if (!baseTokenInfo || !quoteTokenInfo) {
    throw httpErrors.badRequest(`Token not found: ${!baseTokenInfo ? baseTokenIdentifier : quoteTokenIdentifier}`);
  }

  // Fetch token mint info
  const mintA = await client.getFetcher().getMintInfo(whirlpool.getTokenAInfo().address);
  const mintB = await client.getFetcher().getMintInfo(whirlpool.getTokenBInfo().address);
  if (!mintA || !mintB) {
    throw httpErrors.notFound('Token mint not found');
  }

  // Determine swap direction
  // side = BUY means buying `amount` of base token (quote -> base)
  // side = SELL means selling `amount` of base token (base -> quote)
  const isBuyingSide = side === 'BUY';

  // For BUY: amount = desired base token (output), need to calculate quote input
  // For SELL: amount = base token to sell (input), calculate quote output
  const { inputTokenInfo, outputTokenInfo, inputTokenMint, outputTokenMint } = isBuyingSide
    ? {
        // BUY: amount is output (base), input is quote
        outputTokenInfo: baseTokenInfo,
        inputTokenInfo: quoteTokenInfo,
        outputTokenMint: baseTokenInfo.address,
        inputTokenMint: quoteTokenInfo.address,
      }
    : {
        // SELL: amount is input (base), output is quote
        inputTokenInfo: baseTokenInfo,
        outputTokenInfo: quoteTokenInfo,
        inputTokenMint: baseTokenInfo.address,
        outputTokenMint: quoteTokenInfo.address,
      };

  // Determine if we're swapping A->B or B->A based on input token
  const isInputTokenA = inputTokenMint === whirlpool.getTokenAInfo().address.toString();
  const aToB = isInputTokenA;

  // Convert amount to BN with proper decimals
  const inputDecimals = isInputTokenA ? mintA.decimals : mintB.decimals;
  const outputDecimals = isInputTokenA ? mintB.decimals : mintA.decimals;

  // Get swap quote based on side
  let quote: SwapQuote;
  if (isBuyingSide) {
    // BUY: quote by output token (how much base we want to receive)
    const outputAmountBN = new BN(Math.floor(amount * Math.pow(10, outputDecimals)));
    quote = await swapQuoteByOutputToken(
      whirlpool,
      outputTokenMint,
      outputAmountBN,
      Percentage.fromDecimal(new Decimal(slippagePct)),
      ORCA_WHIRLPOOL_PROGRAM_ID,
      client.getFetcher(),
      IGNORE_CACHE,
    );
  } else {
    // SELL: quote by input token (how much base we're selling)
    const inputAmountBN = new BN(Math.floor(amount * Math.pow(10, inputDecimals)));
    quote = await swapQuoteByInputToken(
      whirlpool,
      inputTokenMint,
      inputAmountBN,
      Percentage.fromDecimal(new Decimal(slippagePct)),
      ORCA_WHIRLPOOL_PROGRAM_ID,
      client.getFetcher(),
      IGNORE_CACHE,
    );
  }

  logger.info(
    `Swap quote: ${Number(quote.estimatedAmountIn) / Math.pow(10, inputDecimals)} ${inputTokenInfo.symbol} -> ${Number(quote.estimatedAmountOut) / Math.pow(10, outputDecimals)} ${outputTokenInfo.symbol}`,
  );

  // Build transaction
  const builder = new TransactionBuilder(client.getContext().connection, client.getContext().wallet);

  // Get token accounts
  const tokenOwnerAccountA = getAssociatedTokenAddressSync(
    whirlpool.getTokenAInfo().address,
    client.getContext().wallet.publicKey,
    undefined,
    mintA.tokenProgram,
  );
  const tokenOwnerAccountB = getAssociatedTokenAddressSync(
    whirlpool.getTokenBInfo().address,
    client.getContext().wallet.publicKey,
    undefined,
    mintB.tokenProgram,
  );

  // Handle WSOL wrapping for input token
  // If selling WSOL: check existing balance and only wrap the deficit
  // If buying with WSOL: wrap the needed amount with buffer
  if (aToB) {
    // Swapping A -> B (input is tokenA)
    await handleWsolAta(
      builder,
      client,
      whirlpool.getTokenAInfo().address,
      tokenOwnerAccountA,
      mintA.tokenProgram,
      'wrap',
      quote.estimatedAmountIn, // handleWsolAta will check existing balance and only wrap deficit
      solana,
    );
    // Create ATA for output token if needed
    await handleWsolAta(
      builder,
      client,
      whirlpool.getTokenBInfo().address,
      tokenOwnerAccountB,
      mintB.tokenProgram,
      'receive',
    );
  } else {
    // Swapping B -> A (input is tokenB)
    // Create ATA for output token if needed
    await handleWsolAta(
      builder,
      client,
      whirlpool.getTokenAInfo().address,
      tokenOwnerAccountA,
      mintA.tokenProgram,
      'receive',
    );
    await handleWsolAta(
      builder,
      client,
      whirlpool.getTokenBInfo().address,
      tokenOwnerAccountB,
      mintB.tokenProgram,
      'wrap',
      quote.estimatedAmountIn, // handleWsolAta will check existing balance and only wrap deficit
      solana,
    );
  }

  // Get oracle PDA
  const oraclePda = PDAUtil.getOracle(ORCA_WHIRLPOOL_PROGRAM_ID, whirlpoolPubkey);

  // Add swap instruction
  builder.addInstruction(
    WhirlpoolIx.swapIx(client.getContext().program, {
      ...quote,
      whirlpool: whirlpoolPubkey,
      tokenAuthority: client.getContext().wallet.publicKey,
      tokenOwnerAccountA,
      tokenVaultA: whirlpool.getTokenVaultAInfo().address,
      tokenOwnerAccountB,
      tokenVaultB: whirlpool.getTokenVaultBInfo().address,
      oracle: oraclePda.publicKey,
    }),
  );

  // Auto-unwrap WSOL output token to native SOL
  // Only unwrap the OUTPUT token (not the input which may have just been wrapped)
  logger.info('Auto-unwrapping WSOL output (if any) back to native SOL');
  const swapOutputMint = aToB ? whirlpool.getTokenBInfo().address : whirlpool.getTokenAInfo().address;
  const swapOutputAccount = aToB ? tokenOwnerAccountB : tokenOwnerAccountA;
  const swapOutputProgram = aToB ? mintB.tokenProgram : mintA.tokenProgram;

  await handleWsolAta(
    builder,
    client,
    swapOutputMint,
    swapOutputAccount,
    swapOutputProgram,
    'unwrap',
    undefined,
    solana,
  );

  // Build, simulate, and send transaction
  const txPayload = await builder.build();
  await solana.simulateWithErrorHandling(txPayload.transaction);
  const { signature, fee } = await solana.sendAndConfirmTransaction(txPayload.transaction, [wallet]);

  // Calculate balance changes based on side
  const amountIn = Number(quote.estimatedAmountIn) / Math.pow(10, inputDecimals);
  const amountOut = Number(quote.estimatedAmountOut) / Math.pow(10, outputDecimals);

  const baseTokenBalanceChange = isBuyingSide ? amountOut : -amountIn;
  const quoteTokenBalanceChange = isBuyingSide ? -amountIn : amountOut;

  logger.info(
    `Swap executed: ${amountIn} ${inputTokenInfo.symbol} -> ${amountOut} ${outputTokenInfo.symbol}, fee: ${fee}`,
  );

  return {
    signature,
    status: 1, // CONFIRMED
    data: {
      tokenIn: inputTokenInfo.address,
      tokenOut: outputTokenInfo.address,
      amountIn,
      amountOut,
      fee,
      baseTokenBalanceChange,
      quoteTokenBalanceChange,
    },
  };
}

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: OrcaClmmExecuteSwapRequestType;
    Reply: ExecuteSwapResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a token swap on Orca CLMM',
        tags: ['/connector/orca'],
        body: OrcaClmmExecuteSwapRequest,
        response: { 200: ExecuteSwapResponse },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, baseToken, quoteToken, amount, side, poolAddress, slippagePct } = request.body;

        // Use defaults if not provided
        const networkUsed = network || getSolanaChainConfig().defaultNetwork;
        const walletAddressUsed = walletAddress || getSolanaChainConfig().defaultWallet;

        let poolAddressUsed = poolAddress;

        // If poolAddress is not provided, look it up by token pair
        if (!poolAddressUsed) {
          const solana = await Solana.getInstance(networkUsed);

          // Resolve token symbols to get proper symbols for pool lookup
          const baseTokenInfo = await solana.getToken(baseToken);
          const quoteTokenInfo = await solana.getToken(quoteToken);

          if (!baseTokenInfo || !quoteTokenInfo) {
            throw httpErrors.badRequest(`Token not found: ${!baseTokenInfo ? baseToken : quoteToken}`);
          }

          // Use PoolService to find pool by token pair
          const { PoolService } = await import('../../../services/pool-service');
          const poolService = PoolService.getInstance();

          const pool = await poolService.getPool(
            'orca',
            networkUsed,
            'clmm',
            baseTokenInfo.symbol,
            quoteTokenInfo.symbol,
          );

          if (!pool) {
            throw httpErrors.notFound(
              `No CLMM pool found for ${baseTokenInfo.symbol}-${quoteTokenInfo.symbol} on Orca`,
            );
          }

          poolAddressUsed = pool.address;
        }
        logger.info(`Received swap request: ${amount} ${baseToken} -> ${quoteToken} in pool ${poolAddressUsed}`);

        return await executeSwap(
          networkUsed,
          walletAddressUsed,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          poolAddressUsed,
          slippagePct,
        );
      } catch (e: any) {
        logger.error('Error executing swap:', e.message || e);
        logger.error('Full error:', JSON.stringify(e, null, 2));

        if (e.statusCode) {
          // If it's already an HTTP error, throw it properly
          throw e;
        }

        // Check for specific error messages
        const errorMessage = e.message || e.toString();
        if (errorMessage.includes('503') || errorMessage.includes('Service Unavailable')) {
          throw httpErrors.serviceUnavailable('RPC service temporarily unavailable. Please try again.');
        }

        throw httpErrors.internalServerError(`Swap execution failed: ${errorMessage}`);
      }
    },
  );
};

export default executeSwapRoute;
