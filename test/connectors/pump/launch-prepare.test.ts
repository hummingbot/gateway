/**
 * prepareCreateToken validation: the on-chain byte limits, on the metadataUri
 * the caller pinned.
 */
import { prepareCreateToken } from '../../../src/connectors/pump/launch-routes/createToken';

describe('prepareCreateToken', () => {
  it('uses the given metadataUri verbatim and generates a mint keypair', async () => {
    const prepared = await prepareCreateToken({
      name: 'My Token',
      symbol: 'MTK',
      metadataUri: 'https://ipfs.io/ipfs/QmSomething',
    });

    expect(prepared.metadataUri).toBe('https://ipfs.io/ipfs/QmSomething');
    expect(prepared.mintKeypair.publicKey.toBase58()).toHaveLength(44);
  });

  it('enforces the on-chain byte limits', async () => {
    await expect(prepareCreateToken({ name: 'x'.repeat(33), symbol: 'T', metadataUri: 'https://a' })).rejects.toThrow(
      /name exceeds/,
    );
    await expect(prepareCreateToken({ name: 'T', symbol: 'x'.repeat(14), metadataUri: 'https://a' })).rejects.toThrow(
      /symbol exceeds/,
    );
    await expect(
      prepareCreateToken({ name: 'T', symbol: 'T', metadataUri: `https://${'x'.repeat(200)}` }),
    ).rejects.toThrow(/metadataUri exceeds/);
    // Multibyte characters count in bytes, not code points: 11 emoji = 44 bytes.
    await expect(prepareCreateToken({ name: '🚀'.repeat(11), symbol: 'T', metadataUri: 'https://a' })).rejects.toThrow(
      /name exceeds/,
    );
  });
});
