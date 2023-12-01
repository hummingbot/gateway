import fse from 'fs-extra';
import { Xdc } from '../../chains/xdc/xdc';
import { Cosmos } from '../../chains/cosmos/cosmos';
import { Tezos } from '../../chains/tezos/tezos';
import { XRPL } from '../../chains/xrpl/xrpl';
import { Kujira } from '../../chains/kujira/kujira';

import {
  AddWalletRequest,
  AddWalletResponse,
  RemoveWalletRequest,
  GetWalletResponse,
  WalletSignRequest,
  WalletSignResponse,
} from './wallet.requests';

import { ConfigManagerCertPassphrase } from '../config-manager-cert-passphrase';

import {
  ERROR_RETRIEVING_WALLET_ADDRESS_ERROR_CODE,
  ERROR_RETRIEVING_WALLET_ADDRESS_ERROR_MESSAGE,
  ACCOUNT_NOT_SPECIFIED_CODE,
  ACCOUNT_NOT_SPECIFIED_ERROR_MESSAGE,
  HttpException,
  UNKNOWN_CHAIN_ERROR_CODE,
  UNKNOWN_KNOWN_CHAIN_ERROR_MESSAGE,
} from '../error-handler';
import { EthereumBase } from '../../chains/ethereum/ethereum-base';
import { Near } from '../../chains/near/near';
import {
  ChainUnion,
  getInitializedChain,
  UnsupportedChainException,
} from '../connection-manager';
import { Ethereumish, Tezosish } from '../common-interfaces';
import { Algorand } from '../../chains/algorand/algorand';

export function convertXdcAddressToEthAddress(publicKey: string): string {
  return publicKey.length === 43 && publicKey.slice(0, 3) === 'xdc'
    ? '0x' + publicKey.slice(3)
    : publicKey;
}

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
  let connection: ChainUnion;
  let address: string | undefined;
  let encryptedPrivateKey: string | undefined;

  if (req.chain === 'near') {
    if (!('address' in req)) {
      throw new HttpException(
        500,
        ACCOUNT_NOT_SPECIFIED_ERROR_MESSAGE(),
        ACCOUNT_NOT_SPECIFIED_CODE
      );
    }
  }

  try {
    connection = await getInitializedChain<ChainUnion>(req.chain, req.network);
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
    if (connection instanceof Algorand) {
      address = connection.getAccountFromPrivateKey(req.privateKey).addr;
      encryptedPrivateKey = connection.encrypt(req.privateKey, passphrase);
    } else if (connection instanceof EthereumBase) {
      address = connection.getWalletFromPrivateKey(req.privateKey).address;
      encryptedPrivateKey = await connection.encrypt(
        req.privateKey,
        passphrase
      );
    } else if (connection instanceof Xdc) {
      address = convertXdcAddressToEthAddress(
        connection.getWalletFromPrivateKey(req.privateKey).address
      );
      encryptedPrivateKey = await connection.encrypt(
        req.privateKey,
        passphrase
      );
    } else if (connection instanceof Cosmos) {
      const wallet = await (connection as Cosmos).getAccountsfromPrivateKey(
        req.privateKey,
        'cosmos'
      );
      address = wallet.address;
      encryptedPrivateKey = await (connection as Cosmos).encrypt(
        req.privateKey,
        passphrase
      );
    } else if (connection instanceof Near) {
      address = (
        await connection.getWalletFromPrivateKey(
          req.privateKey,
          <string>req.address
        )
      ).accountId;
      encryptedPrivateKey = connection.encrypt(req.privateKey, passphrase);
    } else if (connection instanceof Tezos) {
      const tezosWallet = await connection.getWalletFromPrivateKey(
        req.privateKey
      );
      address = await tezosWallet.signer.publicKeyHash();
      encryptedPrivateKey = connection.encrypt(req.privateKey, passphrase);
    } else if (connection instanceof Kujira) {
      const mnemonic = req.privateKey;
      const accountNumber = Number(req.accountId);
      address = await connection.getWalletPublicKey(mnemonic, accountNumber);

      if (accountNumber !== undefined) {
        encryptedPrivateKey = await connection.encrypt(
          mnemonic,
          accountNumber,
          address
        );
      } else {
        throw new Error('Kujira wallet requires an account number.');
      }
    } else if (connection instanceof XRPL) {
      address = connection.getWalletFromSeed(req.privateKey).classicAddress;
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

// if the file does not exist, this should not fail
export async function removeWallet(req: RemoveWalletRequest): Promise<void> {
  await fse.remove(`./conf/wallets/${req.chain}/${req.address}.json`);
}

export async function signMessage(
  req: WalletSignRequest
): Promise<WalletSignResponse> {
  if (req.chain === 'tezos') {
    const chain: Tezosish = await getInitializedChain(req.chain, req.network);
    const wallet = await chain.getWallet(req.address);
    return {
      signature: (await wallet.signer.sign('0x03' + req.message)).sbytes.slice(
        4
      ),
    };
  } else {
    const chain: Ethereumish = await getInitializedChain(
      req.chain,
      req.network
    );
    const wallet = await chain.getWallet(req.address);
    return { signature: await wallet.signMessage(req.message) };
  }
}

export async function getDirectories(source: string): Promise<string[]> {
  await mkdirIfDoesNotExist(walletPath);
  const files = await fse.readdir(source, { withFileTypes: true });
  return files
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
}

export function getLastPath(path: string): string {
  return path.split('/').slice(-1)[0];
}

export function dropExtension(path: string): string {
  return path.substr(0, path.lastIndexOf('.')) || path;
}

export async function getJsonFiles(source: string): Promise<string[]> {
  const files = await fse.readdir(source, { withFileTypes: true });
  return files
    .filter((f) => f.isFile() && f.name.endsWith('.json'))
    .map((f) => f.name);
}

export async function getWallets(): Promise<GetWalletResponse[]> {
  const chains = await getDirectories(walletPath);

  const responses: GetWalletResponse[] = [];

  for (const chain of chains) {
    const walletFiles = await getJsonFiles(`${walletPath}/${chain}`);

    const response: GetWalletResponse = { chain, walletAddresses: [] };

    for (const walletFile of walletFiles) {
      const address = dropExtension(getLastPath(walletFile));
      response.walletAddresses.push(address);
    }

    responses.push(response);
  }

  return responses;
}
