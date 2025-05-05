import fse from 'fs-extra';
import { ConfigManagerCertPassphrase } from '../services/config-manager-cert-passphrase';
import { logger } from '../services/logger';
import {
  AddWalletRequest,
  AddWalletResponse,
  RemoveWalletRequest,
  SignMessageRequest,
  SignMessageResponse,
  GetWalletResponse,
} from '../system/wallet/schemas';
import {
  getInitializedChain,
  UnsupportedChainException,
  Chain,
} from '../services/connection-manager';
// Using Fastify's native error handling
import { FastifyInstance } from 'fastify';
import { Solana } from '../chains/solana/solana';
import { Ethereum } from '../chains/ethereum/ethereum';

const walletPath = './conf/wallets';

export async function mkdirIfDoesNotExist(path: string): Promise<void> {
  const exists = await fse.pathExists(path);
  if (!exists) {
    await fse.mkdir(path, { recursive: true });
  }
}

export async function addWallet(
  fastify: FastifyInstance,
  req: AddWalletRequest
): Promise<AddWalletResponse> {
  const passphrase = ConfigManagerCertPassphrase.readPassphrase();
  if (!passphrase) {
    throw fastify.httpErrors.internalServerError('No passphrase configured');
  }
  let connection: Chain;
  let address: string | undefined;
  let encryptedPrivateKey: string | undefined;

  try {
    connection = await getInitializedChain<Chain>(req.chain, req.network);
  } catch (e) {
    if (e instanceof UnsupportedChainException) {
      throw fastify.httpErrors.badRequest(`Unrecognized chain name: ${req.chain}`);
    }
    throw e;
  }

  try {
    if (connection instanceof Ethereum) {
      address = connection.getWalletFromPrivateKey(req.privateKey).address;
      encryptedPrivateKey = await connection.encrypt(
        req.privateKey,
        passphrase
      );
    } else if (connection instanceof Solana) {
      address = connection
        .getKeypairFromPrivateKey(req.privateKey)
        .publicKey.toBase58();
      encryptedPrivateKey = await connection.encrypt(
        req.privateKey,
        passphrase
      );
    }
    if (address === undefined || encryptedPrivateKey === undefined) {
      throw fastify.httpErrors.internalServerError('Unable to retrieve wallet address');
    }
  } catch (_e: unknown) {
    throw fastify.httpErrors.badRequest(
      `Unable to retrieve wallet address for provided private key: ${req.privateKey.substring(0, 5)}...`
    );
  }
  const path = `${walletPath}/${req.chain}`;
  await mkdirIfDoesNotExist(path);
  await fse.writeFile(`${path}/${address}.json`, encryptedPrivateKey);
  return { address };
}

export async function removeWallet(
  fastify: FastifyInstance,
  req: RemoveWalletRequest
): Promise<void> {
  logger.info(`Removing wallet: ${req.address} from chain: ${req.chain}`);
  try {
    await fse.remove(`${walletPath}/${req.chain}/${req.address}.json`);
  } catch (error) {
    throw fastify.httpErrors.internalServerError(`Failed to remove wallet: ${error.message}`);
  }
}

export async function signMessage(
  fastify: FastifyInstance,
  req: SignMessageRequest
): Promise<SignMessageResponse> {
  logger.info(`Signing message for wallet: ${req.address} on chain: ${req.chain}`);
  try {
    const connection = await getInitializedChain(req.chain, req.network);
    const wallet = await (connection as any).getWallet(req.address);
    if (!wallet) {
      throw fastify.httpErrors.notFound(`Wallet ${req.address} not found for chain ${req.chain}`);
    }
    const signature = await wallet.signMessage(req.message);
    return { signature };
  } catch (error) {
    if (error.statusCode) {
      throw error;
    }
    throw fastify.httpErrors.internalServerError(`Failed to sign message: ${error.message}`);
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
  const files = await fse.readdir(source, { withFileTypes: true });
  return files
    .filter((f) => f.isFile() && f.name.endsWith('.json'))
    .map((f) => f.name);
}

export async function getWallets(
  fastify: FastifyInstance
): Promise<GetWalletResponse[]> {
  logger.info('Getting all wallets');
  try {
    const chains = await getDirectories(walletPath);

    const responses: GetWalletResponse[] = [];
    for (const chain of chains) {
      const walletFiles = await getJsonFiles(`${walletPath}/${chain}`);
      responses.push({
        chain,
        walletAddresses: walletFiles.map(file => dropExtension(file))
      });
    }

    return responses;
  } catch (error) {
    throw fastify.httpErrors.internalServerError(`Failed to get wallets: ${error.message}`);
  }
}
