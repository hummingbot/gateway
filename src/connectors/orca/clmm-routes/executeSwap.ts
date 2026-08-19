import { swapInstructions } from '@orca-so/whirlpools';
import { fetchWhirlpool } from '@orca-so/whirlpools-client';
import { address } from '@solana/kit';
import { fetchAllMint } from '@solana-program/token-2022';

import { Solana } from '../../../chains/solana/solana';
import { ExecuteSwapResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { OrcaConfig } from '../orca.config';
import { buildOrcaTransaction, createOrcaAuthority } from '../orca.sdk';

import { resolveCounterToken } from './quoteSwap';

const COMPUTE_BUDGET_PROGRAM_ID = address('ComputeBudget111111111111111111111111111111');

export async function executeSwap(
  network: string,
  walletAddress: string,
  poolAddress: string,
  baseTokenIdentifier: string,
  side: 'BUY' | 'SELL',
  amount: number,
  slippagePct: number = OrcaConfig.config.slippagePct ?? 1,
): Promise<ExecuteSwapResponseType> {
  const solana = await Solana.getInstance(network);
  const orca = await Orca.getInstance(network);
  const rpc = orca.solanaKitRpc;

  // Standardized: quote token is derived from the pool given poolAddress + baseToken.
  const quoteTokenIdentifier = await resolveCounterToken(network, poolAddress, baseTokenIdentifier);

  // Resolve token metadata
  const baseTokenInfo = await solana.getToken(baseTokenIdentifier);
  const quoteTokenInfo = await solana.getToken(quoteTokenIdentifier);
  if (!baseTokenInfo || !quoteTokenInfo) {
    throw httpErrors.badRequest(`Token not found: ${!baseTokenInfo ? baseTokenIdentifier : quoteTokenIdentifier}`);
  }

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

  // Build the swap instructions via Orca v8 — it resolves tick arrays, the
  // oracle (adaptive-fee pools), Token-2022 transfer fees and native-SOL
  // wrapping internally.
  const swapConfig = {
    signer: createOrcaAuthority(walletAddress),
    slippageToleranceBps: slippageBps,
    whirlpoolDeployment: orca.deployment,
  };
  const swapResult = isBuyingSide
    ? await swapInstructions(
        rpc,
        {
          outputAmount: BigInt(Math.floor(amount * Math.pow(10, outputDecimals))),
          mint: address(outputTokenInfo.address),
        },
        whirlpoolAddress,
        swapConfig,
      )
    : await swapInstructions(
        rpc,
        {
          inputAmount: BigInt(Math.floor(amount * Math.pow(10, inputDecimals))),
          mint: address(inputTokenInfo.address),
        },
        whirlpoolAddress,
        swapConfig,
      );

  const estimatedAmountIn = 'tokenMaxIn' in swapResult.quote ? swapResult.quote.tokenEstIn : swapResult.quote.tokenIn;
  const estimatedAmountOut =
    'tokenMaxIn' in swapResult.quote ? swapResult.quote.tokenOut : swapResult.quote.tokenEstOut;
  const amountIn = Number(estimatedAmountIn) / Math.pow(10, inputDecimals);
  const amountOut = Number(estimatedAmountOut) / Math.pow(10, outputDecimals);

  logger.info(
    `Orca swap: ${amountIn} ${inputTokenInfo.symbol} -> ${amountOut} ${outputTokenInfo.symbol} ` +
      `(pool ${poolAddress}, ${side})`,
  );

  const transaction = buildOrcaTransaction(swapResult.instructions, walletAddress);
  const { signature, fee } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
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
      slippagePct,
    },
  };
}
