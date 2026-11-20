import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { claimCreatorFees, getCreatorFees } from '../../connectors/pump/launch-routes/creatorFees';
import { migrateCurve } from '../../connectors/pump/launch-routes/migrate';
import {
  chainNetworkField,
  connectorField,
  parseChainNetwork,
  rethrowRouteError,
  walletAddressField,
  resolveWalletAddress,
} from '../common';
import { assertLaunchConnectorOnChain } from '../connector-registry';

/** Launchpads whose creator fees Gateway reads and claims. */
export const CREATOR_FEE_CONNECTORS = ['pump'];

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
    connector: connectorField(CREATOR_FEE_CONNECTORS, 'Launchpad connector', { defaulted: false }),
    chainNetwork: chainNetworkField(),
    walletAddress: walletAddressField('Creator wallet that claims (and pays the fee)'),
  },
  { $id: 'LaunchClaimCreatorFeesRequest', additionalProperties: false },
);

export const LaunchClaimCreatorFeesResponse = Type.Object(
  {
    signature: Type.String(),
    status: Type.Number({ description: '0 = PENDING, 1 = CONFIRMED' }),
    claimed: Type.Number({ description: 'SOL collected (the vault balance read before the claim)' }),
    fee: Type.Optional(Type.Number({ description: 'Transaction fee in SOL, once confirmed' })),
  },
  { $id: 'LaunchClaimCreatorFeesResponse' },
);

export const LaunchMigrateRequestSchema = Type.Object(
  {
    connector: connectorField(CREATOR_FEE_CONNECTORS, 'Launchpad connector', { defaulted: false }),
    chainNetwork: chainNetworkField(),
    walletAddress: walletAddressField('Wallet that sends (and pays for) the migration'),
    baseMint: Type.String({ description: 'The graduated token' }),
  },
  { $id: 'LaunchMigrateRequest', additionalProperties: false },
);

export const LaunchMigrateResponse = Type.Object(
  {
    signature: Type.String(),
    status: Type.Number({ description: '0 = PENDING, 1 = CONFIRMED' }),
    poolAddress: Type.String({ description: 'The PumpSwap pool the token now trades on' }),
  },
  { $id: 'LaunchMigrateResponse' },
);

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
        description: "Collect a launchpad creator's fees into its wallet (pump: both vaults in one transaction)",
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
        return await claimCreatorFees(network, walletAddress);
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
          "Migrate a completed pump curve to its PumpSwap pool — permissionless; pump's keeper does it on " +
          'mainnet, nothing does on a devnet or local validator',
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
        return await migrateCurve(network, walletAddress, baseMint);
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to migrate the curve');
      }
    },
  );
};

export default creatorFeesRoute;
