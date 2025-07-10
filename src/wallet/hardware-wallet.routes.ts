import sensible from '@fastify/sensible';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Ethereum } from '../chains/ethereum/ethereum';
import { Solana } from '../chains/solana/solana';
import { HardwareWalletService } from '../services/hardware-wallet-service';
import { logger } from '../services/logger';

import {
  AddHardwareWalletRequest,
  AddHardwareWalletResponse,
  RemoveHardwareWalletRequest,
  RemoveHardwareWalletResponse,
  ListHardwareWalletsRequest,
  ListHardwareWalletsResponse,
  AddHardwareWalletRequestSchema,
  AddHardwareWalletResponseSchema,
  RemoveHardwareWalletRequestSchema,
  RemoveHardwareWalletResponseSchema,
  ListHardwareWalletsRequestSchema,
  ListHardwareWalletsResponseSchema,
} from './schemas';
import {
  validateChainName,
  sanitizePathComponent,
  getHardwareWallets,
  saveHardwareWallets,
  HardwareWalletData,
} from './utils';

async function addHardwareWallet(
  fastify: FastifyInstance,
  req: AddHardwareWalletRequest,
): Promise<AddHardwareWalletResponse> {
  logger.info(`Adding hardware wallet for chain: ${req.chain}`);

  // Validate chain name
  if (!validateChainName(req.chain)) {
    throw fastify.httpErrors.badRequest(`Unrecognized chain name: ${req.chain}`);
  }

  const hardwareWalletService = HardwareWalletService.getInstance();

  // Check if device is connected
  const isConnected = await hardwareWalletService.isDeviceConnected();
  if (!isConnected) {
    throw fastify.httpErrors.badRequest('No Ledger device found. Please connect your Ledger and unlock it.');
  }

  try {
    let walletInfo;
    let validatedAddress: string;

    // Validate the provided address based on chain type
    if (req.chain.toLowerCase() === 'ethereum') {
      validatedAddress = Ethereum.validateAddress(req.address);
    } else if (req.chain.toLowerCase() === 'solana') {
      validatedAddress = Solana.validateAddress(req.address);
    } else {
      throw new Error(`Unsupported chain: ${req.chain}`);
    }

    // Search for the address on the Ledger device
    const startIndex = req.accountIndex || 0;
    const maxAccountsToCheck = 20; // Check up to 20 accounts
    let found = false;

    for (let i = startIndex; i < startIndex + maxAccountsToCheck; i++) {
      try {
        if (req.chain.toLowerCase() === 'solana') {
          const derivationPath = `44'/501'/${i}'`;
          walletInfo = await hardwareWalletService.getSolanaAddress(derivationPath);
        } else if (req.chain.toLowerCase() === 'ethereum') {
          const derivationPath = `44'/60'/0'/0/${i}`;
          walletInfo = await hardwareWalletService.getEthereumAddress(derivationPath);
        }

        // Check if this address matches the requested address
        if (walletInfo && walletInfo.address.toLowerCase() === validatedAddress.toLowerCase()) {
          found = true;
          logger.info(`Found matching address at account index ${i}`);
          break;
        }
      } catch (error) {
        // Continue checking other indices
        logger.debug(`Account index ${i} check failed: ${error.message}`);
      }
    }

    if (!found) {
      throw fastify.httpErrors.badRequest(
        `Address ${validatedAddress} not found on Ledger device. ` +
          `Checked account indices ${startIndex} to ${startIndex + maxAccountsToCheck - 1}. ` +
          `If your address uses a different account index, please specify it.`,
      );
    }

    // Get existing hardware wallets
    const existingWallets = await getHardwareWallets(req.chain);

    // Check if address already exists
    const existingIndex = existingWallets.findIndex((w) => w.address === validatedAddress);

    // Update wallet info with optional name
    if (req.name) {
      walletInfo.name = req.name;
    }

    if (existingIndex >= 0) {
      // Replace existing entry
      existingWallets[existingIndex] = walletInfo;
      await saveHardwareWallets(req.chain, existingWallets);

      return {
        ...walletInfo,
        message: `Hardware wallet ${validatedAddress} updated successfully`,
      };
    } else {
      // Add new wallet
      existingWallets.push(walletInfo);
      await saveHardwareWallets(req.chain, existingWallets);

      return {
        ...walletInfo,
        message: `Hardware wallet ${validatedAddress} added successfully`,
      };
    }
  } catch (error: any) {
    logger.error(`Failed to add hardware wallet: ${error.message}`);

    // If it's already an HTTP error (has statusCode), re-throw it directly
    if (error.statusCode) {
      throw error;
    }

    // Otherwise, wrap it appropriately based on the error message
    if (error.message.includes('No Ledger device found')) {
      throw fastify.httpErrors.badRequest(error.message);
    } else if (error.message.includes('rejected by user')) {
      throw fastify.httpErrors.badRequest('Operation rejected on Ledger device');
    }

    throw fastify.httpErrors.internalServerError(`Failed to add hardware wallet: ${error.message}`);
  }
}

async function removeHardwareWallet(
  fastify: FastifyInstance,
  req: RemoveHardwareWalletRequest,
): Promise<RemoveHardwareWalletResponse> {
  logger.info(`Removing hardware wallet: ${req.address} from chain: ${req.chain}`);

  // Validate chain name
  if (!validateChainName(req.chain)) {
    throw fastify.httpErrors.badRequest(`Unrecognized chain name: ${req.chain}`);
  }

  // Validate the address based on chain type
  let validatedAddress: string;
  if (req.chain.toLowerCase() === 'ethereum') {
    validatedAddress = Ethereum.validateAddress(req.address);
  } else if (req.chain.toLowerCase() === 'solana') {
    validatedAddress = Solana.validateAddress(req.address);
  } else {
    throw new Error(`Unsupported chain: ${req.chain}`);
  }

  // Get existing hardware wallets
  const wallets = await getHardwareWallets(req.chain);

  // Find and remove the wallet
  const index = wallets.findIndex((w) => w.address === validatedAddress);
  if (index === -1) {
    throw fastify.httpErrors.notFound(`Hardware wallet ${validatedAddress} not found for ${req.chain}`);
  }

  wallets.splice(index, 1);
  await saveHardwareWallets(req.chain, wallets);

  return {
    message: `Hardware wallet ${validatedAddress} removed successfully`,
  };
}

async function listHardwareWallets(
  fastify: FastifyInstance,
  req: ListHardwareWalletsRequest,
): Promise<ListHardwareWalletsResponse> {
  logger.info(`Listing hardware wallets for chain: ${req.chain}`);

  // Validate chain name
  if (!validateChainName(req.chain)) {
    throw fastify.httpErrors.badRequest(`Unrecognized chain name: ${req.chain}`);
  }

  const wallets = await getHardwareWallets(req.chain);

  return {
    chain: req.chain,
    wallets,
  };
}

export const hardwareWalletRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  // Add hardware wallet
  fastify.post<{
    Body: AddHardwareWalletRequest;
    Reply: AddHardwareWalletResponse;
  }>(
    '/hardware/add',
    {
      schema: {
        description: 'Add a hardware wallet',
        tags: ['/wallet'],
        body: AddHardwareWalletRequestSchema,
        response: {
          200: AddHardwareWalletResponseSchema,
        },
      },
    },
    async (request) => {
      return await addHardwareWallet(fastify, request.body);
    },
  );

  // Remove hardware wallet
  fastify.delete<{
    Body: RemoveHardwareWalletRequest;
    Reply: RemoveHardwareWalletResponse;
  }>(
    '/hardware/remove',
    {
      schema: {
        description: 'Remove a hardware wallet',
        tags: ['/wallet'],
        body: RemoveHardwareWalletRequestSchema,
        response: {
          200: RemoveHardwareWalletResponseSchema,
        },
      },
    },
    async (request) => {
      return await removeHardwareWallet(fastify, request.body);
    },
  );

  // List hardware wallets
  fastify.get<{
    Querystring: ListHardwareWalletsRequest;
    Reply: ListHardwareWalletsResponse;
  }>(
    '/hardware',
    {
      schema: {
        description: 'List hardware wallets for a chain',
        tags: ['/wallet'],
        querystring: ListHardwareWalletsRequestSchema,
        response: {
          200: ListHardwareWalletsResponseSchema,
        },
      },
    },
    async (request) => {
      return await listHardwareWallets(fastify, request.query);
    },
  );
};

export default hardwareWalletRoutes;
