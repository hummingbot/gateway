/**
 * Route-level tests for /trading/launch/create-token and /build-create-token:
 * dispatch to the pump connector, the build variant composing mint +
 * metadataUri onto the captured transaction, and schema-level validation.
 */
import { Keypair } from '@solana/web3.js';

import { UnsignedTransactionCaptured } from '../../../src/chains/solana/solana-build-mode';
import { fastifyWithTypeProvider } from '../../utils/testUtils';

jest.mock('../../../src/connectors/pump/launch-routes/createToken', () => ({
  createToken: jest.fn(),
  prepareCreateToken: jest.fn(),
}));

const WALLET = '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5';
const MINT_KEYPAIR = Keypair.generate();
const METADATA_URI = 'https://ipfs.io/ipfs/QmTest';

const FAKE_BUILT = {
  transaction: Buffer.from('unsigned-tx').toString('base64'),
  feePayer: WALLET,
  recentBlockhash: 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N',
  lastValidBlockHeight: 424242,
  currentBlockHeight: 424100,
  extraSigners: [{ pubkey: MINT_KEYPAIR.publicKey.toBase58(), signature: 'c2ln' }],
};

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { createTokenRoute } = await import('../../../src/trading/trading-launch-routes/create-token');
  await server.register(createTokenRoute);
  return server;
};

const basePayload = {
  connector: 'pump',
  chainNetwork: 'solana-mainnet-beta',
  walletAddress: WALLET,
  name: 'My Token',
  symbol: 'MTK',
  metadataUri: METADATA_URI,
};

describe('POST /trading/launch/create-token and /build-create-token', () => {
  let server: any;
  let createToken: jest.Mock;
  let prepareCreateToken: jest.Mock;

  beforeAll(async () => {
    server = await buildApp();
    const mocked = require('../../../src/connectors/pump/launch-routes/createToken');
    createToken = mocked.createToken;
    prepareCreateToken = mocked.prepareCreateToken;
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    createToken.mockReset();
    prepareCreateToken.mockReset();
    prepareCreateToken.mockResolvedValue({ mintKeypair: MINT_KEYPAIR, metadataUri: METADATA_URI });
  });

  it('creates a token through the pump connector', async () => {
    createToken.mockResolvedValue({
      signature: 'create-sig',
      status: 1,
      mint: MINT_KEYPAIR.publicKey.toBase58(),
      metadataUri: METADATA_URI,
      data: { fee: 0.00001 },
    });

    const response = await server.inject({ method: 'POST', url: '/create-token', payload: basePayload });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.signature).toBe('create-sig');
    expect(body.mint).toBe(MINT_KEYPAIR.publicKey.toBase58());
    expect(body.metadataUri).toBe(METADATA_URI);
    expect(createToken).toHaveBeenCalledWith(
      'mainnet-beta',
      WALLET,
      expect.objectContaining({ name: 'My Token', symbol: 'MTK', metadataUri: METADATA_URI }),
      { mintKeypair: MINT_KEYPAIR, metadataUri: METADATA_URI },
    );
  });

  it('passes the dev buy through to the connector', async () => {
    createToken.mockResolvedValue({
      signature: 'create-sig',
      status: 1,
      mint: MINT_KEYPAIR.publicKey.toBase58(),
      metadataUri: METADATA_URI,
      data: { fee: 0.00001, tokenAmountBought: 33000, quoteTokenAmountSpent: 1 },
    });

    const response = await server.inject({
      method: 'POST',
      url: '/create-token',
      payload: { ...basePayload, devBuyAmount: 1 },
    });

    expect(response.statusCode).toBe(200);
    // DecimalNumber fields serialize as strings on the wire.
    expect(Number(JSON.parse(response.body).data.tokenAmountBought)).toBe(33000);
    expect(createToken).toHaveBeenCalledWith(
      'mainnet-beta',
      WALLET,
      expect.objectContaining({ devBuyAmount: 1 }),
      expect.anything(),
    );
  });

  it('build-create-token returns the captured transaction plus mint and metadataUri', async () => {
    createToken.mockImplementation(async () => {
      throw new UnsignedTransactionCaptured(FAKE_BUILT);
    });

    const response = await server.inject({ method: 'POST', url: '/build-create-token', payload: basePayload });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      ...FAKE_BUILT,
      mint: MINT_KEYPAIR.publicKey.toBase58(),
      metadataUri: METADATA_URI,
    });
  });

  it('rejects a name over the schema limit before any connector code runs', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/create-token',
      payload: { ...basePayload, name: 'x'.repeat(33) },
    });

    expect(response.statusCode).toBe(400);
    expect(prepareCreateToken).not.toHaveBeenCalled();
  });

  it('rejects an unknown connector at the schema', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/create-token',
      payload: { ...basePayload, connector: 'orca' },
    });

    expect(response.statusCode).toBe(400);
    expect(prepareCreateToken).not.toHaveBeenCalled();
  });

  it('refuses a LaunchLab term on another launchpad rather than ignore it', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/create-token',
      payload: { ...basePayload, supply: 1_000_000_000, sellSharePct: 80 },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload).message).toMatch(/supply, sellSharePct are for raydium launches/);
    expect(prepareCreateToken).not.toHaveBeenCalled();
  });

  it('refuses a DBC configAddress on another launchpad rather than ignore it', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/create-token',
      payload: { ...basePayload, configAddress: 'So11111111111111111111111111111111111111112' },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload).message).toMatch(/configAddress is for meteora launches/);
    expect(prepareCreateToken).not.toHaveBeenCalled();
  });

  it('surfaces a connector-side validation error as its own status', async () => {
    const { httpErrors } = require('../../../src/services/error-handler');
    prepareCreateToken.mockRejectedValue(httpErrors.badRequest('Pass exactly one of metadataUri or imageUrl.'));

    const response = await server.inject({
      method: 'POST',
      url: '/create-token',
      payload: basePayload,
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/exactly one of/);
  });
});
