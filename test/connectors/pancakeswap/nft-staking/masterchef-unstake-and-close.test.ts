import { Pancakeswap } from '../../../../src/connectors/pancakeswap/pancakeswap';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/connectors/pancakeswap/pancakeswap');
jest.mock('../../../../src/connectors/pancakeswap/clmm-routes/closePosition');

const TOKEN_ID = '1234';
const WALLET = '0xWallet0000000000000000000000000000000000';
const UNSTAKE_TX = '0xUnstakeTx';
const CLOSE_TX = '0xCloseTx';

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const masterchefUnstakeAndCloseRoutes = (
    await import('../../../../src/connectors/pancakeswap/nft-staking/masterchef-unstake-and-close')
  ).default;
  await server.register(masterchefUnstakeAndCloseRoutes);
  return server;
};

describe('POST /masterchef-unstake-and-close', () => {
  let server: any;
  let closePositionMock: jest.Mock;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const { closePosition } = await import('../../../../src/connectors/pancakeswap/clmm-routes/closePosition');
    closePositionMock = closePosition as jest.Mock;
    closePositionMock.mockResolvedValue({ signature: CLOSE_TX, status: 1, data: { fee: 0.001 } });
  });

  // ─── Happy Paths ────────────────────────────────────────────────────────────

  it('returns 200 with both transaction hashes on success', async () => {
    (Pancakeswap.getInstance as jest.Mock).mockResolvedValue({
      unstakeNft: jest.fn().mockResolvedValue({
        txHash: UNSTAKE_TX,
        status: 1,
        fee: '21000000000000',
        rewardAmount: '500000000000000000',
      }),
    });

    const res = await server.inject({
      method: 'POST',
      url: '/masterchef-unstake-and-close',
      payload: { network: 'bsc', walletAddress: WALLET, tokenId: TOKEN_ID },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.unstakeSignature).toBe(UNSTAKE_TX);
    expect(body.closeSignature).toBe(CLOSE_TX);
    expect(body.status).toBe(1);
    expect(body.tokenId).toBe(TOKEN_ID);
  });

  it('calls closePosition AFTER unstakeNft (on-chain confirmation, no setTimeout)', async () => {
    const callOrder: string[] = [];

    const unstakeMock = jest.fn().mockImplementation(async () => {
      callOrder.push('unstake');
      return { txHash: UNSTAKE_TX, status: 1, fee: '0', rewardAmount: '0' };
    });

    closePositionMock.mockImplementation(async () => {
      callOrder.push('close');
      return { signature: CLOSE_TX, status: 1 };
    });

    (Pancakeswap.getInstance as jest.Mock).mockResolvedValue({ unstakeNft: unstakeMock });

    await server.inject({
      method: 'POST',
      url: '/masterchef-unstake-and-close',
      payload: { network: 'bsc', walletAddress: WALLET, tokenId: TOKEN_ID },
    });

    expect(callOrder).toEqual(['unstake', 'close']);
  });

  it('defaults network to bsc when omitted', async () => {
    const getInstance = jest.fn().mockResolvedValue({
      unstakeNft: jest.fn().mockResolvedValue({ txHash: UNSTAKE_TX, status: 1, fee: '0', rewardAmount: '0' }),
    });
    (Pancakeswap.getInstance as jest.Mock).mockImplementation(getInstance);

    await server.inject({
      method: 'POST',
      url: '/masterchef-unstake-and-close',
      payload: { walletAddress: WALLET, tokenId: TOKEN_ID },
    });

    expect(getInstance).toHaveBeenCalledWith('bsc');
  });

  // ─── Missing / Invalid Parameters ───────────────────────────────────────────

  it('returns 400 when tokenId is missing', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/masterchef-unstake-and-close',
      payload: { network: 'bsc', walletAddress: WALLET },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when walletAddress is missing', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/masterchef-unstake-and-close',
      payload: { network: 'bsc', tokenId: TOKEN_ID },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when body is empty', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/masterchef-unstake-and-close',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  // ─── Edge Cases — partial failure ────────────────────────────────────────────

  it('returns 400 when NFT is not staked (unstake step fails)', async () => {
    (Pancakeswap.getInstance as jest.Mock).mockResolvedValue({
      unstakeNft: jest.fn().mockRejectedValue(new Error(`NFT ${TOKEN_ID} is not staked in MasterChef`)),
    });

    const res = await server.inject({
      method: 'POST',
      url: '/masterchef-unstake-and-close',
      payload: { network: 'bsc', walletAddress: WALLET, tokenId: TOKEN_ID },
    });

    expect(res.statusCode).toBe(400);
    expect(res.payload).toContain('not staked in MasterChef');
    // closePosition must NOT have been called when unstake fails
    expect(closePositionMock).not.toHaveBeenCalled();
  });

  it('returns 500 when unstake succeeds but close fails', async () => {
    (Pancakeswap.getInstance as jest.Mock).mockResolvedValue({
      unstakeNft: jest.fn().mockResolvedValue({ txHash: UNSTAKE_TX, status: 1, fee: '0', rewardAmount: '0' }),
    });
    closePositionMock.mockRejectedValue(new Error('Out of gas'));

    const res = await server.inject({
      method: 'POST',
      url: '/masterchef-unstake-and-close',
      payload: { network: 'bsc', walletAddress: WALLET, tokenId: TOKEN_ID },
    });

    expect(res.statusCode).toBe(500);
    // Error message should include the unstake tx hash so the user can recover
    expect(res.payload).toContain(UNSTAKE_TX);
  });

  it('returns 400 when wallet is not found', async () => {
    (Pancakeswap.getInstance as jest.Mock).mockResolvedValue({
      unstakeNft: jest.fn().mockRejectedValue(new Error(`Wallet not found: ${WALLET}`)),
    });

    const res = await server.inject({
      method: 'POST',
      url: '/masterchef-unstake-and-close',
      payload: { network: 'bsc', walletAddress: WALLET, tokenId: TOKEN_ID },
    });

    expect(res.statusCode).toBe(400);
  });
});
