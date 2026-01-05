import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { BigNumber, Wallet, utils } from 'ethers';
import { FastifyInstance } from 'fastify';
import fse from 'fs-extra';

import { Ethereum } from '../chains/ethereum/ethereum';
import { Solana } from '../chains/solana/solana';
import { updateDefaultWallet } from '../config/utils';
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
  CreateWalletRequest,
  CreateWalletResponse,
  RemoveWalletRequest,
  SendTransactionRequest,
  SendTransactionResponse,
  ShowPrivateKeyRequest,
  ShowPrivateKeyResponse,
  SignMessageRequest,
  SignMessageResponse,
  GetWalletResponse,
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
    logger.warn(`Failed to get supported chains: ${error.message}. Using fallback list.`);
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

export async function addWallet(fastify: FastifyInstance, req: AddWalletRequest): Promise<AddWalletResponse> {
  const walletKey = ConfigManagerCertPassphrase.readWalletKey();
  if (!walletKey) {
    throw fastify.httpErrors.internalServerError('No wallet encryption key configured');
  }

  // Validate chain name
  if (!validateChainName(req.chain)) {
    throw fastify.httpErrors.badRequest(`Unrecognized chain name: ${req.chain}`);
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
      throw fastify.httpErrors.badRequest(`Unrecognized chain name: ${req.chain}`);
    }
    throw e;
  }

  try {
    if (connection instanceof Ethereum) {
      address = connection.getWalletFromPrivateKey(req.privateKey).address;
      // Further validate Ethereum address
      address = Ethereum.validateAddress(address);
      encryptedPrivateKey = await connection.encrypt(req.privateKey, walletKey);
    } else if (connection instanceof Solana) {
      address = connection.getKeypairFromPrivateKey(req.privateKey).publicKey.toBase58();
      // Further validate Solana address
      address = Solana.validateAddress(address);
      encryptedPrivateKey = await connection.encrypt(req.privateKey, walletKey);
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

  // Update default wallet if requested
  if (req.setDefault) {
    updateDefaultWallet(fastify, req.chain, address);
  }

  return { address };
}

export async function removeWallet(fastify: FastifyInstance, req: RemoveWalletRequest): Promise<void> {
  logger.info(`Removing wallet: ${req.address} from chain: ${req.chain}`);

  try {
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
      // This should not happen due to validateChainName check, but just in case
      throw new Error(`Unsupported chain: ${req.chain}`);
    }

    // Create safe file path
    const safeChain = sanitizePathComponent(req.chain.toLowerCase());
    const safeAddress = sanitizePathComponent(validatedAddress);

    // Remove file
    await fse.remove(`${walletPath}/${safeChain}/${safeAddress}.json`);
  } catch (error) {
    if (error.message.includes('Invalid') || error.message.includes('Unrecognized')) {
      throw fastify.httpErrors.badRequest(error.message);
    }
    throw fastify.httpErrors.internalServerError(`Failed to remove wallet: ${error.message}`);
  }
}

export async function signMessage(fastify: FastifyInstance, req: SignMessageRequest): Promise<SignMessageResponse> {
  logger.info(`Signing message for wallet: ${req.address} on chain: ${req.chain}`);
  try {
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

    // Get connection with validated network parameter
    const safeNetwork = sanitizePathComponent(req.network);
    const connection = await getInitializedChain(req.chain, safeNetwork);

    // getWallet now includes its own address validation
    const wallet = await (connection as any).getWallet(validatedAddress);
    if (!wallet) {
      throw fastify.httpErrors.notFound(`Wallet ${req.address} not found for chain ${req.chain}`);
    }

    const signature = await wallet.signMessage(req.message);
    return { signature };
  } catch (error) {
    if (error.message.includes('Invalid') || error.message.includes('Unrecognized')) {
      throw fastify.httpErrors.badRequest(error.message);
    }
    if (error.statusCode) {
      throw error;
    }
    throw fastify.httpErrors.internalServerError(`Failed to sign message: ${error.message}`);
  }
}

async function getDirectories(source: string): Promise<string[]> {
  await mkdirIfDoesNotExist(source);
  const files = await fse.readdir(source, { withFileTypes: true });
  return files.filter((dirent) => dirent.isDirectory()).map((dirent) => dirent.name);
}

function dropExtension(path: string): string {
  return path.substr(0, path.lastIndexOf('.')) || path;
}

async function getJsonFiles(source: string): Promise<string[]> {
  try {
    const files = await fse.readdir(source, { withFileTypes: true });
    return files.filter((f) => f.isFile() && f.name.endsWith('.json')).map((f) => f.name);
  } catch (error) {
    // Return empty array if directory doesn't exist or is not accessible
    return [];
  }
}

export async function getWallets(
  fastify: FastifyInstance,
  _showReadOnly: boolean = true,
  showHardware: boolean = true,
): Promise<GetWalletResponse[]> {
  logger.info('Getting all wallets');
  try {
    // Create wallet directory if it doesn't exist
    await mkdirIfDoesNotExist(walletPath);

    // Get only valid chain directories
    const validChains = ['ethereum', 'solana'];
    const allDirs = await getDirectories(walletPath);
    const chains = allDirs.filter((dir) => validChains.includes(dir.toLowerCase()));

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

      // Get hardware wallet addresses if requested
      const hardwareAddresses = showHardware ? await getHardwareWalletAddresses(chain) : [];

      responses.push({
        chain: safeChain,
        walletAddresses: safeWalletAddresses,
        hardwareWalletAddresses: hardwareAddresses.length > 0 ? hardwareAddresses : undefined,
      });
    }

    return responses;
  } catch (error) {
    throw fastify.httpErrors.internalServerError(`Failed to get wallets: ${error.message}`);
  }
}

// Hardware wallet functions
export interface HardwareWalletData {
  address: string;
  publicKey: string;
  derivationPath: string;
  addedAt: string;
}

export function getHardwareWalletPath(chain: string): string {
  const safeChain = sanitizePathComponent(chain.toLowerCase());
  return `${walletPath}/${safeChain}/hardware-wallets.json`;
}

export async function getHardwareWallets(chain: string): Promise<HardwareWalletData[]> {
  try {
    const filePath = getHardwareWalletPath(chain);
    const exists = await fse.pathExists(filePath);
    if (!exists) {
      return [];
    }

    const content = await fse.readFile(filePath, 'utf8');
    const data = JSON.parse(content);

    if (!data.wallets || !Array.isArray(data.wallets)) {
      logger.warn(`Invalid hardware wallet file format for ${chain}`);
      return [];
    }

    return data.wallets;
  } catch (error) {
    logger.error(`Failed to read hardware wallets for ${chain}: ${error.message}`);
    return [];
  }
}

export async function getHardwareWalletAddresses(chain: string): Promise<string[]> {
  const wallets = await getHardwareWallets(chain);
  return wallets.map((w) => w.address);
}

export async function saveHardwareWallets(chain: string, wallets: HardwareWalletData[]): Promise<void> {
  const filePath = getHardwareWalletPath(chain);
  const dirPath = `${walletPath}/${sanitizePathComponent(chain.toLowerCase())}`;

  await mkdirIfDoesNotExist(dirPath);
  await fse.writeFile(filePath, JSON.stringify({ wallets }, null, 2));
}

export async function isHardwareWallet(chain: string, address: string): Promise<boolean> {
  const hardwareAddresses = await getHardwareWalletAddresses(chain);
  return hardwareAddresses.includes(address);
}

export async function getHardwareWalletByAddress(chain: string, address: string): Promise<HardwareWalletData | null> {
  const wallets = await getHardwareWallets(chain);
  return wallets.find((w) => w.address === address) || null;
}

/**
 * Generate a new wallet and add it to Gateway
 */
export async function createWallet(fastify: FastifyInstance, req: CreateWalletRequest): Promise<CreateWalletResponse> {
  const walletKey = ConfigManagerCertPassphrase.readWalletKey();
  if (!walletKey) {
    throw fastify.httpErrors.internalServerError('No wallet encryption key configured');
  }

  // Validate chain name
  if (!validateChainName(req.chain)) {
    throw fastify.httpErrors.badRequest(`Unrecognized chain name: ${req.chain}`);
  }

  let address: string;
  let privateKey: string;
  let encryptedPrivateKey: string;

  // Default to mainnet-beta for Solana or mainnet for other chains
  const network = req.chain === 'solana' ? 'mainnet-beta' : 'mainnet';

  try {
    if (req.chain.toLowerCase() === 'solana') {
      // Generate Solana keypair
      const keypair = Keypair.generate();
      address = keypair.publicKey.toBase58();
      privateKey = bs58.encode(keypair.secretKey);

      // Get Solana connection for encryption
      const connection = await getInitializedChain<Solana>(req.chain, network);
      encryptedPrivateKey = await connection.encrypt(privateKey, walletKey);
    } else if (req.chain.toLowerCase() === 'ethereum') {
      // Generate Ethereum wallet
      const wallet = Wallet.createRandom();
      address = wallet.address;
      privateKey = wallet.privateKey;

      // Get Ethereum connection for encryption
      const connection = await getInitializedChain<Ethereum>(req.chain, network);
      encryptedPrivateKey = await connection.encrypt(privateKey, walletKey);
    } else {
      throw new Error(`Unsupported chain: ${req.chain}`);
    }
  } catch (e: unknown) {
    if (e instanceof UnsupportedChainException) {
      throw fastify.httpErrors.badRequest(`Unrecognized chain name: ${req.chain}`);
    }
    throw e;
  }

  // Create safe path for wallet storage
  const safeChain = sanitizePathComponent(req.chain.toLowerCase());
  const path = `${walletPath}/${safeChain}`;

  await mkdirIfDoesNotExist(path);

  // Sanitize address for filename
  const safeAddress = sanitizePathComponent(address);
  await fse.writeFile(`${path}/${safeAddress}.json`, encryptedPrivateKey);

  // Update default wallet if requested
  if (req.setDefault) {
    updateDefaultWallet(fastify, req.chain, address);
  }

  logger.info(`Created new ${req.chain} wallet: ${address}`);

  return { address, chain: req.chain };
}

/**
 * Show private key for a wallet (requires explicit passphrase verification)
 */
export async function showPrivateKey(
  fastify: FastifyInstance,
  req: ShowPrivateKeyRequest,
): Promise<ShowPrivateKeyResponse> {
  // Verify the provided passphrase matches the configured passphrase
  const configuredPassphrase = ConfigManagerCertPassphrase.readPassphrase();
  if (!configuredPassphrase) {
    throw fastify.httpErrors.internalServerError('No passphrase configured');
  }

  if (req.passphrase !== configuredPassphrase) {
    logger.warn(`Invalid passphrase provided for show-private-key request on ${req.chain}`);
    throw fastify.httpErrors.unauthorized('Invalid passphrase');
  }

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
    throw fastify.httpErrors.badRequest(`Unsupported chain: ${req.chain}`);
  }

  // Check if it's a hardware wallet (cannot show private key)
  const isHardware = await isHardwareWallet(req.chain, validatedAddress);
  if (isHardware) {
    throw fastify.httpErrors.badRequest('Cannot show private key for hardware wallet');
  }

  // Read and decrypt the private key
  const safeChain = sanitizePathComponent(req.chain.toLowerCase());
  const safeAddress = sanitizePathComponent(validatedAddress);
  const walletFilePath = `${walletPath}/${safeChain}/${safeAddress}.json`;

  try {
    const encryptedPrivateKey = await fse.readFile(walletFilePath, 'utf8');

    // Default to mainnet-beta for Solana or mainnet for other chains
    const network = req.chain === 'solana' ? 'mainnet-beta' : 'mainnet';

    let privateKey: string;

    if (req.chain.toLowerCase() === 'solana') {
      const solana = await Solana.getInstance(network);
      privateKey = await solana.decrypt(encryptedPrivateKey, configuredPassphrase);
    } else {
      const ethereum = await Ethereum.getInstance(network);
      const wallet = await ethereum.decrypt(encryptedPrivateKey, configuredPassphrase);
      privateKey = wallet.privateKey;
    }

    logger.info(`Private key requested for ${req.chain} wallet: ${validatedAddress}`);

    return {
      address: validatedAddress,
      chain: req.chain,
      privateKey,
    };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw fastify.httpErrors.notFound(`Wallet not found: ${validatedAddress}`);
    }
    throw fastify.httpErrors.internalServerError(`Failed to decrypt wallet: ${(error as Error).message}`);
  }
}

/**
 * Send a transaction (native token or SPL/ERC20 token transfer)
 */
export async function sendTransaction(
  fastify: FastifyInstance,
  req: SendTransactionRequest,
): Promise<SendTransactionResponse> {
  // Validate chain name
  if (!validateChainName(req.chain)) {
    throw fastify.httpErrors.badRequest(`Unrecognized chain name: ${req.chain}`);
  }

  // Validate addresses based on chain type
  let validatedFromAddress: string;
  let validatedToAddress: string;

  if (req.chain.toLowerCase() === 'ethereum') {
    validatedFromAddress = Ethereum.validateAddress(req.address);
    validatedToAddress = Ethereum.validateAddress(req.toAddress);
  } else if (req.chain.toLowerCase() === 'solana') {
    validatedFromAddress = Solana.validateAddress(req.address);
    validatedToAddress = Solana.validateAddress(req.toAddress);
  } else {
    throw fastify.httpErrors.badRequest(`Unsupported chain: ${req.chain}`);
  }

  // Check if it's a hardware wallet (not supported for send)
  const isHardware = await isHardwareWallet(req.chain, validatedFromAddress);
  if (isHardware) {
    throw fastify.httpErrors.badRequest('Send from hardware wallet not supported via API');
  }

  if (req.chain.toLowerCase() === 'solana') {
    return await sendSolanaTransaction(fastify, req, validatedFromAddress, validatedToAddress);
  } else {
    return await sendEthereumTransaction(fastify, req, validatedFromAddress, validatedToAddress);
  }
}

/**
 * Send a Solana transaction
 */
async function sendSolanaTransaction(
  fastify: FastifyInstance,
  req: SendTransactionRequest,
  fromAddress: string,
  toAddress: string,
): Promise<SendTransactionResponse> {
  const solana = await Solana.getInstance(req.network);
  const wallet = await solana.getWallet(fromAddress);
  const amount = parseFloat(req.amount);
  const toPubkey = new PublicKey(toAddress);

  if (isNaN(amount) || amount <= 0) {
    throw fastify.httpErrors.badRequest('Invalid amount');
  }

  const transaction = new Transaction();
  let tokenSymbol: string;

  if (!req.token || req.token.toUpperCase() === 'SOL') {
    // Native SOL transfer
    const lamports = Math.floor(amount * 1e9);
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey,
        lamports,
      }),
    );
    tokenSymbol = 'SOL';
  } else {
    // SPL/Token2022 token transfer
    const tokenInfo = await solana.getToken(req.token);
    if (!tokenInfo) {
      throw fastify.httpErrors.badRequest(`Token not found: ${req.token}`);
    }

    const mintPubkey = new PublicKey(tokenInfo.address);

    // Detect if this is a Token2022 token by checking the mint account owner
    const mintAccountInfo = await solana.connection.getAccountInfo(mintPubkey);
    if (!mintAccountInfo) {
      throw fastify.httpErrors.badRequest(`Token mint not found on-chain: ${tokenInfo.address}`);
    }

    const programId = mintAccountInfo.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

    const fromTokenAccount = getAssociatedTokenAddressSync(mintPubkey, wallet.publicKey, false, programId);
    const toTokenAccount = getAssociatedTokenAddressSync(mintPubkey, toPubkey, false, programId);

    // Check if recipient's ATA exists, create it if not
    const toTokenAccountInfo = await solana.connection.getAccountInfo(toTokenAccount);
    if (!toTokenAccountInfo) {
      logger.info(`Creating ATA for recipient ${toAddress} for token ${tokenInfo.symbol}`);
      transaction.add(
        createAssociatedTokenAccountInstruction(
          wallet.publicKey, // payer
          toTokenAccount, // associatedToken
          toPubkey, // owner
          mintPubkey, // mint
          programId, // programId
          ASSOCIATED_TOKEN_PROGRAM_ID, // associatedTokenProgramId
        ),
      );
    }

    const tokenAmount = Math.floor(amount * Math.pow(10, tokenInfo.decimals));

    transaction.add(
      createTransferInstruction(fromTokenAccount, toTokenAccount, wallet.publicKey, tokenAmount, [], programId),
    );
    tokenSymbol = tokenInfo.symbol;
  }

  try {
    const { signature, fee } = await solana.sendAndConfirmTransaction(transaction, [wallet]);

    return {
      signature,
      status: 1, // CONFIRMED
      amount: req.amount,
      token: tokenSymbol,
      toAddress,
      fee,
    };
  } catch (error: unknown) {
    logger.error(`Solana send failed: ${(error as Error).message}`);
    throw fastify.httpErrors.internalServerError(`Transaction failed: ${(error as Error).message}`);
  }
}

/**
 * Send an Ethereum transaction
 */
async function sendEthereumTransaction(
  fastify: FastifyInstance,
  req: SendTransactionRequest,
  fromAddress: string,
  toAddress: string,
): Promise<SendTransactionResponse> {
  const ethereum = await Ethereum.getInstance(req.network);
  const wallet = await ethereum.getWallet(fromAddress);
  const amount = parseFloat(req.amount);

  if (isNaN(amount) || amount <= 0) {
    throw fastify.httpErrors.badRequest('Invalid amount');
  }

  let tokenSymbol: string;
  let txResponse;

  if (!req.token || req.token.toUpperCase() === ethereum.nativeTokenSymbol) {
    // Native token transfer (ETH, MATIC, etc.)
    const gasOptions = await ethereum.prepareGasOptions();
    const amountWei = utils.parseEther(req.amount);

    txResponse = await wallet.sendTransaction({
      to: toAddress,
      value: amountWei,
      ...gasOptions,
    });
    tokenSymbol = ethereum.nativeTokenSymbol;
  } else {
    // ERC20 token transfer
    const tokenInfo = await ethereum.getToken(req.token);
    if (!tokenInfo) {
      throw fastify.httpErrors.badRequest(`Token not found: ${req.token}`);
    }

    const contract = ethereum.getContract(tokenInfo.address, wallet);
    const tokenAmount = utils.parseUnits(req.amount, tokenInfo.decimals);

    const gasOptions = await ethereum.prepareGasOptions();
    txResponse = await contract.transfer(toAddress, tokenAmount, gasOptions);
    tokenSymbol = tokenInfo.symbol;
  }

  try {
    const receipt = await ethereum.handleTransactionExecution(txResponse);
    const fee = receipt.gasUsed
      ? parseFloat(utils.formatEther(receipt.gasUsed.mul(receipt.effectiveGasPrice || BigNumber.from(0))))
      : 0;

    return {
      signature: txResponse.hash,
      status: receipt.status === 1 ? 1 : receipt.blockNumber ? -1 : 0,
      amount: req.amount,
      token: tokenSymbol,
      toAddress,
      fee,
    };
  } catch (error: unknown) {
    logger.error(`Ethereum send failed: ${(error as Error).message}`);
    throw fastify.httpErrors.internalServerError(`Transaction failed: ${(error as Error).message}`);
  }
}
