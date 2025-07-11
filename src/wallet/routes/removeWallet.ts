import sensible from '@fastify/sensible';
import { Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { Ethereum } from '../../chains/ethereum/ethereum';
import { Solana } from '../../chains/solana/solana';
import { logger } from '../../services/logger';
import {
  RemoveWalletRequest,
  RemoveWalletResponse,
  RemoveWalletRequestSchema,
  RemoveWalletResponseSchema,
} from '../schemas';
import { removeWallet, validateChainName, isHardwareWallet, getHardwareWallets, saveHardwareWallets } from '../utils';

export const removeWalletRoute: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  fastify.delete<{ Body: RemoveWalletRequest; Reply: RemoveWalletResponse }>(
    '/remove',
    {
      schema: {
        description: 'Remove a wallet by its address (automatically detects wallet type)',
        tags: ['/wallet'],
        body: RemoveWalletRequestSchema,
        response: {
          200: RemoveWalletResponseSchema,
        },
      },
    },
    async (request) => {
      const { chain, address } = request.body;

      // Validate chain name
      if (!validateChainName(chain)) {
        throw fastify.httpErrors.badRequest(`Unrecognized chain name: ${chain}`);
      }

      // Validate the address based on chain type
      let validatedAddress: string;
      if (chain.toLowerCase() === 'ethereum') {
        validatedAddress = Ethereum.validateAddress(address);
      } else if (chain.toLowerCase() === 'solana') {
        validatedAddress = Solana.validateAddress(address);
      } else {
        throw new Error(`Unsupported chain: ${chain}`);
      }

      // Check if it's a hardware wallet
      if (await isHardwareWallet(chain, validatedAddress)) {
        logger.info(`Removing hardware wallet: ${validatedAddress} from chain: ${chain}`);

        const wallets = await getHardwareWallets(chain);
        const index = wallets.findIndex((w) => w.address === validatedAddress);
        if (index === -1) {
          throw fastify.httpErrors.notFound(`Hardware wallet ${validatedAddress} not found for ${chain}`);
        }

        wallets.splice(index, 1);
        await saveHardwareWallets(chain, wallets);

        return {
          message: `Hardware wallet ${validatedAddress} removed successfully`,
        };
      }

      // Otherwise, it's a regular wallet
      logger.info(`Removing wallet: ${validatedAddress} from chain: ${chain}`);
      await removeWallet(fastify, request.body);

      return {
        message: `Wallet ${validatedAddress} removed successfully`,
      };
    },
  );
};

export default removeWalletRoute;
