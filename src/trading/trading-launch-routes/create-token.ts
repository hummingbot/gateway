import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import {
  createToken as dbcCreateToken,
  prepareCreateToken as dbcPrepareCreateToken,
  DbcCreateTokenParams,
  DbcPreparedLaunch,
} from '../../connectors/meteora/launch-routes/createToken';
import {
  createToken as pumpCreateToken,
  prepareCreateToken as pumpPrepareCreateToken,
  CreateTokenParams,
  PreparedLaunch,
} from '../../connectors/pump/launch-routes/createToken';
import {
  createToken as raydiumCreateToken,
  prepareCreateToken as raydiumPrepareCreateToken,
  RaydiumCreateTokenParams,
  RaydiumPreparedLaunch,
} from '../../connectors/raydium/launch-routes/createToken';
import { CreateTokenResponse, CreateTokenResponseType } from '../../schemas/launch-schema';
import { httpErrors } from '../../services/error-handler';
import {
  BuildTransactionResponse,
  buildUnsigned,
  buildShapeFields,
  extraInstructionsField,
  priorityField,
} from '../build-common';
import {
  chainNetworkField,
  connectorField,
  parseChainNetwork,
  rethrowRouteError,
  resolveWalletAddress,
  walletAddressField,
} from '../common';
import { assertLaunchConnectorOnChain, LAUNCH_CONNECTORS } from '../connector-registry';

export const UnifiedCreateTokenRequest = Type.Object(
  {
    connector: connectorField(LAUNCH_CONNECTORS, 'Launchpad connector', { defaulted: false }),
    chainNetwork: chainNetworkField(),
    walletAddress: walletAddressField('Wallet that creates the token (creator, dev-buyer, and fee payer)'),
    name: Type.String({ description: 'Token name (on-chain limit: 32 bytes)', maxLength: 32 }),
    symbol: Type.String({ description: 'Token ticker symbol (on-chain limit: 13 bytes)', maxLength: 13 }),
    metadataUri: Type.String({
      description:
        'Metadata JSON URI (name, symbol, image, links) that the caller pinned, embedded on-chain as-is ' +
        '(on-chain limit: 200 bytes). Gateway uploads no images or metadata.',
      maxLength: 200,
    }),
    creator: Type.Optional(
      Type.String({
        description:
          "The token's creator, when it is not the signing wallet (base58) — e.g. a program that collects " +
          'its creator fees. pump passes it to create_v2 (the wallet still pays and does any dev buy); ' +
          'meteora appends transfer_pool_creator to it after the pool creation. Omitted: the wallet.',
      }),
    ),
    devBuyAmount: Type.Optional(
      Type.Number({
        format: 'decimal',
        minimum: 0,
        description:
          'Optional initial dev buy in the quote currency, executed atomically with the create: SOL on pump; ' +
          "raydium: the launch's quote (quoteToken)",
        'x-connectors': ['pump', 'raydium'],
      } as any),
    ),
    quoteToken: Type.Optional(
      Type.String({
        description: 'raydium: what the curve sells for, SOL or USDC (symbol or mint). Default SOL.',
        'x-connectors': ['raydium'],
      } as any),
    ),
    supply: Type.Optional(
      Type.Integer({
        minimum: 1,
        description: 'raydium: tokens minted, at six decimals. Default 1,000,000,000.',
        'x-connectors': ['raydium'],
      } as any),
    ),
    sellSharePct: Type.Optional(
      Type.Number({
        format: 'decimal',
        description:
          'raydium: the share of the supply the curve sells, percent. Above 50, and leaving at least what ' +
          "the quote's global config keeps for the graduated pool (15 %). Default 80.",
        'x-connectors': ['raydium'],
      } as any),
    ),
    raise: Type.Optional(
      Type.Number({
        format: 'decimal',
        description:
          'raydium: what the curve raises before it graduates to CPMM, in the quote. At least the global ' +
          "config's minimum (24 SOL). Default 85 SOL, or 85 SOL's worth of USDC at the chain's price.",
        'x-connectors': ['raydium'],
      } as any),
    ),
    lookupTableAddress: Type.Optional(
      Type.String({
        description:
          'pump: the address lookup table a create with devBuyAmount compiles against, instead of the ' +
          "connector's pump.lookupTableAddress. With neither, the build is two transactions: the first makes a " +
          "lookup table (the wallet its authority) holding the create's accounts, the second is the create and " +
          'the dev buy, atomic, in followingTransactions — submit it after the first confirms.',
        'x-connectors': ['pump'],
      } as any),
    ),
    configAddress: Type.Optional(
      Type.String({
        description:
          "meteora: the DBC config to launch from, instead of the connector's configured configAddress " +
          '(so two launchers on one Gateway can each launch under their own terms)',
        'x-connectors': ['meteora'],
      } as any),
    ),
    firstBuySol: Type.Optional(
      Type.Number({
        format: 'decimal',
        minimum: 0,
        description:
          'meteora: optional first buy in SOL by the creator, executed atomically with the pool creation ' +
          '(createPoolWithFirstBuy). Omit or 0 for a bare launch.',
        'x-connectors': ['meteora'],
      } as any),
    ),
  },
  { $id: 'LaunchCreateTokenRequest', additionalProperties: false },
);

/** Same body as the execute route, plus the build-only extras. */
export const BuildCreateTokenRequest = Type.Object(
  {
    ...UnifiedCreateTokenRequest.properties,
    extraInstructions: extraInstructionsField(),
    ...buildShapeFields(),
    priority: priorityField(),
  },
  { $id: 'LaunchBuildCreateTokenRequest', additionalProperties: false },
);

/**
 * Build response: the unsigned transaction plus the identity it will mint. The
 * mint keypair partial-signs as an ephemeral signer (it is also listed in
 * extraSigners); the metadataUri is echoed so a rebuild after blockhash expiry
 * can pass it back and skip re-uploading.
 */
export const BuildCreateTokenResponse = Type.Composite(
  [
    BuildTransactionResponse,
    Type.Object({
      mint: Type.String({ description: 'Mint address the transaction will create' }),
      metadataUri: Type.String({ description: 'Metadata URI embedded in the transaction' }),
      poolAddress: Type.Optional(
        Type.String({ description: 'meteora, raydium: the curve pool PDA the transaction will create' }),
      ),
    }),
  ],
  { $id: 'LaunchBuildCreateTokenResponse' },
);

type LaunchParams = CreateTokenParams & DbcCreateTokenParams & RaydiumCreateTokenParams;
/** What a connector resolved before building; DBC and LaunchLab also know the pool they create. */
type Prepared = PreparedLaunch & Partial<Pick<DbcPreparedLaunch, 'poolAddress'>>;

/** The options only a LaunchLab launch reads, refused elsewhere rather than ignored. */
const RAYDIUM_ONLY = ['quoteToken', 'supply', 'sellSharePct', 'raise'] as const;

async function dispatchPrepareCreateToken(connector: string, network: string, params: LaunchParams): Promise<Prepared> {
  const misplaced = RAYDIUM_ONLY.filter((k) => connector !== 'raydium' && params[k] !== undefined);
  if (misplaced.length > 0) {
    throw httpErrors.badRequest(
      `${misplaced.join(', ')} ${misplaced.length === 1 ? 'is' : 'are'} for raydium launches`,
    );
  }
  if (connector !== 'meteora' && params.configAddress !== undefined) {
    throw httpErrors.badRequest('configAddress is for meteora launches');
  }
  if (connector !== 'pump' && params.lookupTableAddress !== undefined) {
    throw httpErrors.badRequest('lookupTableAddress is for pump launches');
  }
  switch (connector) {
    case 'raydium':
      return await raydiumPrepareCreateToken(params);
    case 'pump':
      return await pumpPrepareCreateToken(params);
    case 'meteora':
      return await dbcPrepareCreateToken(network, params);
    default:
      throw httpErrors.badRequest(
        `Unsupported launch connector: ${connector}. Supported: ${LAUNCH_CONNECTORS.join(', ')}`,
      );
  }
}

async function dispatchCreateToken(
  connector: string,
  network: string,
  walletAddress: string,
  params: LaunchParams,
  prepared: Prepared,
): Promise<CreateTokenResponseType> {
  switch (connector) {
    case 'pump':
      return await pumpCreateToken(network, walletAddress, params, prepared);
    case 'meteora':
      return await dbcCreateToken(network, walletAddress, params, prepared as DbcPreparedLaunch);
    case 'raydium':
      return await raydiumCreateToken(network, walletAddress, params, prepared as RaydiumPreparedLaunch);
    default:
      throw httpErrors.badRequest(
        `Unsupported launch connector: ${connector}. Supported: ${LAUNCH_CONNECTORS.join(', ')}`,
      );
  }
}

export const createTokenRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof BuildCreateTokenRequest>;
    Reply: Static<typeof BuildCreateTokenResponse>;
  }>(
    '/build-create-token',
    {
      schema: {
        description:
          'Build the unsigned transaction that /create-token would sign and send, for the caller to sign ' +
          'with its own wallet and broadcast via /chains/{chain}/submit. The mint keypair has already ' +
          'partial-signed (see extraSigners); Gateway discards it after the build. A pump launch with a dev ' +
          'buy and no lookup table is two transactions (see lookupTableAddress).',
        tags: ['/trading/launch'],
        body: BuildCreateTokenRequest,
        response: { 200: BuildCreateTokenResponse },
      },
    },
    async (request) => {
      try {
        const {
          connector,
          chainNetwork,
          walletAddress: requestedWallet,
          extraInstructions,
          feePayer,
          format,
          memo,
          references,
          priority,
          ...params
        } = request.body;
        const { chain, network } = parseChainNetwork(chainNetwork);
        const walletAddress = resolveWalletAddress(chain, requestedWallet);
        assertLaunchConnectorOnChain(connector, chain);

        const prepared = await dispatchPrepareCreateToken(connector, network, params);
        const built = await buildUnsigned(
          'solana', // launchpads are Solana-only: the launch registry refused any other chain above

          connector,
          { extraInstructions, feePayer, format, memo, references },
          () => dispatchCreateToken(connector, network, walletAddress, params, prepared),
          priority,
        );
        return {
          ...built,
          mint: prepared.mintKeypair.publicKey.toBase58(),
          metadataUri: prepared.metadataUri,
          ...(prepared.poolAddress ? { poolAddress: prepared.poolAddress } : {}),
        };
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to build create-token transaction');
      }
    },
  );

  fastify.post<{
    Body: Static<typeof UnifiedCreateTokenRequest>;
    Reply: CreateTokenResponseType;
  }>(
    '/create-token',
    {
      schema: {
        description:
          'Create a new token on a launchpad from a metadataUri the caller pinned: a pump.fun bonding curve ' +
          '(optionally with an atomic dev buy), a Meteora DBC virtual pool from a DBC config (optional ' +
          'atomic firstBuySol), or a ' +
          "Raydium LaunchLab curve on Raydium's platform in SOL or USDC (supply, sellSharePct, raise; " +
          'optional atomic devBuyAmount).',
        tags: ['/trading/launch'],
        body: UnifiedCreateTokenRequest,
        response: { 200: CreateTokenResponse },
      },
    },
    async (request) => {
      try {
        const { connector, chainNetwork, walletAddress: requestedWallet, ...params } = request.body;
        const { chain, network } = parseChainNetwork(chainNetwork);
        const walletAddress = resolveWalletAddress(chain, requestedWallet);
        assertLaunchConnectorOnChain(connector, chain);

        const prepared = await dispatchPrepareCreateToken(connector, network, params);
        return await dispatchCreateToken(connector, network, walletAddress, params, prepared);
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to create token');
      }
    },
  );
};

export default createTokenRoute;
