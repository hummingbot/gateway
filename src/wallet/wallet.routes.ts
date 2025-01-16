import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { addWallet, removeWallet, getWallets, signMessage } from './wallet.controllers';
import { logger } from '../services/logger';

// Define schemas inline and export types
export const WalletAddressSchema = Type.String();

export const AddWalletRequestSchema = Type.Object({
  chain: Type.String(),
  network: Type.String(),
  privateKey: Type.String()
});

export const AddWalletResponseSchema = Type.Object({
  address: WalletAddressSchema
});

export const GetWalletResponseSchema = Type.Object({
  chain: Type.String(),
  walletAddresses: Type.Array(WalletAddressSchema)
});

export const RemoveWalletRequestSchema = Type.Object({
  chain: Type.String(),
  address: WalletAddressSchema
});

export const SignMessageRequestSchema = Type.Object({
  chain: Type.String(),
  network: Type.String(),
  address: WalletAddressSchema,
  message: Type.String()
});

export const SignMessageResponseSchema = Type.Object({
  signature: Type.String()
});

// Export TypeScript types
export type AddWalletRequest = Static<typeof AddWalletRequestSchema>;
export type AddWalletResponse = Static<typeof AddWalletResponseSchema>;
export type RemoveWalletRequest = Static<typeof RemoveWalletRequestSchema>;
export type SignMessageRequest = Static<typeof SignMessageRequestSchema>;
export type SignMessageResponse = Static<typeof SignMessageResponseSchema>;
export type GetWalletResponse = Static<typeof GetWalletResponseSchema>;

export const walletRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /
  fastify.get<{ Reply: GetWalletResponse[] }>(
    '/',
    {
      schema: {
        description: 'Get all wallets across different chains',
        tags: ['wallet'],
        response: {
          200: {
            type: 'array',
            items: GetWalletResponseSchema
          }
        }
      }
    },
    async () => {
      logger.info('Getting all wallets');
      return await getWallets();
    }
  );

  // POST /add
  fastify.post<{ Body: AddWalletRequest; Reply: AddWalletResponse }>(
    '/add',
    {
      schema: {
        description: 'Add a new wallet using a private key',
        tags: ['wallet'],
        body: {
          ...AddWalletRequestSchema,
          examples: [{
            chain: 'solana',
            network: 'mainnet-beta',
            privateKey: '<your-private-key>'
          }]
        },
        response: {
          200: AddWalletResponseSchema
        }
      }
    },
    async (request) => {
      logger.info(`Adding new wallet for chain: ${request.body.chain}`);
      return await addWallet(request.body);
    }
  );

  // DELETE /remove
  fastify.delete<{ Body: RemoveWalletRequest }>(
    '/remove',
    {
      schema: {
        description: 'Remove a wallet by its address',
        tags: ['wallet'],
        body: {
          ...RemoveWalletRequestSchema,
          examples: [{
            chain: 'solana',
            address: '<address>'
          }]
        },
        response: {
          200: {
            type: 'null'
          }
        }
      }
    },
    async (request) => {
      logger.info(`Removing wallet: ${request.body.address} from chain: ${request.body.chain}`);
      await removeWallet(request.body);
      return null;
    }
  );

  // POST /sign-message
  fastify.post<{ Body: SignMessageRequest; Reply: SignMessageResponse }>(
    '/sign-message',
    {
      schema: {
        description: 'Sign a message with a specific wallet',
        tags: ['wallet'],
        body: {
          ...SignMessageRequestSchema,
          examples: [{
            chain: 'solana',
            address: '<address>',
            message: 'Hello, World!'
          }]
        },
        response: {
          200: SignMessageResponseSchema
        }
      }
    },
    async (request) => {
      logger.info(`Signing message for wallet: ${request.body.address} on chain: ${request.body.chain}`);
      return await signMessage(request.body);
    }
  );
};

export default walletRoutes;
