import { MIN_SQRT_PRICE, MAX_SQRT_PRICE, derivePoolAddress, getTokenDecimals } from '@meteora-ag/cp-amm-sdk';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { CreatePoolResponse, CreatePoolResponseType } from '../../../schemas/amm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { MeteoraDamm } from '../meteora-damm';
import { MeteoraAmmCreatePoolRequest } from '../schemas';

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

export async function createPool(
  network: string,
  walletAddress: string,
  baseToken: string,
  quoteToken: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  configAddress?: string,
): Promise<CreatePoolResponseType> {
  if (!configAddress) {
    throw httpErrors.badRequest(
      'configAddress is required. DAMM v2 pools are created against a config account that defines the ' +
        'fee tier and parameters; many configs are launch configs with very high starting fees, so Gateway ' +
        'does not auto-select one. Choose a config from the Meteora config list and pass its address. ' +
        'See docs/connectors/meteora-damm-v2.md.',
    );
  }

  const solana = await Solana.getInstance(network);
  const meteoraDamm = await MeteoraDamm.getInstance(network);

  const tokenAMint = await resolveMint(solana, baseToken);
  const tokenBMint = await resolveMint(solana, quoteToken);
  if (tokenAMint.equals(tokenBMint)) {
    throw httpErrors.badRequest('baseToken and quoteToken must be different');
  }

  let config: PublicKey;
  try {
    config = new PublicKey(configAddress);
  } catch {
    throw httpErrors.badRequest(`Invalid config address: ${configAddress}`);
  }

  let configState;
  try {
    configState = await meteoraDamm.cpAmm.fetchConfigState(config);
  } catch {
    throw httpErrors.badRequest(`Config not found: ${configAddress}`);
  }

  const pool = derivePoolAddress(config, tokenAMint, tokenBMint);
  if (await meteoraDamm.cpAmm.isPoolExist(pool)) {
    throw httpErrors.badRequest(`Pool already exists for this token pair and config: ${pool.toBase58()}`);
  }

  const [tokenAProgram, tokenBProgram] = await Promise.all([
    getMintProgram(solana, tokenAMint),
    getMintProgram(solana, tokenBMint),
  ]);
  const [tokenADecimal, tokenBDecimal] = await Promise.all([
    getTokenDecimals(solana.connection, tokenAMint, tokenAProgram),
    getTokenDecimals(solana.connection, tokenBMint, tokenBProgram),
  ]);

  const tokenAAmount = new BN(new Decimal(baseTokenAmount).mul(new Decimal(10).pow(tokenADecimal)).toFixed(0));
  const tokenBAmount = new BN(new Decimal(quoteTokenAmount).mul(new Decimal(10).pow(tokenBDecimal)).toFixed(0));
  if (tokenAAmount.isZero() || tokenBAmount.isZero()) {
    throw httpErrors.badRequest('Both baseTokenAmount and quoteTokenAmount must be greater than zero');
  }

  // The deposit ratio sets the initial price; liquidity spans the full price range.
  const { initSqrtPrice, liquidityDelta } = meteoraDamm.cpAmm.preparePoolCreationParams({
    tokenAAmount,
    tokenBAmount,
    minSqrtPrice: MIN_SQRT_PRICE,
    maxSqrtPrice: MAX_SQRT_PRICE,
    collectFeeMode: configState.collectFeeMode,
  });

  const positionNft = Keypair.generate();
  logger.info(
    `Creating Meteora DAMM v2 pool ${pool.toBase58()} (${baseToken}/${quoteToken}) with position NFT ${positionNft.publicKey.toBase58()}`,
  );

  const transaction: Transaction = await meteoraDamm.cpAmm.createPool({
    creator: new PublicKey(walletAddress),
    payer: new PublicKey(walletAddress),
    config,
    positionNft: positionNft.publicKey,
    tokenAMint,
    tokenBMint,
    initSqrtPrice,
    liquidityDelta,
    tokenAAmount,
    tokenBAmount,
    activationPoint: null,
    tokenAProgram,
    tokenBProgram,
  });

  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress, [positionNft]);
  const txData = await solana.connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  if (txData) {
    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletAddress, [
      tokenAMint.toBase58(),
      tokenBMint.toBase58(),
    ]);
    return {
      signature,
      status: 1, // CONFIRMED
      poolAddress: pool.toBase58(),
      data: {
        fee: txData.meta.fee / 1e9,
        baseTokenAmountAdded: Math.abs(balanceChanges[0]),
        quoteTokenAmountAdded: Math.abs(balanceChanges[1]),
      },
    };
  }
  return { signature, status: 0, poolAddress: pool.toBase58() }; // PENDING
}

export const createPoolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: typeof MeteoraAmmCreatePoolRequest.static;
    Reply: CreatePoolResponseType;
  }>(
    '/create-pool',
    {
      schema: {
        description: 'Create a new Meteora DAMM v2 pool and seed it with initial liquidity',
        tags: ['/connector/meteora'],
        body: MeteoraAmmCreatePoolRequest,
        response: {
          200: CreatePoolResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, baseToken, quoteToken, baseTokenAmount, quoteTokenAmount, configAddress } =
          request.body;
        return await createPool(
          network,
          walletAddress,
          baseToken,
          quoteToken,
          baseTokenAmount,
          quoteTokenAmount,
          configAddress,
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
