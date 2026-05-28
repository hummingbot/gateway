import { Pancakeswap } from '../../../../src/connectors/pancakeswap/pancakeswap';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/connectors/pancakeswap/pancakeswap');

const TOKEN_ID = '1234';
const WALLET = '0xWallet0000000000000000000000000000000000';
const TX_HASH = '0xabc123';

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const masterchefStakeRoutes = (await import('../../../../src/connectors/pancakeswap/nft-staking/masterchef-stake'))
    .default;
  await server.register(masterchefStakeRoutes);
  return server;
};

describe('POST /masterchef-stake', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Happy Paths ────────────────────────────────────────────────────────────

  it('returns 200 with signature, status, tokenId and fee on success', async () => {
    (Pancakeswap.getInstance as jest.Mock).mockResolvedValue({
      stakeNft: jest.fn().mockResolvedValue({ txHash: TX_HASH, status: 1, fee: '21000000000000' }),
    });

    const res = await server.inject({
      method: 'POST',
      url: '/masterchef-stake',
      payload: { network: 'bsc', walletAddress: WALLET, tokenId: TOKEN_ID },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.signature).toBe(TX_HASH);
    expect(body.status).toBe(1);
    expect(body.tokenId).toBe(TOKEN_ID);
    expect(body.fee).toBe('21000000000000');
  });

  it('defaults network to bsc when omitted', async () => {
    const getInstance = jest.fn().mockResolvedValue({
      stakeNft: jest.fn().mockResolvedValue({ txHash: TX_HASH, status: 1, fee: '0' }),
    });
    (Pancakeswap.getInstance as jest.Mock).mockImplementation(getInstance);

    await server.inject({
      method: 'POST',
      url: '/masterchef-stake',
      payload: { walletAddress: WALLET, tokenId: TOKEN_ID },
    });

    expect(getInstance).toHaveBeenCalledWith('bsc');
  });

  // ─── Missing / Invalid Parameters ───────────────────────────────────────────

  it('returns 400 when tokenId is missing', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/masterchef-stake',
      payload: { network: 'bsc', walletAddress: WALLET },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when walletAddress is missing', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/masterchef-stake',
      payload: { network: 'bsc', tokenId: TOKEN_ID },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when body is empty', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/masterchef-stake',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  // ─── Edge Cases — business-logic pre-condition failures ─────────────────────

  it('returns 400 when wallet does not own the NFT', async () => {
    (Pancakeswap.getInstance as jest.Mock).mockResolvedValue({
      stakeNft: jest.fn().mockRejectedValue(new Error(`Position ${TOKEN_ID} is not owned by wallet ${WALLET}`)),
    });

    const res = await server.inject({
      method: 'POST',
      url: '/masterchef-stake',
      payload: { network: 'bsc', walletAddress: WALLET, tokenId: TOKEN_ID },
    });

    expect(res.statusCode).toBe(400);
    expect(res.payload).toContain('not owned by');
  });

  it('returns 400 when MasterChef is not approved for the NFT', async () => {
    (Pancakeswap.getInstance as jest.Mock).mockResolvedValue({
      stakeNft: jest.fn().mockRejectedValue(new Error(`Insufficient NFT approval for position ${TOKEN_ID}`)),
    });

    const res = await server.inject({
      method: 'POST',
      url: '/masterchef-stake',
      payload: { network: 'bsc', walletAddress: WALLET, tokenId: TOKEN_ID },
    });

    expect(res.statusCode).toBe(400);
    expect(res.payload).toContain('Insufficient NFT approval');
  });

  it('returns 400 when pool is not registered in MasterChef', async () => {
    (Pancakeswap.getInstance as jest.Mock).mockResolvedValue({
      stakeNft: jest.fn().mockRejectedValue(new Error('Pool 0x1234 is not registered in MasterChef V3')),
    });

    const res = await server.inject({
      method: 'POST',
      url: '/masterchef-stake',
      payload: { network: 'bsc', walletAddress: WALLET, tokenId: TOKEN_ID },
    });

    expect(res.statusCode).toBe(400);
    expect(res.payload).toContain('not registered in MasterChef');
  });

  it('returns 400 when position has zero liquidity', async () => {
    (Pancakeswap.getInstance as jest.Mock).mockResolvedValue({
      stakeNft: jest
        .fn()
        .mockRejectedValue(new Error(`Position ${TOKEN_ID} has zero liquidity — cannot stake an empty position`)),
    });

    const res = await server.inject({
      method: 'POST',
      url: '/masterchef-stake',
      payload: { network: 'bsc', walletAddress: WALLET, tokenId: TOKEN_ID },
    });

    expect(res.statusCode).toBe(400);
    expect(res.payload).toContain('zero liquidity');
  });

  it('returns 500 when an unexpected error occurs', async () => {
    (Pancakeswap.getInstance as jest.Mock).mockResolvedValue({
      stakeNft: jest.fn().mockRejectedValue(new Error('RPC connection error')),
    });

    const res = await server.inject({
      method: 'POST',
      url: '/masterchef-stake',
      payload: { network: 'bsc', walletAddress: WALLET, tokenId: TOKEN_ID },
    });

    expect(res.statusCode).toBe(500);
  });
});
