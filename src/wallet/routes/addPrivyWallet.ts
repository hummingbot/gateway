/**
 * Add Privy Wallet Route
 * Registers a Privy server wallet with Gateway
 */

import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { updateDefaultWallet } from '../../config/utils';
import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';
import { logger } from '../../services/logger';
import { getPrivyService } from '../privy';
import { getPrivyWallets, savePrivyWallets, validateChainName } from '../utils';

// Request schema
export const AddPrivyWalletRequestSchema = Type.Object({
  chain: Type.String({
    description: 'Blockchain for the Privy wallet',
    enum: ['ethereum', 'solana'],
    examples: ['solana', 'ethereum'],
  }),
  privyWalletId: Type.String({
    description: 'Privy wallet ID (from Privy dashboard or API)',
    examples: ['wallet_abc123'],
  }),
  passphrase: Type.String({
    description: 'Gateway passphrase (required for security)',
  }),
  setDefault: Type.Optional(
    Type.Boolean({
      description: 'Set this wallet as the default for the chain',
      default: false,
    }),
  ),
});

// Response schema
export const AddPrivyWalletResponseSchema = Type.Object({
  address: Type.String({
    description: 'The wallet address registered',
  }),
  privyWalletId: Type.String({
    description: 'The Privy wallet ID',
  }),
  policyIds: Type.Array(Type.String(), {
    description: 'Policy IDs enforced on the wallet by Privy',
  }),
  hasOwner: Type.Boolean({
    description: 'Whether the wallet has an owner (authorization key or key quorum) set in Privy',
  }),
  warnings: Type.Array(Type.String(), {
    description: 'Configuration warnings detected during registration',
  }),
  message: Type.String({
    description: 'Success message',
  }),
});

export type AddPrivyWalletRequest = Static<typeof AddPrivyWalletRequestSchema>;
export type AddPrivyWalletResponse = Static<typeof AddPrivyWalletResponseSchema>;

export const addPrivyWalletRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: AddPrivyWalletRequest;
    Reply: AddPrivyWalletResponse;
  }>(
    '/add-privy',
    {
      schema: {
        description: 'Register a Privy server wallet with Gateway for transaction signing',
        tags: ['/wallet'],
        body: {
          ...AddPrivyWalletRequestSchema,
          examples: [
            {
              chain: 'solana',
              privyWalletId: 'wallet_abc123',
              passphrase: '<gateway-passphrase>',
              setDefault: true,
            },
          ],
        },
        response: {
          200: AddPrivyWalletResponseSchema,
        },
      },
    },
    async (request) => {
      const { chain, privyWalletId, passphrase, setDefault } = request.body;

      // Verify the provided passphrase matches the configured passphrase
      // (same pattern as show-private-key)
      const configuredPassphrase = ConfigManagerCertPassphrase.readPassphrase();
      if (!configuredPassphrase) {
        throw fastify.httpErrors.internalServerError('No passphrase configured');
      }
      if (passphrase !== configuredPassphrase) {
        logger.warn(`Invalid passphrase provided for add-privy request on ${chain}`);
        throw fastify.httpErrors.unauthorized('Invalid passphrase');
      }

      // Validate chain name
      if (!validateChainName(chain)) {
        throw fastify.httpErrors.badRequest(`Unrecognized chain name: ${chain}`);
      }

      const privyService = getPrivyService();
      if (!privyService.isConfigured()) {
        throw fastify.httpErrors.badRequest(
          'Privy credentials not configured. Set apiKeys.privyAppId and apiKeys.privyAppSecret in conf/apiKeys.yml',
        );
      }

      // Fetch wallet info from Privy (verifies the wallet exists and credentials work)
      let walletInfo;
      try {
        walletInfo = await privyService.getWalletInfo(privyWalletId);
      } catch (error: any) {
        throw fastify.httpErrors.badRequest(`Failed to fetch Privy wallet: ${error.message}`);
      }

      // Validate chain type matches
      const expectedChainType = chain === 'solana' ? 'solana' : 'ethereum';
      if (walletInfo.chainType !== expectedChainType) {
        throw fastify.httpErrors.badRequest(
          `Wallet chain type mismatch: expected ${expectedChainType}, got ${walletInfo.chainType}`,
        );
      }

      // Surface insecure configurations: a wallet without a policy can sign anything,
      // and without an owner the app secret alone can remove or rewrite policies.
      const warnings: string[] = [];
      if (walletInfo.policyIds.length === 0) {
        warnings.push(
          'No policy is attached to this Privy wallet: it can sign any transaction. Attach a policy in Privy to restrict signing.',
        );
      }
      if (!walletInfo.ownerId) {
        warnings.push(
          'No owner is set on this Privy wallet: anyone holding the app secret can change or remove its policies. Set an authorization key or key quorum as owner in Privy.',
        );
      }
      warnings.forEach((warning) => logger.warn(`Privy wallet ${privyWalletId}: ${warning}`));

      // Get existing Privy wallets
      const existingWallets = await getPrivyWallets(chain);

      // Check if wallet already registered
      const existingWallet = existingWallets.find(
        (w) => w.privyWalletId === privyWalletId || w.address.toLowerCase() === walletInfo.address.toLowerCase(),
      );

      if (existingWallet) {
        throw fastify.httpErrors.badRequest(`Privy wallet already registered: ${existingWallet.address}`);
      }

      // Add the new wallet
      existingWallets.push({
        address: walletInfo.address,
        privyWalletId,
        addedAt: new Date().toISOString(),
      });

      // Save updated wallet list
      await savePrivyWallets(chain, existingWallets);

      // Set as default if requested
      if (setDefault) {
        updateDefaultWallet(fastify, chain, walletInfo.address);
      }

      return {
        address: walletInfo.address,
        privyWalletId,
        policyIds: walletInfo.policyIds,
        hasOwner: !!walletInfo.ownerId,
        warnings,
        message: 'Privy wallet registered successfully',
      };
    },
  );
};

export default addPrivyWalletRoute;
