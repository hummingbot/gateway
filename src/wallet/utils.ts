import { FastifyInstance } from 'fastify';
import fse from 'fs-extra';

import { Ethereum } from '../chains/ethereum/ethereum';
import { Solana } from '../chains/solana/solana';
import { ConfigManagerCertPassphrase } from '../services/config-manager-cert-passphrase';
import {
  getInitializedChain,
  UnsupportedChainException,
  Chain,
  getSupportedChains,
} from '../services/connection-manager';
import { logger } from '../services/logger';

import {
  AddWalletRequest,
  AddWalletResponse,
  RemoveWalletRequest,
  SignMessageRequest,
  SignMessageResponse,
  GetWalletResponse,
  AddReadOnlyWalletRequest,
  AddReadOnlyWalletResponse,
  RemoveReadOnlyWalletRequest,
  RemoveReadOnlyWalletResponse,
} from './schemas';

export const walletPath = './conf/wallets';

// Utility to sanitize file paths and prevent path traversal attacks
export function sanitizePathComponent(input: string): string {
  // Remove any characters that could be used for directory traversal
  return input.replace(/[\/\\:*?"<>|]/g, '');
}

// Import supported chains function

// Validate chain name against known chains to prevent injection
export function validateChainName(chain: string): boolean {
  if (!chain) return false;

  try {
    // Get supported chains directly without caching
    const supportedChains = getSupportedChains();
    return supportedChains.includes(chain.toLowerCase());
  } catch (error) {
    // Fallback to hardcoded list if there's an error
    logger.warn(
      `Failed to get supported chains: ${error.message}. Using fallback list.`,
    );
    return ['ethereum', 'solana'].includes(chain.toLowerCase());
  }
}

// Get safe path for wallet files, with chain and address validation
export function getSafeWalletFilePath(chain: string, address: string): string {
  // Validate chain name
  if (!validateChainName(chain)) {
    throw new Error(`Invalid chain name: ${chain}`);
  }

  // Sanitize both inputs
  const safeChain = sanitizePathComponent(chain.toLowerCase());
  const safeAddress = sanitizePathComponent(address);

  // Ensure address isn't empty after sanitization
  if (!safeAddress) {
    throw new Error('Invalid wallet address');
  }

  return `${walletPath}/${safeChain}/${safeAddress}.json`;
}

export async function mkdirIfDoesNotExist(path: string): Promise<void> {
  const exists = await fse.pathExists(path);
  if (!exists) {
    await fse.mkdir(path, { recursive: true });
  }
}

export async function addWallet(
  fastify: FastifyInstance,
  req: AddWalletRequest,
): Promise<AddWalletResponse> {
  const passphrase = ConfigManagerCertPassphrase.readPassphrase();
  if (!passphrase) {
    throw fastify.httpErrors.internalServerError('No passphrase configured');
  }

  // Validate chain name
  if (!validateChainName(req.chain)) {
    throw fastify.httpErrors.badRequest(
      `Unrecognized chain name: ${req.chain}`,
    );
  }

  let connection: Chain;
  let address: string | undefined;
  let encryptedPrivateKey: string | undefined;

  // Default to mainnet-beta for Solana or mainnet for other chains
  const network = req.chain === 'solana' ? 'mainnet-beta' : 'mainnet';

  try {
    connection = await getInitializedChain<Chain>(req.chain, network);
  } catch (e) {
    if (e instanceof UnsupportedChainException) {
      throw fastify.httpErrors.badRequest(
        `Unrecognized chain name: ${req.chain}`,
      );
    }
    throw e;
  }

  try {
    if (connection instanceof Ethereum) {
      address = connection.getWalletFromPrivateKey(req.privateKey).address;
      // Further validate Ethereum address
      address = Ethereum.validateAddress(address);
      encryptedPrivateKey = await connection.encrypt(
        req.privateKey,
        passphrase,
      );
    } else if (connection instanceof Solana) {
      address = connection
        .getKeypairFromPrivateKey(req.privateKey)
        .publicKey.toBase58();
      // Further validate Solana address
      address = Solana.validateAddress(address);
      encryptedPrivateKey = await connection.encrypt(
        req.privateKey,
        passphrase,
      );
    }

    if (address === undefined || encryptedPrivateKey === undefined) {
      throw new Error('Unable to retrieve wallet address');
    }
  } catch (_e: unknown) {
    throw fastify.httpErrors.badRequest(
      `Unable to retrieve wallet address for provided private key: ${req.privateKey.substring(0, 5)}...`,
    );
  }

  // Create safe path for wallet storage
  const safeChain = sanitizePathComponent(req.chain.toLowerCase());
  const path = `${walletPath}/${safeChain}`;

  await mkdirIfDoesNotExist(path);

  // Sanitize address for filename
  const safeAddress = sanitizePathComponent(address);
  await fse.writeFile(`${path}/${safeAddress}.json`, encryptedPrivateKey);

  return { address };
}

export async function removeWallet(
  fastify: FastifyInstance,
  req: RemoveWalletRequest,
): Promise<void> {
  logger.info(`Removing wallet: ${req.address} from chain: ${req.chain}`);

  try {
    // Validate chain name
    if (!validateChainName(req.chain)) {
      throw fastify.httpErrors.badRequest(
        `Unrecognized chain name: ${req.chain}`,
      );
    }

    // Validate the address based on chain type
    let validatedAddress: string;
    if (req.chain.toLowerCase() === 'ethereum') {
      validatedAddress = Ethereum.validateAddress(req.address);
    } else if (req.chain.toLowerCase() === 'solana') {
      validatedAddress = Solana.validateAddress(req.address);
    } else {
      // This should not happen due to validateChainName check, but just in case
      throw new Error(`Unsupported chain: ${req.chain}`);
    }

    // Create safe file path
    const safeChain = sanitizePathComponent(req.chain.toLowerCase());
    const safeAddress = sanitizePathComponent(validatedAddress);

    // Remove file
    await fse.remove(`${walletPath}/${safeChain}/${safeAddress}.json`);
  } catch (error) {
    if (
      error.message.includes('Invalid') ||
      error.message.includes('Unrecognized')
    ) {
      throw fastify.httpErrors.badRequest(error.message);
    }
    throw fastify.httpErrors.internalServerError(
      `Failed to remove wallet: ${error.message}`,
    );
  }
}

export async function signMessage(
  fastify: FastifyInstance,
  req: SignMessageRequest,
): Promise<SignMessageResponse> {
  logger.info(
    `Signing message for wallet: ${req.address} on chain: ${req.chain}`,
  );
  try {
    // Validate chain name
    if (!validateChainName(req.chain)) {
      throw fastify.httpErrors.badRequest(
        `Unrecognized chain name: ${req.chain}`,
      );
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

    // Get connection with validated network parameter
    const safeNetwork = sanitizePathComponent(req.network);
    const connection = await getInitializedChain(req.chain, safeNetwork);

    // getWallet now includes its own address validation
    const wallet = await (connection as any).getWallet(validatedAddress);
    if (!wallet) {
      throw fastify.httpErrors.notFound(
        `Wallet ${req.address} not found for chain ${req.chain}`,
      );
    }

    const signature = await wallet.signMessage(req.message);
    return { signature };
  } catch (error) {
    if (
      error.message.includes('Invalid') ||
      error.message.includes('Unrecognized')
    ) {
      throw fastify.httpErrors.badRequest(error.message);
    }
    if (error.statusCode) {
      throw error;
    }
    throw fastify.httpErrors.internalServerError(
      `Failed to sign message: ${error.message}`,
    );
  }
}

async function getDirectories(source: string): Promise<string[]> {
  await mkdirIfDoesNotExist(source);
  const files = await fse.readdir(source, { withFileTypes: true });
  return files
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
}

function dropExtension(path: string): string {
  return path.substr(0, path.lastIndexOf('.')) || path;
}

async function getJsonFiles(source: string): Promise<string[]> {
  try {
    const files = await fse.readdir(source, { withFileTypes: true });
    return files
      .filter((f) => f.isFile() && f.name.endsWith('.json'))
      .map((f) => f.name);
  } catch (error) {
    // Return empty array if directory doesn't exist or is not accessible
    return [];
  }
}

export async function getWallets(
  fastify: FastifyInstance,
): Promise<GetWalletResponse[]> {
  logger.info('Getting all wallets');
  try {
    // Create wallet directory if it doesn't exist
    await mkdirIfDoesNotExist(walletPath);

    // Get only valid chain directories
    const validChains = ['ethereum', 'solana'];
    const allDirs = await getDirectories(walletPath);
    const chains = allDirs.filter((dir) =>
      validChains.includes(dir.toLowerCase()),
    );

    const responses: GetWalletResponse[] = [];
    for (const chain of chains) {
      // Sanitize the chain name to prevent directory traversal
      const safeChain = sanitizePathComponent(chain);
      const walletFiles = await getJsonFiles(`${walletPath}/${safeChain}`);

      // Filter out any suspicious filenames that might have survived
      const safeWalletAddresses = walletFiles
        .map((file) => dropExtension(file))
        // Additional validation for addresses based on chain type
        .filter((address) => {
          try {
            if (chain.toLowerCase() === 'ethereum') {
              // Basic Ethereum address validation (0x + 40 hex chars)
              return /^0x[a-fA-F0-9]{40}$/i.test(address);
            } else if (chain.toLowerCase() === 'solana') {
              // Basic Solana address length check
              return address.length >= 32 && address.length <= 44;
            }
            return false;
          } catch {
            return false;
          }
        });

      // Get read-only wallet addresses
      const readOnlyAddresses = await getReadOnlyWalletAddresses(chain);

      responses.push({
        chain: safeChain,
        walletAddresses: safeWalletAddresses,
        readOnlyWalletAddresses:
          readOnlyAddresses.length > 0 ? readOnlyAddresses : undefined,
      });
    }

    return responses;
  } catch (error) {
    throw fastify.httpErrors.internalServerError(
      `Failed to get wallets: ${error.message}`,
    );
  }
}

// Read-only wallet functions
export function getReadOnlyWalletPath(chain: string): string {
  const safeChain = sanitizePathComponent(chain.toLowerCase());
  return `${walletPath}/${safeChain}/read-only.json`;
}

export async function getReadOnlyWalletAddresses(
  chain: string,
): Promise<string[]> {
  try {
    const filePath = getReadOnlyWalletPath(chain);
    const exists = await fse.pathExists(filePath);
    if (!exists) {
      return [];
    }

    const content = await fse.readFile(filePath, 'utf8');
    const addresses = JSON.parse(content);

    if (!Array.isArray(addresses)) {
      logger.warn(`Invalid read-only wallet file format for ${chain}`);
      return [];
    }

    return addresses;
  } catch (error) {
    logger.error(
      `Failed to read read-only wallets for ${chain}: ${error.message}`,
    );
    return [];
  }
}

export async function saveReadOnlyWalletAddresses(
  chain: string,
  addresses: string[],
): Promise<void> {
  const filePath = getReadOnlyWalletPath(chain);
  const dirPath = `${walletPath}/${sanitizePathComponent(chain.toLowerCase())}`;

  await mkdirIfDoesNotExist(dirPath);
  await fse.writeFile(filePath, JSON.stringify(addresses, null, 2));
}

export async function addReadOnlyWallet(
  fastify: FastifyInstance,
  req: AddReadOnlyWalletRequest,
): Promise<AddReadOnlyWalletResponse> {
  logger.info(
    `Adding read-only wallet: ${req.address} for chain: ${req.chain}`,
  );

  // Validate chain name
  if (!validateChainName(req.chain)) {
    throw fastify.httpErrors.badRequest(
      `Unrecognized chain name: ${req.chain}`,
    );
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

  // Get existing read-only addresses
  const addresses = await getReadOnlyWalletAddresses(req.chain);

  // Check if already exists
  if (addresses.includes(validatedAddress)) {
    throw fastify.httpErrors.badRequest(
      `Read-only wallet ${validatedAddress} already exists for ${req.chain}`,
    );
  }

  // Check if it's already a regular wallet
  const safeChain = sanitizePathComponent(req.chain.toLowerCase());
  const safeAddress = sanitizePathComponent(validatedAddress);
  const regularWalletPath = `${walletPath}/${safeChain}/${safeAddress}.json`;

  if (await fse.pathExists(regularWalletPath)) {
    throw fastify.httpErrors.badRequest(
      `Address ${validatedAddress} already exists as a regular wallet`,
    );
  }

  // Add to list and save
  addresses.push(validatedAddress);
  await saveReadOnlyWalletAddresses(req.chain, addresses);

  return {
    message: `Read-only wallet ${validatedAddress} added successfully`,
    address: validatedAddress,
  };
}

export async function removeReadOnlyWallet(
  fastify: FastifyInstance,
  req: RemoveReadOnlyWalletRequest,
): Promise<RemoveReadOnlyWalletResponse> {
  logger.info(
    `Removing read-only wallet: ${req.address} from chain: ${req.chain}`,
  );

  // Validate chain name
  if (!validateChainName(req.chain)) {
    throw fastify.httpErrors.badRequest(
      `Unrecognized chain name: ${req.chain}`,
    );
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

  // Get existing read-only addresses
  const addresses = await getReadOnlyWalletAddresses(req.chain);

  // Check if exists
  const index = addresses.indexOf(validatedAddress);
  if (index === -1) {
    throw fastify.httpErrors.notFound(
      `Read-only wallet ${validatedAddress} not found for ${req.chain}`,
    );
  }

  // Remove from list and save
  addresses.splice(index, 1);
  await saveReadOnlyWalletAddresses(req.chain, addresses);

  return {
    message: `Read-only wallet ${validatedAddress} removed successfully`,
  };
}
