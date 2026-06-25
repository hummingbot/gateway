import { swapInstructions, setWhirlpoolsConfig } from '@orca-so/whirlpools';
import { fetchWhirlpool } from '@orca-so/whirlpools-client';
import {
  address,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Instruction,
} from '@solana/kit';
import { fetchAllMint } from '@solana-program/token-2022';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { getSolanaChainConfig } from '../../../chains/solana/solana.config';
import { ExecuteSwapResponseType, ExecuteSwapResponse } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { OrcaClmmExecuteSwapRequest, OrcaClmmExecuteSwapRequestType } from '../schemas';

const COMPUTE_BUDGET_PROGRAM_ID = address('ComputeBudget111111111111111111111111111111');
const COMPUTE_UNIT_LIMIT = 600_000;

function setComputeUnitLimitIx(units: number): Instruction {
  const data = new Uint8Array(5);
  data[0] = 2;
  new DataView(data.buffer).setUint32(1, units, true);
  return { accounts: [], programAddress: COMPUTE_BUDGET_PROGRAM_ID, data };
}

function setComputeUnitPriceIx(microLamportsPerCU: bigint): Instruction {
  const data = new Uint8Array(9);
  data[0] = 3;
  new DataView(data.buffer).setBigUint64(1, microLamportsPerCU, true);
  return { accounts: [], programAddress: COMPUTE_BUDGET_PROGRAM_ID, data };
}

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
  const signer = await createKeyPairSignerFromBytes((await solana.getWallet(walletAddress)).secretKey);

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

  // Prepend compute-budget instructions; drop any the SDK may have included.
  const priorityFeePerCU = await solana.estimateGasPrice();
  const microLamportsPerCU = BigInt(Math.max(1, Math.ceil(priorityFeePerCU * 1_000_000)));
  const allInstructions: Instruction[] = [
    setComputeUnitLimitIx(COMPUTE_UNIT_LIMIT),
    setComputeUnitPriceIx(microLamportsPerCU),
    ...(swapInstrs as Instruction[]).filter((ix) => ix.programAddress !== COMPUTE_BUDGET_PROGRAM_ID),
  ];

  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const txMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (msg) => setTransactionMessageFeePayerSigner(signer, msg),
    (msg) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, msg),
    (msg) => appendTransactionMessageInstructions(allInstructions, msg),
  );

  const signedTx = await signTransactionMessageWithSigners(txMessage);
  const wireBytes = Buffer.from(getBase64EncodedWireTransaction(signedTx), 'base64');

  const signature = await solana.connection.sendRawTransaction(wireBytes, {
    skipPreflight: false,
    preflightCommitment: 'processed',
  });

  await solana.connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: Number(latestBlockhash.lastValidBlockHeight),
    },
    'confirmed',
  );

  // Network fee from the confirmed transaction. getTransaction can briefly lag
  // behind confirmation, so retry a few times before giving up.
  let feeLamports = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    const confirmedTx = await solana.connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    if (confirmedTx?.meta?.fee != null) {
      feeLamports = confirmedTx.meta.fee;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  const fee = feeLamports / 1e9;

  const baseTokenBalanceChange = isBuyingSide ? amountOut : -amountIn;
  const quoteTokenBalanceChange = isBuyingSide ? -amountIn : amountOut;

  logger.info(`Orca swap executed: ${signature} (fee ${fee} SOL)`);

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
