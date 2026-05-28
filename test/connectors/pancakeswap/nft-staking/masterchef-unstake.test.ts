import { Pancakeswap } from '../../../../src/connectors/pancakeswap/pancakeswap';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/connectors/pancakeswap/pancakeswap');

const TOKEN_ID = '1234';
const WALLET = '0xWallet0000000000000000000000000000000000';
const TX_HASH = '0xdef456';

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const masterchefUnstakeRoutes = (
    await import('../../../../src/connectors/pancakeswap/nft-staking/masterchef-unstake')
  ).default;
  await server.register(masterchefUnstakeRoutes);
  return server;
};

describe('POST /masterchef-unstake', () => {
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
      unstakeNft: jest
        .fn()
        .mockResolvedValue({ txHash: TX_HASH, status: 1, fee: '42000000000000', rewardAmount: '1000000000000000000' }),
    });

    const res = await server.inject({
      method: 'POST',
      url: '/masterchef-unstake',
      payload: { network: 'bsc', walletAddress: WALLET, tokenId: TOKEN_ID },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.signature).toBe(TX_HASH);
    expect(body.status).toBe(1);
    expect(body.tokenId).toBe(TOKEN_ID);
    expect(body.fee).toBe('42000000000000');
  });

  it('returns 200 when CAKE reward is zero (no harvest event)', async () => {
    (Pancakeswap.getInstance as jest.Mock).mockResolvedValue({
      unstakeNft: jest.fn().mockResolvedValue({ txHash: TX_HASH, status: 1, fee: '30000000000000', rewardAmount: '0' }),
    });

    const res = await server.inject({
      method: 'POST',
      url: '/masterchef-unstake',
      payload: { network: 'bsc', walletAddress: WALLET, tokenId: TOKEN_ID },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).signature).toBe(TX_HASH);
  });

  it('defaults network to bsc when omitted', async () => {
    const getInstance = jest.fn().mockResolvedValue({
      unstakeNft: jest.fn().mockResolvedValue({ txHash: TX_HASH, status: 1, fee: '0', rewardAmount: '0' }),
    });
    (Pancakeswap.getInstance as jest.Mock).mockImplementation(getInstance);

    await server.inject({
      method: 'POST',
      url: '/masterchef-unstake',
      payload: { walletAddress: WALLET, tokenId: TOKEN_ID },
    });

    expect(getInstance).toHaveBeenCalledWith('bsc');
  });

  // ─── Missing / Invalid Parameters ───────────────────────────────────────────

  it('returns 400 when tokenId is missing', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/masterchef-unstake',
      payload: { network: 'bsc', walletAddress: WALLET },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when walletAddress is missing', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/masterchef-unstake',
      payload: { network: 'bsc', tokenId: TOKEN_ID },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when body is empty', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/masterchef-unstake',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  // ─── Edge Cases ──────────────────────────────────────────────────────────────

  it('returns 400 when NFT is not staked (precondition check)', async () => {
    (Pancakeswap.getInstance as jest.Mock).mockResolvedValue({
      unstakeNft: jest
        .fn()
        .mockRejectedValue(new Error(`NFT ${TOKEN_ID} is not staked in MasterChef (current owner: ${WALLET}).`)),
    });

    const res = await server.inject({
      method: 'POST',
      url: '/masterchef-unstake',
      payload: { network: 'bsc', walletAddress: WALLET, tokenId: TOKEN_ID },
    });

    expect(res.statusCode).toBe(400);
    expect(res.payload).toContain('not staked in MasterChef');
  });

  it('returns 400 when wallet is not found', async () => {
    (Pancakeswap.getInstance as jest.Mock).mockResolvedValue({
      unstakeNft: jest.fn().mockRejectedValue(new Error(`Wallet not found: ${WALLET}`)),
    });

    const res = await server.inject({
      method: 'POST',
      url: '/masterchef-unstake',
      payload: { network: 'bsc', walletAddress: WALLET, tokenId: TOKEN_ID },
    });

    expect(res.statusCode).toBe(400);
    expect(res.payload).toContain('Wallet not found');
  });

  it('returns 500 when an unexpected RPC error occurs', async () => {
    (Pancakeswap.getInstance as jest.Mock).mockResolvedValue({
      unstakeNft: jest.fn().mockRejectedValue(new Error('Provider error: ETIMEDOUT')),
    });

    const res = await server.inject({
      method: 'POST',
      url: '/masterchef-unstake',
      payload: { network: 'bsc', walletAddress: WALLET, tokenId: TOKEN_ID },
    });

    expect(res.statusCode).toBe(500);
  });
});
