import { swapInstructions, setWhirlpoolsConfig, setNativeMintWrappingStrategy } from '@orca-so/whirlpools';
import { fetchWhirlpool } from '@orca-so/whirlpools-client';
import { address, createNoopSigner, type Instruction } from '@solana/kit';
import { PublicKey, Transaction } from '@solana/web3.js';
import { fetchAllMint } from '@solana-program/token-2022';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { getSolanaChainConfig } from '../../../chains/solana/solana.config';
import { ExecuteSwapResponseType, ExecuteSwapResponse } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { kitInstructionToWeb3 } from '../../../wallet/swig';
import { Orca } from '../orca';
import { OrcaClmmExecuteSwapRequest, OrcaClmmExecuteSwapRequestType } from '../schemas';

const COMPUTE_BUDGET_PROGRAM_ID = address('ComputeBudget111111111111111111111111111111');

export async function executeSwap(
  network: string,
  walletAddress: string,
  baseTokenIdentifier: string,
  quoteTokenIdentifier: string,
  amount: number,
  side: 'BUY' | 'SELL',
  poolAddress: string,
  slippagePct: number = 1,
): Promise<ExecuteSwapResponseType> {
  const solana = await Solana.getInstance(network);
  const orca = await Orca.getInstance(network);
  const rpc = orca.solanaKitRpc;

  // Resolve token metadata
  const baseTokenInfo = await solana.getToken(baseTokenIdentifier);
  const quoteTokenInfo = await solana.getToken(quoteTokenIdentifier);
  if (!baseTokenInfo || !quoteTokenInfo) {
    throw httpErrors.badRequest(`Token not found: ${!baseTokenInfo ? baseTokenIdentifier : quoteTokenIdentifier}`);
  }

  await setWhirlpoolsConfig(network === 'mainnet-beta' ? 'solanaMainnet' : 'solanaDevnet');
  // Wrap native SOL via the wallet's deterministic ATA rather than an ephemeral keypair:
  // this avoids an extra co-signer (so hardware/Swig can sign alone) and lets a wallet
  // policy allowlist the wSOL account. Must be set before swapInstructions().
  setNativeMintWrappingStrategy('ata');

  // Fetch pool to determine canonical token A/B ordering and decimals
  const whirlpoolAddress = address(poolAddress);
  const whirlpool = await fetchWhirlpool(rpc, whirlpoolAddress);
  if (!whirlpool.data) {
    throw httpErrors.notFound(`Whirlpool not found: ${poolAddress}`);
  }
  const tokenAMint = whirlpool.data.tokenMintA.toString();
  const [mintA, mintB] = await fetchAllMint(rpc, [whirlpool.data.tokenMintA, whirlpool.data.tokenMintB]);

  // side = BUY  -> buy `amount` of base token  (input = quote, exact output)
  // side = SELL -> sell `amount` of base token (input = base,  exact input)
  const isBuyingSide = side === 'BUY';
  const inputTokenInfo = isBuyingSide ? quoteTokenInfo : baseTokenInfo;
  const outputTokenInfo = isBuyingSide ? baseTokenInfo : quoteTokenInfo;
  const inputIsA = inputTokenInfo.address === tokenAMint;
  const inputDecimals = inputIsA ? mintA.data.decimals : mintB.data.decimals;
  const outputDecimals = inputIsA ? mintB.data.decimals : mintA.data.decimals;

  const slippageBps = Math.round(slippagePct * 100);

  // Build the swap with a no-op fee-payer signer carrying just the wallet's public key —
  // signing is external (sendAndConfirmTransactionForWallet handles local/hardware/Swig).
  const signer = createNoopSigner(address(walletAddress));

  // Build the swap instructions via the v4 SDK — it resolves tick arrays, the
  // oracle (adaptive-fee pools), Token-2022 transfer fees and native-SOL
  // wrapping internally.
  const swapParams = isBuyingSide
    ? {
        outputAmount: BigInt(Math.floor(amount * Math.pow(10, outputDecimals))),
        mint: address(outputTokenInfo.address),
      }
    : { inputAmount: BigInt(Math.floor(amount * Math.pow(10, inputDecimals))), mint: address(inputTokenInfo.address) };

  const { instructions: swapInstrs, quote } = await swapInstructions(
    rpc as any,
    swapParams as any,
    whirlpoolAddress,
    slippageBps,
    signer,
  );

  const estimatedAmountIn = isBuyingSide ? (quote as any).tokenEstIn : (quote as any).tokenIn;
  const estimatedAmountOut = isBuyingSide ? (quote as any).tokenOut : (quote as any).tokenEstOut;
  const amountIn = Number(estimatedAmountIn) / Math.pow(10, inputDecimals);
  const amountOut = Number(estimatedAmountOut) / Math.pow(10, outputDecimals);

  logger.info(
    `Orca swap: ${amountIn} ${inputTokenInfo.symbol} -> ${amountOut} ${outputTokenInfo.symbol} ` +
      `(pool ${poolAddress}, ${side})`,
  );

  // Convert the kit instructions to web3.js and sign/send via the wallet-type-aware
  // chokepoint. Compute-budget instructions are dropped here; the chokepoint re-adds them
  // (and, for Swig, wraps the rest in the Swig `sign` instruction before the delegate signs).
  const innerInstructions = (swapInstrs as Instruction[])
    .filter((ix) => ix.programAddress !== COMPUTE_BUDGET_PROGRAM_ID)
    .map(kitInstructionToWeb3);
  const tx = new Transaction();
  tx.add(...innerInstructions);
  // This route hand-builds a legacy transaction; set the fee payer to the wallet so the
  // chokepoint's pre-flight simulate can compile the message (the chokepoint signs/pays
  // from this same address for every wallet type).
  tx.feePayer = new PublicKey(walletAddress);

  const { signature, fee } = await solana.sendAndConfirmTransactionForWallet(tx, walletAddress);
  logger.info(`Orca swap executed: ${signature} (fee ${fee} SOL)`);

  const baseTokenBalanceChange = isBuyingSide ? amountOut : -amountIn;
  const quoteTokenBalanceChange = isBuyingSide ? -amountIn : amountOut;

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
