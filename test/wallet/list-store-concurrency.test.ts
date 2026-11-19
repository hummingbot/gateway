/**
 * Every wallet list store (external, hardware, privy) is changed through updateListStore,
 * so concurrent saves cannot drop each other's entries. The file reads here
 * are slowed down so that, without the lock, both requests would read the list before
 * either writes it.
 */
import { Keypair } from '@solana/web3.js';
import * as fse from 'fs-extra';

jest.mock('fs-extra');
jest.mock('../../src/config/utils');

import { getWalletRecord } from '../../src/wallet/signers/wallet-store';
import { addExternalWallet, upsertHardwareWallet } from '../../src/wallet/utils';
import { MemoryFs } from '../helpers/memory-fs';

const fastify = {} as any;
const address = () => Keypair.generate().publicKey.toBase58();

describe('wallet list stores under concurrent changes', () => {
  let memoryFs: MemoryFs;

  beforeEach(() => {
    memoryFs = new MemoryFs();
    memoryFs.install();
    const read = (fse.readFile as jest.Mock).getMockImplementation();
    (fse.readFile as jest.Mock).mockImplementation(async (...args: unknown[]) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return read(...args);
    });
  });

  it('keeps both external wallets added at once', async () => {
    const [a, b] = [address(), address()];

    await Promise.all([addExternalWallet(fastify, 'solana', a), addExternalWallet(fastify, 'solana', b)]);

    expect(memoryFs.listStore('solana', 'external-wallets.json').sort()).toEqual([a, b].sort());
  });

  it('keeps both hardware wallets saved at once', async () => {
    const [a, b] = [address(), address()];
    const ledger = (addr: string, index: number) => ({
      address: addr,
      publicKey: addr,
      derivationPath: `44'/501'/${index}'`,
      addedAt: '2026-10-20T00:00:00.000Z',
    });

    const replaced = await Promise.all([
      upsertHardwareWallet('solana', ledger(a, 0)),
      upsertHardwareWallet('solana', ledger(b, 1)),
    ]);

    expect(replaced).toEqual([false, false]);
    expect(memoryFs.listStore('solana', 'hardware-wallets.json').sort()).toEqual([a, b].sort());
  });

  it('replaces the entry of a hardware wallet saved again', async () => {
    const a = address();
    await upsertHardwareWallet('solana', { address: a, publicKey: a, derivationPath: "44'/501'/0'", addedAt: 'x' });

    const replaced = await upsertHardwareWallet('solana', {
      address: a,
      publicKey: a,
      derivationPath: "44'/501'/3'",
      addedAt: 'y',
    });

    expect(replaced).toBe(true);
    expect((await getWalletRecord('solana', a)).derivationPath).toBe("44'/501'/3'");
  });

  it('names /wallet/add-privy in the 404 for an unknown address', async () => {
    await expect(getWalletRecord('solana', address())).rejects.toMatchObject({
      statusCode: 404,
      message: expect.stringContaining('POST /wallet/add-privy'),
    });
  });
});
