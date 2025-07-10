import sensible from '@fastify/sensible';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Ethereum } from '../chains/ethereum/ethereum';
import { Solana } from '../chains/solana/solana';
import { HardwareWalletService } from '../services/hardware-wallet-service';
import { logger } from '../services/logger';

// Maximum number of account indices to check when searching for an address
const MAX_ACCOUNTS_TO_CHECK = 50;

import {
  AddHardwareWalletRequest,
  AddHardwareWalletResponse,
  AddHardwareWalletRequestSchema,
  AddHardwareWalletResponseSchema,
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
    let found = false;

    // Try different derivation path patterns
    // Pattern 1: Standard hardened account indices (most common)
    for (let i = 0; i < MAX_ACCOUNTS_TO_CHECK; i++) {
      try {
        if (req.chain.toLowerCase() === 'solana') {
          const derivationPath = `44'/501'/${i}'`;
          walletInfo = await hardwareWalletService.getSolanaAddress(derivationPath);
        } else if (req.chain.toLowerCase() === 'ethereum') {
          const derivationPath = `44'/60'/0'/0/${i}`;
          walletInfo = await hardwareWalletService.getEthereumAddress(derivationPath);
        }

        // Log the address found at this index
        if (walletInfo) {
          logger.info(`Account index ${i}: ${walletInfo.address}`);
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

    // Pattern 2: For Solana, also try the single non-hardened derivation path used by some wallets
    if (!found && req.chain.toLowerCase() === 'solana') {
      try {
        const alternativePath = `44'/501'/0'/0'`;
        walletInfo = await hardwareWalletService.getSolanaAddress(alternativePath);

        if (walletInfo) {
          logger.info(`Alternative path ${alternativePath}: ${walletInfo.address}`);

          if (walletInfo.address.toLowerCase() === validatedAddress.toLowerCase()) {
            found = true;
            logger.info(`Found matching address at derivation path ${alternativePath}`);
          }
        }
      } catch (error) {
        logger.debug(`Alternative path check failed: ${error.message}`);
      }
    }

    if (!found) {
      const message =
        req.chain.toLowerCase() === 'solana'
          ? `Address ${validatedAddress} not found on Ledger device. ` +
            `Checked account indices 0 to ${MAX_ACCOUNTS_TO_CHECK - 1} (paths 44'/501'/X') ` +
            `and alternative path 44'/501'/0'/0'. ` +
            `Please ensure this address was generated from this Ledger device.`
          : `Address ${validatedAddress} not found on Ledger device. ` +
            `Checked account indices 0 to ${MAX_ACCOUNTS_TO_CHECK - 1}. ` +
            `Please ensure this address was generated from this Ledger device.`;

      throw fastify.httpErrors.badRequest(message);
    }

    // Get existing hardware wallets
    const existingWallets = await getHardwareWallets(req.chain);

    // Check if address already exists
    const existingIndex = existingWallets.findIndex((w) => w.address === validatedAddress);

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

export const hardwareWalletRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(sensible);

  // Add hardware wallet
  fastify.post<{
    Body: AddHardwareWalletRequest;
    Reply: AddHardwareWalletResponse;
  }>(
    '/add-hardware',
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
};

export default hardwareWalletRoutes;
