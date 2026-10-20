/**
 * meteora-dbc prepareCreateToken: the metadataUri-only contract, the pump-only
 * parameters being refused rather than ignored, the configured partner config
 * requirement, and the pool PDA being derived up front.
 */
import { PublicKey } from '@solana/web3.js';

jest.mock('../../../../src/connectors/meteora/meteora-dbc', () => {
  const actual = jest.requireActual('../../../../src/connectors/meteora/meteora-dbc');
  // getInstance is stubbed; the prototype stays real so requireConfigAddress can be called as-is.
  return { MeteoraDbc: { getInstance: jest.fn(), prototype: actual.MeteoraDbc.prototype } };
});

import { prepareCreateToken } from '../../../../src/connectors/meteora/launch-routes/createToken';
import { MeteoraDbc } from '../../../../src/connectors/meteora/meteora-dbc';

const CONFIG = PublicKey.unique();
const POOL = PublicKey.unique();

const fakeDbc: any = {
  requireConfigAddress: jest.fn(() => CONFIG),
  derivePoolAddress: jest.fn(async () => POOL),
};

beforeEach(() => {
  jest.clearAllMocks();
  (MeteoraDbc.getInstance as jest.Mock).mockResolvedValue(fakeDbc);
});

describe('meteora-dbc prepareCreateToken', () => {
  it('generates a mint keypair and derives the pool it will create', async () => {
    const prepared = await prepareCreateToken('mainnet-beta', {
      name: 'Launch Test',
      symbol: 'CTEST',
      metadataUri: 'https://example.com/ctest.json',
    });

    expect(prepared.metadataUri).toBe('https://example.com/ctest.json');
    expect(prepared.mintKeypair.publicKey.toBase58()).toHaveLength(44);
    expect(prepared.poolAddress).toBe(POOL.toBase58());
    expect(fakeDbc.derivePoolAddress).toHaveBeenCalledWith(CONFIG, prepared.mintKeypair.publicKey);
    // Each prepare is a new identity: a rebuild after blockhash expiry is a new mint.
    const again = await prepareCreateToken('mainnet-beta', { name: 'x', symbol: 'X', metadataUri: 'https://a' });
    expect(again.mintKeypair.publicKey.equals(prepared.mintKeypair.publicKey)).toBe(false);
  });

  it('requires metadataUri and refuses the pump-only parameters', async () => {
    await expect(prepareCreateToken('mainnet-beta', { name: 'T', symbol: 'T' })).rejects.toThrow(
      /metadataUri is required/,
    );
    await expect(
      prepareCreateToken('mainnet-beta', { name: 'T', symbol: 'T', metadataUri: 'https://a', imageUrl: 'https://i' }),
    ).rejects.toThrow(/does not upload metadata/);
    await expect(
      prepareCreateToken('mainnet-beta', { name: 'T', symbol: 'T', metadataUri: 'https://a', devBuyAmount: 1 }),
    ).rejects.toThrow(/firstBuySol/);
    await expect(
      prepareCreateToken('mainnet-beta', { name: 'T', symbol: 'T', metadataUri: 'https://a', firstBuySol: -1 }),
    ).rejects.toThrow(/non-negative/);
    expect(fakeDbc.derivePoolAddress).not.toHaveBeenCalled();
  });

  it('launches from a named configAddress instead of the configured one', async () => {
    const own = PublicKey.unique();
    const prepared = await prepareCreateToken('mainnet-beta', {
      name: 'T',
      symbol: 'T',
      metadataUri: 'https://a',
      configAddress: own.toBase58(),
    });
    expect(fakeDbc.derivePoolAddress).toHaveBeenCalledWith(own, prepared.mintKeypair.publicKey);
    expect(fakeDbc.requireConfigAddress).not.toHaveBeenCalled();
    await expect(
      prepareCreateToken('mainnet-beta', { name: 'T', symbol: 'T', metadataUri: 'https://a', configAddress: 'nope' }),
    ).rejects.toThrow(/configAddress is not a base58 address/);
  });

  it('enforces the on-chain URI byte limit', async () => {
    await expect(
      prepareCreateToken('mainnet-beta', { name: 'T', symbol: 'T', metadataUri: 'https://' + 'x'.repeat(200) }),
    ).rejects.toThrow(/metadataUri exceeds/);
  });

  it('refuses to launch when no partner config is configured', async () => {
    const requireConfigAddress = (MeteoraDbc.prototype as any).requireConfigAddress as (this: unknown) => PublicKey;
    expect(() => requireConfigAddress.call({ config: { configAddress: '' } })).toThrow(/No DBC config to launch from/);
    expect(() => requireConfigAddress.call({ config: { configAddress: 'not-a-key' } })).toThrow(/not a valid/);
    expect(requireConfigAddress.call({ config: { configAddress: CONFIG.toBase58() } }).equals(CONFIG)).toBe(true);
  });
});
