import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { claimCreatorFees as meteoraClaimCreatorFees } from '../../connectors/meteora/launch-routes/claimCreatorFees';
import { migrateCurve as meteoraMigrateCurve } from '../../connectors/meteora/launch-routes/migrate';
import {
  claimCreatorFees as pumpClaimCreatorFees,
  getCreatorFees,
} from '../../connectors/pump/launch-routes/creatorFees';
import { migrateCurve as pumpMigrateCurve } from '../../connectors/pump/launch-routes/migrate';
import { claimCreatorFees as raydiumClaimCreatorFees } from '../../connectors/raydium/launch-routes/claimCreatorFees';
import { httpErrors } from '../../services/error-handler';
import {
  BuildTransactionResponse,
  BuildTransactionResponseType,
  buildShapeFields,
  buildUnsigned,
  extraInstructionsField,
  priorityField,
} from '../build-common';
import {
  chainNetworkField,
  connectorField,
  parseChainNetwork,
  rethrowRouteError,
  walletAddressField,
  resolveWalletAddress,
} from '../common';
import { assertLaunchConnectorOnChain } from '../connector-registry';

/** Launchpads whose creator fees Gateway reads (pump: per creator, across its coins). */
export const CREATOR_FEE_CONNECTORS = ['pump'];
/** Launchpads whose creator fees Gateway claims. */
export const CLAIM_CREATOR_FEE_CONNECTORS = ['pump', 'meteora', 'raydium'];
/** Launchpads whose completed curves Gateway migrates. */
export const MIGRATE_CONNECTORS = ['pump', 'meteora'];

export const LaunchCreatorFeesRequestSchema = Type.Object(
  {
    connector: connectorField(CREATOR_FEE_CONNECTORS, 'Launchpad connector', { defaulted: false }),
    chainNetwork: chainNetworkField(),
    creator: Type.String({ description: 'The creator whose fees to read (base58); for pump, across all its coins' }),
  },
  { $id: 'LaunchCreatorFeesRequest', additionalProperties: false },
);

export const LaunchCreatorFeesResponse = Type.Object(
  {
    creator: Type.String(),
    unclaimed: Type.Number({ description: 'Unclaimed creator fees, in SOL' }),
  },
  { $id: 'LaunchCreatorFeesResponse' },
);

export const LaunchClaimCreatorFeesRequestSchema = Type.Object(
  {
    connector: connectorField(CLAIM_CREATOR_FEE_CONNECTORS, 'Launchpad connector', { defaulted: false }),
    chainNetwork: chainNetworkField(),
    walletAddress: walletAddressField(
      'Wallet that claims (and pays the fee): the creator; for meteora, the creator or the config fee claimer',
    ),
    baseMint: Type.Optional(
      Type.String({
        description:
          'The launched token whose fees to claim. Required for meteora (the DBC pool of this token: the ' +
          "creator's share, and the partner's when the wallet is the config's fee claimer) and raydium (the " +
          "creator's LaunchLab fee vault for this token's quote, and the creator fee of the CPMM pools it " +
          "graduated into). Not taken by pump, whose claim collects all of a creator's coins at once.",
      }),
    ),
  },
  { $id: 'LaunchClaimCreatorFeesRequest', additionalProperties: false },
);

/** Same body as the claim, plus the build-only extras. */
export const LaunchBuildClaimCreatorFeesRequestSchema = Type.Object(
  {
    ...LaunchClaimCreatorFeesRequestSchema.properties,
    extraInstructions: extraInstructionsField(),
    ...buildShapeFields(),
    priority: priorityField(),
  },
  { $id: 'LaunchBuildClaimCreatorFeesRequest', additionalProperties: false },
);

export const LaunchClaimCreatorFeesResponse = Type.Object(
  {
    signature: Type.String(),
    status: Type.Number({ description: '0 = PENDING, 1 = CONFIRMED' }),
    claimed: Type.Number({
      description:
        "Quote collected, in quoteMint's units (pump: SOL), as read before the claim; base-token fees a DBC " +
        'pool also pays are not counted here',
    }),
    quoteMint: Type.Optional(Type.String({ description: 'The quote token claimed (meteora, raydium)' })),
    fee: Type.Optional(Type.Number({ description: 'Transaction fee in SOL, once confirmed' })),
  },
  { $id: 'LaunchClaimCreatorFeesResponse' },
);

export const LaunchMigrateRequestSchema = Type.Object(
  {
    connector: connectorField(MIGRATE_CONNECTORS, 'Launchpad connector', { defaulted: false }),
    chainNetwork: chainNetworkField(),
    walletAddress: walletAddressField('Wallet that sends (and pays for) the migration'),
    baseMint: Type.String({ description: 'The graduated token' }),
  },
  { $id: 'LaunchMigrateRequest', additionalProperties: false },
);

/** Same body as the migration, plus the build-only extras. */
export const LaunchBuildMigrateRequestSchema = Type.Object(
  {
    ...LaunchMigrateRequestSchema.properties,
    extraInstructions: extraInstructionsField(),
    ...buildShapeFields(),
    priority: priorityField(),
  },
  { $id: 'LaunchBuildMigrateRequest', additionalProperties: false },
);

export const LaunchMigrateResponse = Type.Object(
  {
    signature: Type.String(),
    status: Type.Number({ description: '0 = PENDING, 1 = CONFIRMED' }),
    poolAddress: Type.String({
      description: 'The pool the token now trades on (pump: its PumpSwap pool; meteora: its DAMM v2 pool)',
    }),
  },
  { $id: 'LaunchMigrateResponse' },
);

async function dispatchClaim(connector: string, network: string, walletAddress: string, baseMint?: string) {
  if (connector === 'pump') {
    if (baseMint !== undefined) {
      throw httpErrors.badRequest("pump's claim collects all of a creator's coins at once: it takes no baseMint");
    }
    return await pumpClaimCreatorFees(network, walletAddress);
  }
  if (baseMint === undefined) {
    throw httpErrors.badRequest(`baseMint is required for ${connector}: its creator fees are claimed per launch`);
  }
  switch (connector) {
    case 'meteora':
      return await meteoraClaimCreatorFees(network, walletAddress, baseMint);
    case 'raydium':
      return await raydiumClaimCreatorFees(network, walletAddress, baseMint);
    default:
      throw httpErrors.badRequest(`Unsupported launchpad for claim-creator-fees: ${connector}`);
  }
}

async function dispatchMigrate(connector: string, network: string, walletAddress: string, baseMint: string) {
  switch (connector) {
    case 'pump':
      return await pumpMigrateCurve(network, walletAddress, baseMint);
    case 'meteora':
      return await meteoraMigrateCurve(network, walletAddress, baseMint);
    default:
      throw httpErrors.badRequest(`Unsupported launchpad for migrate: ${connector}`);
  }
}

export const creatorFeesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: Static<typeof LaunchCreatorFeesRequestSchema> }>(
    '/creator-fees',
    {
      schema: {
        description: "A launchpad creator's unclaimed fees (pump: across all its coins, curve and PumpSwap)",
        tags: ['/trading/launch'],
        querystring: LaunchCreatorFeesRequestSchema,
        response: { 200: LaunchCreatorFeesResponse },
      },
    },
    async (request) => {
      const { connector, chainNetwork, creator } = request.query;
      try {
        const { chain, network } = parseChainNetwork(chainNetwork);
        assertLaunchConnectorOnChain(connector, chain);
        return await getCreatorFees(network, creator);
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to read creator fees');
      }
    },
  );

  fastify.post<{ Body: Static<typeof LaunchClaimCreatorFeesRequestSchema> }>(
    '/claim-creator-fees',
    {
      schema: {
        description:
          "Collect a launchpad creator's fees into its wallet (pump: both vaults, all its coins; meteora: a DBC " +
          "pool's creator and partner shares; raydium: the LaunchLab vault and the graduated CPMM pools)",
        tags: ['/trading/launch'],
        body: LaunchClaimCreatorFeesRequestSchema,
        response: { 200: LaunchClaimCreatorFeesResponse },
      },
    },
    async (request) => {
      const { connector, chainNetwork, walletAddress: requestedWallet } = request.body;
      try {
        const { chain, network } = parseChainNetwork(chainNetwork);
        const walletAddress = resolveWalletAddress(chain, requestedWallet);
        assertLaunchConnectorOnChain(connector, chain);
        return await dispatchClaim(connector, network, walletAddress, request.body.baseMint);
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to claim creator fees');
      }
    },
  );

  fastify.post<{ Body: Static<typeof LaunchMigrateRequestSchema> }>(
    '/migrate',
    {
      schema: {
        description:
          'Migrate a completed curve to its pool — pump: its PumpSwap pool; meteora: its DAMM v2 pool (the ' +
          "locker first when the config locks vesting). Permissionless; the launchpads' keepers usually do it.",
        tags: ['/trading/launch'],
        body: LaunchMigrateRequestSchema,
        response: { 200: LaunchMigrateResponse },
      },
    },
    async (request) => {
      const { connector, chainNetwork, walletAddress: requestedWallet, baseMint } = request.body;
      try {
        const { chain, network } = parseChainNetwork(chainNetwork);
        const walletAddress = resolveWalletAddress(chain, requestedWallet);
        assertLaunchConnectorOnChain(connector, chain);
        return await dispatchMigrate(connector, network, walletAddress, baseMint);
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to migrate the curve');
      }
    },
  );

  fastify.post<{ Body: Static<typeof LaunchBuildClaimCreatorFeesRequestSchema>; Reply: BuildTransactionResponseType }>(
    '/build-claim-creator-fees',
    {
      schema: {
        description:
          'Build the unsigned transaction that /claim-creator-fees would sign and send, for the caller to sign ' +
          'with its own wallet and broadcast via /chains/{chain}/submit.',
        tags: ['/trading/launch'],
        body: LaunchBuildClaimCreatorFeesRequestSchema,
        response: { 200: BuildTransactionResponse },
      },
    },
    async (request) => {
      const {
        connector,
        chainNetwork,
        walletAddress: requestedWallet,
        baseMint,
        extraInstructions,
        feePayer,
        format,
        memo,
        references,
        priority,
      } = request.body;
      try {
        const { chain, network } = parseChainNetwork(chainNetwork);
        const walletAddress = resolveWalletAddress(chain, requestedWallet);
        assertLaunchConnectorOnChain(connector, chain);
        return await buildUnsigned(
          chain,
          connector,
          { extraInstructions, feePayer, format, memo, references },
          () => dispatchClaim(connector, network, walletAddress, baseMint),
          priority,
        );
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to build the claim-creator-fees transaction');
      }
    },
  );

  fastify.post<{ Body: Static<typeof LaunchBuildMigrateRequestSchema>; Reply: BuildTransactionResponseType }>(
    '/build-migrate',
    {
      schema: {
        description:
          'Build the unsigned transaction(s) that /migrate would sign and send, for the caller to sign with its ' +
          'own wallet and broadcast via /chains/{chain}/submit. A meteora config that locks vesting needs its ' +
          'locker first: the migration then comes in followingTransactions, to submit after the locker confirms.',
        tags: ['/trading/launch'],
        body: LaunchBuildMigrateRequestSchema,
        response: { 200: BuildTransactionResponse },
      },
    },
    async (request) => {
      const {
        connector,
        chainNetwork,
        walletAddress: requestedWallet,
        baseMint,
        extraInstructions,
        feePayer,
        format,
        memo,
        references,
        priority,
      } = request.body;
      try {
        const { chain, network } = parseChainNetwork(chainNetwork);
        const walletAddress = resolveWalletAddress(chain, requestedWallet);
        assertLaunchConnectorOnChain(connector, chain);
        return await buildUnsigned(
          chain,
          connector,
          { extraInstructions, feePayer, format, memo, references },
          () => dispatchMigrate(connector, network, walletAddress, baseMint),
          priority,
        );
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to build the migrate transaction');
      }
    },
  );
};

export default creatorFeesRoute;
