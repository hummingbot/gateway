/**
 * prepareCreateToken validation: the on-chain byte limits, the
 * metadataUri-XOR-imageUrl contract, and metadata upload delegation.
 */
jest.mock('../../../src/connectors/pump/pump.utils', () => ({
  ...jest.requireActual('../../../src/connectors/pump/pump.utils'),
  uploadTokenMetadata: jest.fn(),
}));

import { prepareCreateToken } from '../../../src/connectors/pump/launch-routes/createToken';
import { uploadTokenMetadata } from '../../../src/connectors/pump/pump.utils';

const upload = uploadTokenMetadata as jest.Mock;

beforeEach(() => {
  upload.mockReset();
});

describe('prepareCreateToken', () => {
  it('uses a given metadataUri verbatim and generates a mint keypair', async () => {
    const prepared = await prepareCreateToken({
      name: 'My Token',
      symbol: 'MTK',
      metadataUri: 'https://ipfs.io/ipfs/QmSomething',
    });

    expect(prepared.metadataUri).toBe('https://ipfs.io/ipfs/QmSomething');
    expect(prepared.mintKeypair.publicKey.toBase58()).toHaveLength(44);
    expect(upload).not.toHaveBeenCalled();
  });

  it('uploads metadata when given an imageUrl', async () => {
    upload.mockResolvedValue('https://ipfs.io/ipfs/QmUploaded');

    const prepared = await prepareCreateToken({
      name: 'My Token',
      symbol: 'MTK',
      imageUrl: 'https://img.example/logo.png',
      description: 'the best token',
      twitter: 'https://x.com/mytoken',
    });

    expect(prepared.metadataUri).toBe('https://ipfs.io/ipfs/QmUploaded');
    expect(upload).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ name: 'My Token', symbol: 'MTK', imageUrl: 'https://img.example/logo.png' }),
    );
  });

  it('rejects both or neither of metadataUri and imageUrl', async () => {
    await expect(prepareCreateToken({ name: 'T', symbol: 'T' })).rejects.toThrow(/exactly one of metadataUri/);
    await expect(
      prepareCreateToken({ name: 'T', symbol: 'T', metadataUri: 'https://a', imageUrl: 'https://b' }),
    ).rejects.toThrow(/exactly one of metadataUri/);
    expect(upload).not.toHaveBeenCalled();
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

  it('enforces the uri limit on an uploaded metadataUri too', async () => {
    upload.mockResolvedValue(`https://${'x'.repeat(200)}`);
    await expect(
      prepareCreateToken({ name: 'T', symbol: 'T', imageUrl: 'https://img.example/logo.png' }),
    ).rejects.toThrow(/metadataUri exceeds/);
  });
});
