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
} from './wallet.routes';
import {
  getInitializedChain,
  UnsupportedChainException,
  Chain,
  ChainInstance,
} from '../services/connection-manager';
import {
  ERROR_RETRIEVING_WALLET_ADDRESS_ERROR_CODE,
  ERROR_RETRIEVING_WALLET_ADDRESS_ERROR_MESSAGE,
  HttpException,
  UNKNOWN_CHAIN_ERROR_CODE,
  UNKNOWN_KNOWN_CHAIN_ERROR_MESSAGE,
} from '../services/error-handler';
import { Solana } from '../chains/solana/solana';
import { EthereumBase } from '../chains/ethereum/ethereum-base';

const walletPath = './conf/wallets';

export async function mkdirIfDoesNotExist(path: string): Promise<void> {
  const exists = await fse.pathExists(path);
  if (!exists) {
    await fse.mkdir(path, { recursive: true });
  }
}

export async function addWallet(
  req: AddWalletRequest
): Promise<AddWalletResponse> {
  const passphrase = ConfigManagerCertPassphrase.readPassphrase();
  if (!passphrase) {
    throw new Error('There is no passphrase');
  }
  let connection: Chain;
  let address: string | undefined;
  let encryptedPrivateKey: string | undefined;

  try {
    connection = await getInitializedChain<ChainInstance>(req.chain, req.network);
  } catch (e) {
    if (e instanceof UnsupportedChainException) {
      throw new HttpException(
        500,
        UNKNOWN_KNOWN_CHAIN_ERROR_MESSAGE(req.chain),
        UNKNOWN_CHAIN_ERROR_CODE
      );
    }
    throw e;
  }

  try {
    if (connection instanceof EthereumBase) {
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
      throw new Error('ERROR_RETRIEVING_WALLET_ADDRESS_ERROR_CODE');
    }
  } catch (_e: unknown) {
    throw new HttpException(
      500,
      ERROR_RETRIEVING_WALLET_ADDRESS_ERROR_MESSAGE(req.privateKey),
      ERROR_RETRIEVING_WALLET_ADDRESS_ERROR_CODE
    );
  }
  const path = `${walletPath}/${req.chain}`;
  await mkdirIfDoesNotExist(path);
  await fse.writeFile(`${path}/${address}.json`, encryptedPrivateKey);
  return { address };
}

export async function removeWallet(req: RemoveWalletRequest): Promise<void> {
  logger.info(`Removing wallet: ${req.address} from chain: ${req.chain}`);
  await fse.remove(`${walletPath}/${req.chain}/${req.address}.json`);
}

export async function signMessage(req: SignMessageRequest): Promise<SignMessageResponse> {
  logger.info(`Signing message for wallet: ${req.address} on chain: ${req.chain}`);
  const connection = await getInitializedChain(req.chain, req.network);
  const wallet = await (connection as any).getWallet(req.address);
  const signature = await wallet.signMessage(req.message);
  return { signature };
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

export async function getWallets(): Promise<GetWalletResponse[]> {
  logger.info('Getting all wallets');
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
}
