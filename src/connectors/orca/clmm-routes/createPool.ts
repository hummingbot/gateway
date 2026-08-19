import { createConcentratedLiquidityPoolInstructions, orderMints } from '@orca-so/whirlpools';
import { Static } from '@sinclair/typebox';
import { address, type Instruction } from '@solana/kit';
import { Keypair, PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { CreatePoolResponse, CreatePoolResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Orca } from '../orca';
import { buildOrcaTransaction, createOrcaAuthority, replaceOrcaInstructionAccounts } from '../orca.sdk';
import { OrcaClmmCreatePoolRequest } from '../schemas';

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

/**
 * Fetches the current market price (quote per base) from the unified swap router so a new pool can
 * be initialized on-market instead of at an arbitrary ratio. Off-market initialization invites
 * arbitrage bots to instantly move the price. Uses a SELL quote of 1 base token via the network's
 * configured swap provider; throws a clear error if no market route exists.
 */
async function fetchMarketPrice(network: string, baseToken: string, quoteToken: string): Promise<number> {
  const { getUnifiedQuoteSwap } = await import('../../../trading/swap/quote');
  let quote: any;
  try {
    // Probe with 1 base token — we only need the price ratio, not a real trade size.
    quote = await getUnifiedQuoteSwap(`solana-${network}`, baseToken, quoteToken, 1, 'SELL');
  } catch (e: any) {
    throw httpErrors.badRequest(
      `Could not fetch a market price for ${baseToken}/${quoteToken} to initialize the pool (${e.message}). ` +
        'Pass initialPrice explicitly.',
    );
  }
  if (!quote || !quote.amountIn || !quote.amountOut) {
    throw httpErrors.badRequest(`No market route found for ${baseToken}/${quoteToken}. Pass initialPrice explicitly.`);
  }
  return quote.amountOut / quote.amountIn; // quote token per base token
}

export async function createPool(
  network: string,
  walletAddress: string,
  baseToken: string,
  quoteToken: string,
  initialPrice?: number,
  tickSpacing?: number,
): Promise<CreatePoolResponseType> {
  // tickSpacing selects the fee tier; a FeeTier account for the config+tickSpacing must exist
  // on-chain. Validate the input shape before asking the SDK to build the transaction.
  if (tickSpacing === undefined || !Number.isInteger(tickSpacing) || tickSpacing <= 0) {
    throw httpErrors.badRequest('tickSpacing must be a positive integer');
  }

  const solana = await Solana.getInstance(network);
  const orca = await Orca.getInstance(network);

  const baseMint = await resolveMint(solana, baseToken);
  const quoteMint = await resolveMint(solana, quoteToken);
  if (baseMint.equals(quoteMint)) {
    throw httpErrors.badRequest('baseToken and quoteToken must be different');
  }

  // Resolve the seed price (quote per base). Priority:
  //   1) explicit initialPrice
  //   2) live market price from the unified swap router — so the pool opens on-market.
  let seedPrice: number;
  let seedSource: string;
  if (initialPrice !== undefined) {
    if (initialPrice <= 0) throw httpErrors.badRequest('initialPrice must be greater than zero');
    seedPrice = initialPrice;
    seedSource = 'initialPrice';
  } else {
    seedPrice = await fetchMarketPrice(network, baseToken, quoteToken);
    seedSource = 'market (unified swap router)';
  }
  logger.info(`Initializing Orca CLMM pool at ${seedPrice} ${quoteToken}/${baseToken} [${seedSource}]`);

  // Whirlpools require canonical mint ordering (tokenA < tokenB by byte-compared pubkey), and the
  // current builder asserts the order rather than sorting. It expects the initial price expressed
  // as tokenB-per-tokenA. Our seedPrice is quote-per-base, so:
  //   - base sorts as tokenA (base < quote): price stays quote-per-base = seedPrice.
  //   - base sorts as tokenB (quote < base): price becomes base-per-quote = 1/seedPrice.
  // The reported `price` (seedPrice) stays quote-per-base regardless of the on-chain sort.
  const baseMintAddress = address(baseMint.toBase58());
  const quoteMintAddress = address(quoteMint.toBase58());
  const [mintA, mintB] = orderMints(baseMintAddress, quoteMintAddress);
  const baseIsA = mintA === baseMintAddress;
  const priceAB = baseIsA ? seedPrice : 1 / seedPrice;

  logger.info(
    `Orca createPool: config=${orca.deployment.configAddress}, program=${orca.deployment.programId}, ` +
      `tokenMintA=${mintA}, tokenMintB=${mintB}, tickSpacing=${tickSpacing}, initialPrice=${priceAB}`,
  );

  const result = await createConcentratedLiquidityPoolInstructions(orca.solanaKitRpc, mintA, mintB, tickSpacing, {
    initialPrice: priceAB,
    funder: createOrcaAuthority(walletAddress),
    whirlpoolDeployment: orca.deployment,
  });
  const poolAddress = result.poolAddress.toString();

  // Refuse to re-initialize an existing pool. The SDK call above only builds instructions, so this
  // check still happens before anything is signed or sent.
  const existing = await solana.connection.getAccountInfo(new PublicKey(poolAddress));
  if (existing) {
    throw httpErrors.badRequest(`Pool already exists for this token pair and tickSpacing: ${poolAddress}`);
  }

  logger.info(`Creating Orca CLMM pool ${poolAddress} (${baseToken}/${quoteToken})`);

  // The Kit builder generates two internal vault signers. Gateway sends Web3.js transactions, so
  // replace those generated addresses with Web3.js keypairs that can be passed through its signing
  // layer. The wallet signer is intentionally retained as the external/local wallet authority.
  const generatedSignerAddresses = Array.from(
    new Set(
      result.instructions.flatMap((instruction: Instruction) =>
        (instruction.accounts ?? [])
          .filter((account) => 'signer' in account && account.address !== walletAddress)
          .map((account) => account.address.toString()),
      ),
    ),
  );
  if (generatedSignerAddresses.length !== 2) {
    throw new Error(`Expected two Orca token-vault signers, found ${generatedSignerAddresses.length}`);
  }
  const extraSigners = generatedSignerAddresses.map(() => Keypair.generate());
  const instructions = replaceOrcaInstructionAccounts(
    result.instructions,
    new Map(
      generatedSignerAddresses.map((signerAddress, index) => [signerAddress, extraSigners[index].publicKey.toBase58()]),
    ),
  );
  const transaction = buildOrcaTransaction(instructions, walletAddress);
  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress, extraSigners);

  // Retrying re-fetch; throws the shared landed-but-failed error if the transaction
  // landed with an error, so txData existing below really means "confirmed".
  const txData = await solana.getConfirmedTransactionData(signature);

  if (txData) {
    return {
      signature,
      status: 1, // CONFIRMED
      poolAddress,
      price: seedPrice,
      data: {
        fee: txData.meta.fee / 1e9,
      },
    };
  }
  return { signature, status: 0, poolAddress, price: seedPrice }; // PENDING
}

export const createPoolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof OrcaClmmCreatePoolRequest>;
    Reply: CreatePoolResponseType;
  }>(
    '/create-pool',
    {
      schema: {
        description:
          'Create and initialize a new Orca (Whirlpools) CLMM pool at an initial price. Does not open or seed a position.',
        tags: ['/connector/orca'],
        body: OrcaClmmCreatePoolRequest,
        response: {
          200: CreatePoolResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, baseToken, quoteToken, initialPrice, tickSpacing } = request.body;
        return await createPool(network, walletAddress, baseToken, quoteToken, initialPrice, tickSpacing);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Failed to create pool');
      }
    },
  );
};

export default createPoolRoute;
