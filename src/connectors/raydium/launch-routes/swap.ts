/**
 * Trading a LaunchLab curve: quote, execute a quote, and the two in one. Both
 * sides are exact-in, as on every launch curve: BUY spends `amount` of the
 * quote, SELL sells `amount` of the token. A pool that has finished its curve
 * trades on the CPMM pool it graduated to, through this connector's amm surface.
 */
import {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';

import { Solana } from '../../../chains/solana/solana';
import { RouterQuoteSwapResponseType } from '../../../schemas/chain-schema';
import { SwapExecuteResponseType } from '../../../schemas/router-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import {
  LAUNCHLAB_DECIMALS,
  LaunchlabPoolState,
  buyInstruction,
  poolAddressFor,
  poolTradeAccounts,
  quoteBuyExactIn,
  quoteSellExactIn,
  readGlobal,
  readPlatform,
  readPool,
  sellInstruction,
  spotPrice,
} from '../launchlab/launchlab';
import { RaydiumConfig } from '../raydium.config';

/** LaunchLab's `status`: 0 while the curve trades; after it, migrating and migrated. */
const STATUS_TRADING = 0;

interface LaunchlabCachedQuote {
  network: string;
  pool: string;
  side: 'BUY' | 'SELL';
  slippagePct: number;
  tokenIn: { address: string; symbol: string };
  tokenOut: { address: string; symbol: string };
  amountInRaw: string;
  minAmountOutRaw: string;
}

/** A token by address, or by a symbol Gateway's token list knows. */
async function resolveToken(solana: Solana, token: string): Promise<{ address: PublicKey; symbol: string }> {
  const info = await solana.getToken(token);
  if (info) return { address: new PublicKey(info.address), symbol: info.symbol };
  try {
    return { address: new PublicKey(token), symbol: token };
  } catch {
    throw httpErrors.notFound(sanitizeErrorMessage('Token not found: {}', token));
  }
}

/** The pool for a token and quote, trading. */
export async function tradingPool(
  solana: Solana,
  base: PublicKey,
  quote: PublicKey,
): Promise<{ address: PublicKey; state: LaunchlabPoolState }> {
  const address = poolAddressFor(base, quote);
  const state = await readPool(solana.connection, address);
  if (state.status !== STATUS_TRADING) {
    throw httpErrors.badRequest(
      `The LaunchLab curve for ${base.toBase58()} has finished and migrates to Raydium CPMM; ` +
        'trade it through the raydium amm connector (/trading/amm with connector=raydium).',
    );
  }
  return { address, state };
}

const uiAmount = (raw: BN, decimals: number) => new Decimal(raw.toString()).div(Decimal.pow(10, decimals)).toNumber();

export async function quoteSwap(
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = RaydiumConfig.config.slippagePct,
): Promise<RouterQuoteSwapResponseType> {
  if (!(amount > 0)) throw httpErrors.badRequest('amount must be greater than 0');
  const solana = await Solana.getInstance(network);
  const base = await resolveToken(solana, baseToken);
  const quote = await resolveToken(solana, quoteToken);
  const { address, state } = await tradingPool(solana, base.address, quote.address);
  const [global, platform] = await Promise.all([
    readGlobal(solana.connection, state.configId),
    readPlatform(solana.connection, state.platformId),
  ]);
  const quoteDecimals = state.mintDecimalsB;
  const buying = side === 'BUY';
  const amountIn = new BN(
    new Decimal(amount).mul(Decimal.pow(10, buying ? quoteDecimals : LAUNCHLAB_DECIMALS)).toFixed(0),
  );

  let amountOut: BN;
  let spent = amountIn;
  let fee: BN;
  if (buying) {
    const q = quoteBuyExactIn(state, global, platform, amountIn);
    // Past what the curve still sells, the buy fills to its end for less.
    ({ amountOut, amountIn: spent, fee } = q);
  } else {
    ({ amountOut, fee } = quoteSellExactIn(state, global, platform, amountIn));
  }
  if (amountOut.isZero()) {
    throw httpErrors.badRequest(`A ${side} of ${amount} gets nothing from this curve`);
  }
  const minAmountOut = amountOut.muln(10_000 - Math.round(slippagePct * 100)).divn(10_000);
  const [inDecimals, outDecimals] = buying ? [quoteDecimals, LAUNCHLAB_DECIMALS] : [LAUNCHLAB_DECIMALS, quoteDecimals];
  const spentUi = uiAmount(spent, inDecimals);
  const outUi = uiAmount(amountOut, outDecimals);
  // Fee-free execution against the spot price: fees are in quote, the input on
  // a buy and the output on a sell.
  const spot = spotPrice(state, quoteDecimals).toNumber();
  const feeUi = uiAmount(fee, quoteDecimals);
  const execution = buying ? (spentUi - feeUi) / outUi : (outUi + feeUi) / spentUi;

  const tokenIn = buying ? quote : base;
  const tokenOut = buying ? base : quote;
  const quoteId = uuidv4();
  const cached: LaunchlabCachedQuote = {
    network,
    pool: address.toBase58(),
    side,
    slippagePct,
    tokenIn: { address: tokenIn.address.toBase58(), symbol: tokenIn.symbol },
    tokenOut: { address: tokenOut.address.toBase58(), symbol: tokenOut.symbol },
    amountInRaw: spent.toString(),
    minAmountOutRaw: minAmountOut.toString(),
  };
  quoteCache.set(quoteId, 'raydium-launchlab', cached);
  return {
    quoteId,
    tokenIn: cached.tokenIn.address,
    tokenOut: cached.tokenOut.address,
    amountIn: spentUi,
    amountOut: outUi,
    price: buying ? spentUi / outUi : outUi / spentUi,
    priceImpactPct: Math.abs((execution - spot) / spot) * 100,
    minAmountOut: uiAmount(minAmountOut, outDecimals),
    maxAmountIn: amount,
    slippagePct,
    poolAddress: cached.pool,
  };
}

/**
 * The instructions for a cached quote, as `owner`: its account for what it
 * receives, SOL wrapped for a buy with it (and unwrapped after, when the wSOL
 * account is this transaction's), the trade at exactly the quoted amounts.
 */
async function quoteInstructions(solana: Solana, owner: PublicKey, cached: LaunchlabCachedQuote) {
  const pool = new PublicKey(cached.pool);
  const state = await readPool(solana.connection, pool);
  if (state.status !== STATUS_TRADING) {
    throw httpErrors.badRequest('The LaunchLab curve finished after this quote was priced; trade it on Raydium CPMM.');
  }
  const accounts = poolTradeAccounts(pool, state, owner);
  const amountIn = new BN(cached.amountInRaw);
  const minOut = new BN(cached.minAmountOutRaw);
  const buying = cached.side === 'BUY';
  const instructions: TransactionInstruction[] = [];
  const [outAccount, outMint, outProgram] = buying
    ? [accounts.userBase, accounts.baseMint, accounts.baseProgram]
    : [accounts.userQuote, accounts.quoteMint, accounts.quoteProgram];
  instructions.push(createAssociatedTokenAccountIdempotentInstruction(owner, outAccount, owner, outMint, outProgram));
  const solQuote = accounts.quoteMint.equals(NATIVE_MINT);
  const wsol = getAssociatedTokenAddressSync(NATIVE_MINT, owner, true, TOKEN_PROGRAM_ID);
  const wsolIsNew = solQuote && !(await solana.connection.getAccountInfo(wsol));
  if (solQuote && buying) {
    instructions.push(...(await solana.wrapSOL(owner, amountIn.toNumber(), TOKEN_PROGRAM_ID, true)));
  }
  instructions.push(buying ? buyInstruction(accounts, amountIn, minOut) : sellInstruction(accounts, amountIn, minOut));
  if (wsolIsNew) instructions.push(solana.unwrapSOL(owner, TOKEN_PROGRAM_ID));
  return instructions;
}

export async function executeQuote(
  walletAddress: string,
  network: string,
  quoteId: string,
): Promise<SwapExecuteResponseType> {
  const cached = quoteCache.get(quoteId, 'raydium-launchlab') as LaunchlabCachedQuote | null;
  if (!cached) throw httpErrors.badRequest('Quote not found or expired');
  if (network !== cached.network) {
    throw httpErrors.badRequest(`Quote ${quoteId} was priced on ${cached.network}, not ${network}`);
  }
  const solana = await Solana.getInstance(network);
  const walletPk = new PublicKey(walletAddress);
  const transaction = new Transaction().add(...(await quoteInstructions(solana, walletPk, cached)));
  transaction.feePayer = walletPk;
  logger.info(
    `Executing raydium LaunchLab quote ${quoteId}: ${cached.side} on ${cached.pool} for ` +
      `${cached.tokenIn.symbol} -> ${cached.tokenOut.symbol}`,
  );
  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
  const txData = await solana.getConfirmedTransactionData(signature);
  const result = await solana.handleConfirmation(
    signature,
    txData,
    cached.tokenIn.address,
    cached.tokenOut.address,
    walletAddress,
    undefined,
    cached.slippagePct,
  );
  if (result.status === 1) quoteCache.delete(quoteId);
  return result as SwapExecuteResponseType;
}

export async function executeSwap(
  walletAddress: string,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = RaydiumConfig.config.slippagePct,
): Promise<SwapExecuteResponseType> {
  const quote = await quoteSwap(network, baseToken, quoteToken, amount, side, slippagePct);
  return await executeQuote(walletAddress, network, quote.quoteId);
}
