/**
 * Wallet records, read from conf/wallets/{chain}/ (see docs/signer-seam.md).
 *
 *   {address}.json          local     the encrypted key, one file per wallet
 *   hardware-wallets.json   hardware  {wallets: [{address, publicKey, derivationPath, addedAt}]}
 *   external-wallets.json   external  {wallets: [{address, addedAt}]}
 *   privy-wallets.json      privy     {wallets: [{address, privyWalletId, addedAt}]}
 *
 * The signer kind comes from which file names the address. Existing files load with no
 * change, and nothing here rewrites a file it reads. An address named by two files is an
 * error: Gateway does not choose a signer for it.
 */
import { PublicKey } from '@solana/web3.js';
import { utils } from 'ethers';
import fse from 'fs-extra';

import { httpErrors } from '../../services/error-handler';

import { SignerKind, WalletChain, WalletRecord } from './types';

export const walletPath = './conf/wallets';

export const WALLET_CHAINS: WalletChain[] = ['ethereum', 'solana'];

/** The list file of each signer kind that is not one key file per wallet. */
export const LIST_STORE_FILES: Record<Exclude<SignerKind, 'local'>, string> = {
  hardware: 'hardware-wallets.json',
  external: 'external-wallets.json',
  privy: 'privy-wallets.json',
};

/** One entry of a list store. Hardware entries also carry `publicKey`. */
export interface ListStoreEntry {
  address: string;
  addedAt?: string;
  publicKey?: string;
  derivationPath?: string;
  privyWalletId?: string;
}

export function asWalletChain(chain: string): WalletChain {
  const lower = chain.toLowerCase();
  if (!(WALLET_CHAINS as string[]).includes(lower)) {
    throw httpErrors.badRequest(`Unrecognized chain name: ${chain}. Wallets exist for ${WALLET_CHAINS.join(', ')}.`);
  }
  return lower as WalletChain;
}

/** The address in its canonical form for the chain, or a 400. */
export function canonicalAddress(chain: WalletChain, address: string): string {
  if (chain === 'ethereum') {
    try {
      return utils.getAddress(address);
    } catch {
      throw httpErrors.badRequest(`Invalid Ethereum address format: ${address}`);
    }
  }
  try {
    const key = new PublicKey(address);
    if (key.toBase58() !== address) throw new Error('not canonical base58');
    return address;
  } catch {
    throw httpErrors.badRequest(`Invalid Solana address format: ${address}`);
  }
}

function sameAddress(chain: WalletChain, a: string, b: string): boolean {
  return chain === 'ethereum' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function chainDir(chain: WalletChain): string {
  return `${walletPath}/${chain}`;
}

/** The key file of a local wallet. The address is canonicalized first, so it is a safe path. */
export function localKeyFilePath(chain: WalletChain, address: string): string {
  return `${chainDir(chain)}/${canonicalAddress(chain, address)}.json`;
}

function listStorePath(chain: WalletChain, kind: Exclude<SignerKind, 'local'>): string {
  return `${chainDir(chain)}/${LIST_STORE_FILES[kind]}`;
}

/** The entries of a list store; [] when the file does not exist, an error when it is malformed. */
export async function readListStore(chain: WalletChain, kind: Exclude<SignerKind, 'local'>): Promise<ListStoreEntry[]> {
  const path = listStorePath(chain, kind);
  if (!(await fse.pathExists(path))) return [];
  let data: any;
  try {
    data = JSON.parse(await fse.readFile(path, 'utf8'));
  } catch (e: any) {
    throw httpErrors.internalServerError(`${path} is not valid JSON: ${e.message}`);
  }
  if (!data || !Array.isArray(data.wallets)) {
    throw httpErrors.internalServerError(`${path} has no "wallets" array`);
  }
  return data.wallets;
}

export async function writeListStore(
  chain: WalletChain,
  kind: Exclude<SignerKind, 'local'>,
  entries: ListStoreEntry[],
): Promise<void> {
  await fse.ensureDir(chainDir(chain));
  await fse.writeFile(listStorePath(chain, kind), JSON.stringify({ wallets: entries }, null, 2));
}

const listStoreLocks = new Map<string, Promise<unknown>>();

/**
 * Read, change and write one list store with no other update to the same file in between,
 * so two concurrent adds (or an add and a remove) cannot drop each other's entries.
 * `update` may throw to abort; the file is then left as it was.
 */
export async function updateListStore<T>(
  chain: WalletChain,
  kind: Exclude<SignerKind, 'local'>,
  update: (entries: ListStoreEntry[]) => Promise<{ entries: ListStoreEntry[]; result: T }>,
): Promise<T> {
  const path = listStorePath(chain, kind);
  const previous = listStoreLocks.get(path) ?? Promise.resolve();
  const run = previous
    .catch(() => undefined)
    .then(async () => {
      const { entries, result } = await update(await readListStore(chain, kind));
      await writeListStore(chain, kind, entries);
      return result;
    });
  listStoreLocks.set(path, run);
  try {
    return await run;
  } finally {
    if (listStoreLocks.get(path) === run) listStoreLocks.delete(path);
  }
}

/** Addresses that have a local key file. Other .json files in the directory are list stores. */
async function localAddresses(chain: WalletChain): Promise<string[]> {
  const dir = chainDir(chain);
  if (!(await fse.pathExists(dir))) return [];
  const listFiles = new Set(Object.values(LIST_STORE_FILES));
  const files = await fse.readdir(dir, { withFileTypes: true });
  return files
    .filter((f) => f.isFile() && f.name.endsWith('.json') && !listFiles.has(f.name))
    .map((f) => f.name.slice(0, -'.json'.length))
    .flatMap((name) => {
      try {
        // Ethereum key files are named by the checksummed address; read any casing.
        return [canonicalAddress(chain, chain === 'ethereum' ? name.toLowerCase() : name)];
      } catch {
        return [];
      }
    });
}

/** Every wallet record of a chain, in store order: local, hardware, external, privy. */
export async function listWalletRecords(chainName: string): Promise<WalletRecord[]> {
  const chain = asWalletChain(chainName);
  const records: WalletRecord[] = (await localAddresses(chain)).map((address) => ({
    chain,
    address,
    signer: 'local',
  }));
  for (const kind of Object.keys(LIST_STORE_FILES) as Exclude<SignerKind, 'local'>[]) {
    for (const entry of await readListStore(chain, kind)) {
      records.push({
        chain,
        address: entry.address,
        signer: kind,
        derivationPath: entry.derivationPath,
        privyWalletId: entry.privyWalletId,
        addedAt: entry.addedAt,
      });
    }
  }
  return records;
}

function storeName(record: WalletRecord): string {
  return record.signer === 'local' ? `${record.address}.json (local key)` : LIST_STORE_FILES[record.signer];
}

/** The record of one wallet, or undefined when Gateway does not know the address. */
export async function findWalletRecord(chainName: string, address: string): Promise<WalletRecord | undefined> {
  const chain = asWalletChain(chainName);
  const canonical = canonicalAddress(chain, address);
  const matches = (await listWalletRecords(chain)).filter((r) => sameAddress(chain, r.address, canonical));
  if (matches.length > 1) {
    throw httpErrors.internalServerError(
      `Wallet ${canonical} is listed by more than one signer store (${matches.map(storeName).join(', ')}). ` +
        'Remove it from all but one with DELETE /wallet/remove, then add it again.',
    );
  }
  return matches[0];
}

/** The record of one wallet, or a 404 that says how to add it. */
export async function getWalletRecord(chainName: string, address: string): Promise<WalletRecord> {
  const record = await findWalletRecord(chainName, address);
  if (!record) {
    throw httpErrors.notFound(
      `Wallet ${address} is not registered in Gateway for ${chainName}. Add it with POST /wallet/add, ` +
        'POST /wallet/add-hardware, POST /wallet/add-external or POST /wallet/add-privy.',
    );
  }
  return record;
}
