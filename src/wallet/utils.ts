import { FastifyInstance } from 'fastify';
import fse from 'fs-extra';

import { Ethereum } from '../chains/ethereum/ethereum';
import { Solana } from '../chains/solana/solana';
import { updateDefaultWallet } from '../config/utils';
import { ConfigManagerCertPassphrase } from '../services/config-manager-cert-passphrase';
import { ConfigManagerV2 } from '../services/config-manager-v2';
import {
  getInitializedChain,
  UnsupportedChainException,
  Chain,
  getSupportedChains,
} from '../services/connection-manager';
import { httpErrors } from '../services/error-handler';
import { logger } from '../services/logger';

import { PrivyWallet } from './privy/privy-client';
import { AddWalletRequest, AddWalletResponse, GetWalletResponse, PrivyWalletResponse } from './schemas';
import { SignerKind, WalletChain } from './signers/types';
import {
  asWalletChain,
  canonicalAddress,
  findWalletRecord,
  getWalletRecord,
  ListStoreEntry,
  listWalletRecords,
  localKeyFilePath,
  readListStore,
  walletPath,
  WALLET_CHAINS,
  writeListStore,
} from './signers/wallet-store';

// Validate chain name against known chains to prevent injection
export function validateChainName(chain: string): boolean {
  if (!chain) return false;
  return getSupportedChains().includes(chain.toLowerCase());
}

/** A 400 when the address already has a signer of another kind: one address, one signer. */
async function assertNotRegisteredAs(chain: WalletChain, address: string, kind: SignerKind): Promise<void> {
  const existing = await findWalletRecord(chain, address);
  if (existing && existing.signer !== kind) {
    throw httpErrors.badRequest(
      `Wallet ${address} is already registered as a ${existing.signer} wallet. ` +
        'Remove it with DELETE /wallet/remove before adding it with another signer.',
    );
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
    connection = await getInitializedChain(req.chain, network);
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

  const chain = asWalletChain(req.chain);
  await assertNotRegisteredAs(chain, address, 'local');

  // Write the encrypted key file owner-readable only (hummingbot/gateway#652).
  await fse.ensureDir(`${walletPath}/${chain}`);
  const walletFilePath = localKeyFilePath(chain, address);
  await fse.writeFile(walletFilePath, encryptedPrivateKey, { mode: 0o600 });
  await fse.chmod(walletFilePath, 0o600);

  // Update default wallet if requested
  if (req.setDefault) {
    updateDefaultWallet(fastify, req.chain, address);
  }

  return { address };
}

/** Add an address-only wallet: Gateway builds for it and never signs (#682). */
export async function addExternalWallet(
  fastify: FastifyInstance,
  chainName: string,
  addressInput: string,
  setDefault?: boolean,
): Promise<{ address: string; signer: 'external' }> {
  const chain = asWalletChain(chainName);
  const address = canonicalAddress(chain, addressInput);
  await assertNotRegisteredAs(chain, address, 'external');

  const entries = await readListStore(chain, 'external');
  if (!entries.some((e) => e.address === address)) {
    entries.push({ address, addedAt: new Date().toISOString() });
    await writeListStore(chain, 'external', entries);
  }
  if (setDefault) {
    updateDefaultWallet(fastify, chain, address);
  }
  return { address, signer: 'external' };
}

/**
 * Add a Privy server wallet that Privy has returned (by id, or just created). Gateway
 * stores its id and address only; Privy holds the key and signs.
 */
export async function addPrivyWallet(
  fastify: FastifyInstance,
  chainName: string,
  wallet: PrivyWallet,
  setDefault?: boolean,
): Promise<PrivyWalletResponse> {
  const chain = asWalletChain(chainName);
  if (wallet.chain_type !== chain) {
    throw httpErrors.badRequest(`Privy wallet ${wallet.id} is a ${wallet.chain_type} wallet, not ${chain}`);
  }
  const address = canonicalAddress(chain, wallet.address);
  await assertNotRegisteredAs(chain, address, 'privy');

  const entries = await readListStore(chain, 'privy');
  const existing = entries.find((e) => e.address === address);
  if (existing && existing.privyWalletId !== wallet.id) {
    throw httpErrors.badRequest(
      `Wallet ${address} is already registered with Privy wallet id ${existing.privyWalletId}. ` +
        'Remove it with DELETE /wallet/remove first.',
    );
  }
  if (!existing) {
    entries.push({ address, privyWalletId: wallet.id, addedAt: new Date().toISOString() });
    await writeListStore(chain, 'privy', entries);
    logger.info(`Added Privy wallet ${address} (${wallet.id}) on ${chain}`);
  }
  if (setDefault) {
    updateDefaultWallet(fastify, chain, address);
  }
  return { address, privyWalletId: wallet.id, signer: 'privy' };
}

/**
 * Remove a wallet of any signer kind: its key file (local) or its entry in its list
 * store. When it was the chain's default, the next remaining wallet becomes the default.
 */
export async function removeWallet(chainName: string, addressInput: string): Promise<SignerKind> {
  const chain = asWalletChain(chainName);
  const record = await getWalletRecord(chain, canonicalAddress(chain, addressInput));
  logger.info(`Removing ${record.signer} wallet ${record.address} from chain ${chain}`);

  if (record.signer === 'local') {
    await fse.remove(localKeyFilePath(chain, record.address));
  } else {
    const entries = await readListStore(chain, record.signer);
    await writeListStore(
      chain,
      record.signer,
      entries.filter((e: ListStoreEntry) => e.address !== record.address),
    );
  }

  const currentDefault: string | undefined = ConfigManagerV2.getInstance().get(`${chain}.defaultWallet`);
  if (currentDefault && currentDefault.toLowerCase() === record.address.toLowerCase()) {
    const remaining = await listWalletRecords(chain);
    const next = remaining.length > 0 ? remaining[0].address : '';
    ConfigManagerV2.getInstance().set(`${chain}.defaultWallet`, next);
    logger.info(next ? `Set new default wallet for ${chain}: ${next}` : `Cleared default wallet for ${chain}`);
  }
  return record.signer;
}

export async function getWallets(showHardware: boolean = true): Promise<GetWalletResponse[]> {
  logger.info('Getting all wallets');
  const responses: GetWalletResponse[] = [];
  for (const chain of WALLET_CHAINS) {
    const records = (await listWalletRecords(chain)).filter((r) => showHardware || r.signer !== 'hardware');
    const hardware = records.filter((r) => r.signer === 'hardware').map((r) => r.address);
    responses.push({
      chain,
      walletAddresses: records.filter((r) => r.signer === 'local').map((r) => r.address),
      hardwareWalletAddresses: hardware.length > 0 ? hardware : undefined,
      wallets: records.map((r) => ({ address: r.address, signer: r.signer })),
    });
  }
  return responses;
}

// Hardware wallet registry (conf/wallets/{chain}/hardware-wallets.json)
export interface HardwareWalletData {
  address: string;
  publicKey: string;
  derivationPath: string;
  addedAt: string;
}

export async function getHardwareWallets(chain: string): Promise<HardwareWalletData[]> {
  return (await readListStore(asWalletChain(chain), 'hardware')) as HardwareWalletData[];
}

export async function saveHardwareWallets(chain: string, wallets: HardwareWalletData[]): Promise<void> {
  const walletChain = asWalletChain(chain);
  for (const wallet of wallets) {
    await assertNotRegisteredAs(walletChain, wallet.address, 'hardware');
  }
  await writeListStore(walletChain, 'hardware', wallets);
}
