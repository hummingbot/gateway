/**
 * Add Privy Wallet Route
 * Registers a Privy server wallet with Gateway
 */

import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { updateDefaultWallet } from '../../config/utils';
import { getPrivyClient } from '../privy';
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
              setDefault: true,
            },
          ],
        },
        response: {
          200: {
            ...AddPrivyWalletResponseSchema,
            examples: [
              {
                address: 'So11111111111111111111111111111111111111112',
                privyWalletId: 'wallet_abc123',
                message: 'Privy wallet registered successfully',
              },
            ],
          },
        },
      },
    },
    async (request) => {
      const { chain, privyWalletId, setDefault } = request.body;

      // Validate chain name
      if (!validateChainName(chain)) {
        throw fastify.httpErrors.badRequest(`Unrecognized chain name: ${chain}`);
      }

      // Get Privy client and verify the wallet exists
      const privyClient = getPrivyClient();
      if (!privyClient.isConfigured()) {
        throw fastify.httpErrors.badRequest(
          'Privy credentials not configured. Set apiKeys.privyAppId and apiKeys.privyAppSecret in conf/apiKeys.yml',
        );
      }

      // Fetch wallet info from Privy
      let walletInfo;
      try {
        walletInfo = await privyClient.getWallet(privyWalletId);
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
        message: 'Privy wallet registered successfully',
      };
    },
  );
};

export default addPrivyWalletRoute;
