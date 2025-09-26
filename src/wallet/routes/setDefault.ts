import { FastifyPluginAsync } from 'fastify';

import { Cardano } from '#src/chains/cardano/cardano';

import { Ethereum } from '../../chains/ethereum/ethereum';
import { Solana } from '../../chains/solana/solana';
import { updateDefaultWallet } from '../../config/utils';
import { logger } from '../../services/logger';
import {
  SetDefaultWalletRequest,
  SetDefaultWalletResponse,
  SetDefaultWalletRequestSchema,
  SetDefaultWalletResponseSchema,
} from '../schemas';
import { validateChainName, getSafeWalletFilePath } from '../utils';

export const setDefaultRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: SetDefaultWalletRequest; Reply: SetDefaultWalletResponse }>(
    '/setDefault',
    {
      schema: {
        description: 'Set a wallet as default for a specific chain',
        tags: ['/wallet'],
        body: {
          ...SetDefaultWalletRequestSchema,
          examples: [
            {
              chain: 'ethereum',
              address: '0x742d35Cc6634C0532925a3b844Bc9e7595f2BDf8',
            },
            {
              chain: 'solana',
              address: '7UX2i7SucgLMQcfZ75s3VXmZZY4YRUyJN9X1RgfMoDUi',
            },
          ],
        },
        response: {
          200: SetDefaultWalletResponseSchema,
        },
      },
    },
    async (request) => {
      const { chain, address } = request.body;

      logger.info(`Setting default wallet for chain: ${chain} to address: ${address}`);

      // Validate chain name
      if (!validateChainName(chain)) {
        throw fastify.httpErrors.badRequest(`Unrecognized chain name: ${chain}`);
      }

      // Validate the address based on chain type
      let validatedAddress: string;
      try {
        if (chain.toLowerCase() === 'ethereum') {
          validatedAddress = Ethereum.validateAddress(address);
        } else if (chain.toLowerCase() === 'solana') {
          validatedAddress = Solana.validateAddress(address);
        } else if (chain.toLowerCase() === 'cardano') {
          validatedAddress = Cardano.validateAddress(address);
        } else {
          throw new Error(`Unsupported chain: ${chain}`);
        }
      } catch (error) {
        throw fastify.httpErrors.badRequest(`Invalid address for ${chain}: ${address}`);
      }

      // Check if wallet exists by trying to get the safe file path
      try {
        const walletPath = getSafeWalletFilePath(chain, validatedAddress);
        const fs = await import('fs-extra');
        const exists = await fs.pathExists(walletPath);

        if (!exists) {
          throw fastify.httpErrors.notFound(
            `Wallet ${validatedAddress} not found for chain ${chain}. Please add the wallet first.`,
          );
        }
      } catch (error) {
        if (error.statusCode) {
          throw error;
        }
        throw fastify.httpErrors.badRequest(`Error checking wallet: ${error.message}`);
      }

      // Update default wallet
      try {
        updateDefaultWallet(fastify, chain, validatedAddress);

        return {
          message: `Successfully set default wallet for ${chain}`,
          chain,
          address: validatedAddress,
        };
      } catch (error) {
        logger.error(`Failed to set default wallet: ${error.message}`);
        throw fastify.httpErrors.internalServerError(`Failed to set default wallet: ${error.message}`);
      }
    },
  );
};

export default setDefaultRoute;
