import {
  ApiCpmmConfigInfo,
  CREATE_CPMM_POOL_PROGRAM,
  CREATE_CPMM_POOL_FEE_ACC,
  DEV_CREATE_CPMM_POOL_PROGRAM,
  DEV_CREATE_CPMM_POOL_FEE_ACC,
} from '@raydium-io/raydium-sdk-v2';
import { Static } from '@sinclair/typebox';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getMint } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { CreatePoolResponse, CreatePoolResponseType } from '../../../schemas/amm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Raydium } from '../raydium';
import { RaydiumAmmCreatePoolRequest } from '../schemas';

/** Resolves a token symbol or mint address to a PublicKey. */
async function resolveMint(solana: Solana, tokenOrAddress: string): Promise<PublicKey> {
  const tokenInfo = await solana.getToken(tokenOrAddress);
  if (tokenInfo) return new PublicKey(tokenInfo.address);
  try {
    return new PublicKey(tokenOrAddress);
  } catch {
    throw httpErrors.badRequest(sanitizeErrorMessage('Token not found: {}', tokenOrAddress));
  }
}

/** Detects whether a mint is owned by the Token or Token-2022 program. */
async function getMintProgram(solana: Solana, mint: PublicKey): Promise<PublicKey> {
  const info = await solana.connection.getAccountInfo(mint);
  if (!info) throw httpErrors.badRequest(`Mint account not found: ${mint.toBase58()}`);
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  if (info.owner.equals(TOKEN_PROGRAM_ID)) return TOKEN_PROGRAM_ID;
  throw httpErrors.badRequest(`Mint ${mint.toBase58()} is not an SPL token mint`);
}

/**
 * Fetches the current market price (quote per base) from the unified swap router so a new pool
 * can be seeded on-market instead of at an arbitrary ratio. Seeding off-market invites arbitrage
 * bots to instantly rebalance the pool. Uses a SELL quote of the base token via the network's
 * configured swap provider (Jupiter aggregates existing venues); throws a clear error if no
 * market route exists.
 */
async function fetchMarketPrice(
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
): Promise<number> {
  const { getUnifiedQuoteSwap } = await import('../../../trading/swap/quote');
  let quote: any;
  try {
    quote = await getUnifiedQuoteSwap(`solana-${network}`, baseToken, quoteToken, amount, 'SELL');
  } catch (e: any) {
    throw httpErrors.badRequest(
      `Could not fetch a market price for ${baseToken}/${quoteToken} to seed the pool (${e.message}). ` +
        'Pass initialPrice or quoteTokenAmount explicitly.',
    );
  }
  if (!quote || !quote.amountIn || !quote.amountOut) {
    throw httpErrors.badRequest(
      `No market route found for ${baseToken}/${quoteToken}. Pass initialPrice or quoteTokenAmount explicitly.`,
    );
  }
  return quote.amountOut / quote.amountIn; // quote token per base token
}

export async function createPool(
  network: string,
  walletAddress: string,
  baseToken: string,
  quoteToken: string,
  baseTokenAmount: number,
  quoteTokenAmount?: number,
  initialPrice?: number,
  feeConfigIndex: number = 0,
  openTime: number = 0,
): Promise<CreatePoolResponseType> {
  const solana = await Solana.getInstance(network);
  const raydium = await Raydium.getInstance(network);

  // Set the SDK owner to the wallet's public key so getOrCreateTokenAccount targets the right
  // owner. The tx is built unsigned; signing/sending is delegated to sendAndConfirmTransactionForWallet.
  await raydium.setOwner(new PublicKey(walletAddress));

  const baseMint = await resolveMint(solana, baseToken);
  const quoteMint = await resolveMint(solana, quoteToken);
  if (baseMint.equals(quoteMint)) {
    throw httpErrors.badRequest('baseToken and quoteToken must be different');
  }

  if (baseTokenAmount <= 0) {
    throw httpErrors.badRequest('baseTokenAmount must be greater than zero');
  }

  const [baseProgram, quoteProgram] = await Promise.all([
    getMintProgram(solana, baseMint),
    getMintProgram(solana, quoteMint),
  ]);
  const [baseMintInfo, quoteMintInfo] = await Promise.all([
    getMint(solana.connection, baseMint, undefined, baseProgram),
    getMint(solana.connection, quoteMint, undefined, quoteProgram),
  ]);
  const baseDecimals = baseMintInfo.decimals;
  const quoteDecimals = quoteMintInfo.decimals;

  // Resolve the seed price (quote per base). Priority:
  //   1) explicit initialPrice
  //   2) explicit quoteTokenAmount (the base:quote ratio sets the price)
  //   3) live market price from the unified swap router — so the pool opens on-market.
  let seedPrice: number;
  let seedSource: string;
  if (initialPrice !== undefined) {
    if (initialPrice <= 0) throw httpErrors.badRequest('initialPrice must be greater than zero');
    seedPrice = initialPrice;
    seedSource = 'initialPrice';
  } else if (quoteTokenAmount !== undefined) {
    if (quoteTokenAmount <= 0) throw httpErrors.badRequest('quoteTokenAmount must be greater than zero');
    seedPrice = quoteTokenAmount / baseTokenAmount;
    seedSource = 'quoteTokenAmount ratio';
  } else {
    seedPrice = await fetchMarketPrice(network, baseToken, quoteToken, baseTokenAmount);
    seedSource = 'market (unified swap router)';
  }

  const effectiveQuoteAmount = baseTokenAmount * seedPrice;
  logger.info(
    `Seeding Raydium CPMM pool at ${seedPrice} ${quoteToken}/${baseToken} [${seedSource}]: ` +
      `${baseTokenAmount} base + ${effectiveQuoteAmount} quote`,
  );

  const baseAmount = new BN(new Decimal(baseTokenAmount).mul(new Decimal(10).pow(baseDecimals)).toFixed(0));
  const quoteAmount = new BN(new Decimal(effectiveQuoteAmount).mul(new Decimal(10).pow(quoteDecimals)).toFixed(0));
  if (baseAmount.isZero() || quoteAmount.isZero()) {
    throw httpErrors.badRequest('Computed token amounts are zero — increase baseTokenAmount');
  }

  // Fetch the CPMM fee-config list dynamically from the Raydium API — no hardcoded fallback.
  let feeConfigs: ApiCpmmConfigInfo[];
  try {
    feeConfigs = await raydium.raydiumSDK.api.getCpmmConfigs();
  } catch (e: any) {
    throw httpErrors.internalServerError(`Could not fetch Raydium CPMM fee configs: ${e.message}`);
  }
  if (!feeConfigs || feeConfigs.length === 0) {
    throw httpErrors.internalServerError('Raydium API returned no CPMM fee configs');
  }
  if (feeConfigIndex < 0 || feeConfigIndex >= feeConfigs.length) {
    throw httpErrors.badRequest(`feeConfigIndex ${feeConfigIndex} out of range (0-${feeConfigs.length - 1})`);
  }
  const feeConfig = feeConfigs[feeConfigIndex];

  // Select the CPMM program + create-pool fee account for the connector's cluster, mirroring how
  // raydium.ts derives mainnet vs devnet from solana.network.
  const isMainnet = solana.network === 'mainnet-beta';
  const programId = isMainnet ? CREATE_CPMM_POOL_PROGRAM : DEV_CREATE_CPMM_POOL_PROGRAM;
  const poolFeeAccount = isMainnet ? CREATE_CPMM_POOL_FEE_ACC : DEV_CREATE_CPMM_POOL_FEE_ACC;

  // NOTE on mint ordering: the CPMM program requires the pool's token0 < token1 (byte-compared
  // mint pubkeys). raydium.cpmm.createPool sorts (mintA, mintB) internally and swaps
  // (mintAAmount, mintBAmount) in lockstep, so passing base as mintA / quote as mintB — with their
  // respective amounts — deposits the correct ratio regardless of on-chain ordering. The reported
  // `price` (seedPrice) stays quote-per-base and balance changes are read per-mint, so both are
  // independent of the SDK's internal sort.
  const { transaction, extInfo } = await raydium.raydiumSDK.cpmm.createPool({
    programId,
    poolFeeAccount,
    mintA: { address: baseMint.toBase58(), decimals: baseDecimals, programId: baseProgram.toBase58() },
    mintB: { address: quoteMint.toBase58(), decimals: quoteDecimals, programId: quoteProgram.toBase58() },
    mintAAmount: baseAmount,
    mintBAmount: quoteAmount,
    startTime: new BN(openTime),
    feeConfig,
    associatedOnly: false,
    ownerInfo: { feePayer: new PublicKey(walletAddress), useSOLBalance: true },
    txVersion: raydium.txVersion,
  });

  const poolAddress = extInfo.address.poolId.toBase58();
  logger.info(`Creating Raydium CPMM pool ${poolAddress} (${baseToken}/${quoteToken})`);

  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
  // Retrying re-fetch; throws the shared landed-but-failed error if the transaction
  // landed with an error, so txData existing below really means "confirmed".
  const txData = await solana.getConfirmedTransactionData(signature);

  if (txData) {
    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletAddress, [
      baseMint.toBase58(),
      quoteMint.toBase58(),
    ]);
    return {
      signature,
      status: 1, // CONFIRMED
      poolAddress,
      price: seedPrice,
      data: {
        fee: txData.meta.fee / 1e9,
        baseTokenAmountAdded: Math.abs(balanceChanges[0]),
        quoteTokenAmountAdded: Math.abs(balanceChanges[1]),
      },
    };
  }
  return { signature, status: 0, poolAddress, price: seedPrice }; // PENDING
}

export const createPoolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof RaydiumAmmCreatePoolRequest>;
    Reply: CreatePoolResponseType;
  }>(
    '/create-pool',
    {
      schema: {
        description: 'Create a new Raydium CPMM (CP-Swap) pool and seed it with initial liquidity',
        tags: ['/connector/raydium'],
        body: RaydiumAmmCreatePoolRequest,
        response: {
          200: CreatePoolResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          network,
          walletAddress,
          baseToken,
          quoteToken,
          baseTokenAmount,
          quoteTokenAmount,
          initialPrice,
          feeConfigIndex,
          openTime,
        } = request.body;
        return await createPool(
          network,
          walletAddress,
          baseToken,
          quoteToken,
          baseTokenAmount,
          quoteTokenAmount,
          initialPrice,
          feeConfigIndex,
          openTime,
        );
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Failed to create pool');
      }
    },
  );
};

export default createPoolRoute;
