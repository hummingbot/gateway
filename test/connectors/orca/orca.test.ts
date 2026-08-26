import { Keypair, PublicKey } from '@solana/web3.js';

jest.mock('../../../src/chains/solana/solana');
jest.mock('../../../src/connectors/orca/orca.config');
jest.mock('../../../src/connectors/orca/orca.position', () => ({
  getPositionDetails: jest.fn(),
}));
jest.mock('../../../src/services/logger');
jest.mock('@orca-so/whirlpools', () => ({
  fetchPositionsForOwner: jest.fn(),
  setNativeMintWrappingStrategy: jest.fn(),
  WhirlpoolDeployment: {
    mainnet: { programId: 'mainnet-program', configAddress: 'mainnet-config' },
    devnet: { programId: 'devnet-program', configAddress: 'devnet-config' },
  },
}));
jest.mock('@orca-so/whirlpools-client', () => ({
  fetchWhirlpool: jest.fn(),
  fetchPosition: jest.fn(),
}));
jest.mock('@solana/kit', () => ({
  address: jest.fn((value: string) => value),
  createNoopSigner: jest.fn((value: string) => ({ address: value })),
  createSolanaRpc: jest.fn((_network: any) => ({ rpcEndpoint: 'mock-rpc' })),
  mainnet: jest.fn((endpoint: string) => ({ endpoint })),
  devnet: jest.fn((endpoint: string) => ({ endpoint })),
}));

import { fetchPositionsForOwner, setNativeMintWrappingStrategy } from '@orca-so/whirlpools';
import { fetchPosition, fetchWhirlpool } from '@orca-so/whirlpools-client';

import { Solana } from '../../../src/chains/solana/solana';
import { Orca } from '../../../src/connectors/orca/orca';
import { OrcaConfig } from '../../../src/connectors/orca/orca.config';
import { getPositionDetails } from '../../../src/connectors/orca/orca.position';
import { logger } from '../../../src/services/logger';

describe('Orca', () => {
  const wallet = Keypair.generate();
  let mockSolana: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSolana = {
      connection: { rpcEndpoint: 'https://api.mainnet-beta.solana.com' },
      network: 'mainnet-beta',
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);
    (OrcaConfig.config as any) = { slippagePct: 1 };
    (Orca as any)._instances = {};
  });

  it('creates one instance per network and selects the matching deployment', async () => {
    const mainnet = await Orca.getInstance('mainnet-beta');
    expect(await Orca.getInstance('mainnet-beta')).toBe(mainnet);
    expect(mainnet.deployment.programId).toBe('mainnet-program');

    mockSolana = { ...mockSolana, network: 'devnet' };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);
    const devnet = await Orca.getInstance('devnet');
    expect(devnet).not.toBe(mainnet);
    expect(devnet.deployment.programId).toBe('devnet-program');
    expect(setNativeMintWrappingStrategy).toHaveBeenCalledWith('ata');
  });

  it('propagates initialization errors', async () => {
    const error = new Error('Failed to initialize');
    (Solana.getInstance as jest.Mock).mockRejectedValueOnce(error);
    await expect(Orca.getInstance('mainnet-beta')).rejects.toThrow(error);
    expect(logger.error).toHaveBeenCalledWith('Failed to initialize Orca:', error);
  });

  it('maps Orca API pools into the Gateway schema', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            address: 'pool1',
            tokenMintA: 'tokenA',
            tokenMintB: 'tokenB',
            feeRate: 400,
            protocolFeeRate: 100,
            price: 150.5,
            tokenBalanceA: '1000000000',
            tokenBalanceB: '150500000000',
            tokenA: { decimals: 9 },
            tokenB: { decimals: 6 },
            tickSpacing: 64,
            tickCurrentIndex: 100,
            liquidity: '1000000',
            sqrtPrice: '123456789',
            tvlUsdc: 10000,
            yieldOverTvl: 0.05,
          },
        ],
      }),
    } as any);
    const orca = await Orca.getInstance('mainnet-beta');
    const pools = await orca.getPools({ limit: 5, query: 'SOL USDC' });
    expect(pools[0]).toEqual(
      expect.objectContaining({
        address: 'pool1',
        baseTokenAddress: 'tokenA',
        quoteTokenAddress: 'tokenB',
        feePct: 0.04,
        protocolFeeRate: 0.01,
      }),
    );
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('q=SOL+USDC'));
  });

  it('returns current Whirlpool account data', async () => {
    (fetchWhirlpool as jest.Mock).mockResolvedValue({ data: { tickSpacing: 64 } });
    const orca = await Orca.getInstance('mainnet-beta');
    await expect(orca.getWhirlpool(wallet.publicKey.toBase58())).resolves.toEqual({ tickSpacing: 64 });
  });

  it('reads position PDAs directly', async () => {
    const pool = Keypair.generate().publicKey;
    (fetchPosition as jest.Mock).mockResolvedValue({ data: { whirlpool: pool } });
    (fetchWhirlpool as jest.Mock).mockResolvedValue({ data: { tickSpacing: 64 } });
    const orca = await Orca.getInstance('mainnet-beta');
    const positionAddress = Keypair.generate().publicKey.toBase58();
    const result = await orca.getRawPosition(positionAddress, wallet.publicKey);
    expect(fetchPosition).toHaveBeenCalledWith(orca.solanaKitRpc, positionAddress);
    expect(result?.poolAddress).toBe(pool.toBase58());
  });

  it('filters bundles and maps owned positions through the current client/core reader', async () => {
    const first = Keypair.generate().publicKey.toBase58();
    const bundle = Keypair.generate().publicKey.toBase58();
    (fetchPositionsForOwner as jest.Mock).mockResolvedValue([
      { address: first, isPositionBundle: false },
      { address: bundle, isPositionBundle: true },
    ]);
    (getPositionDetails as jest.Mock).mockResolvedValue({ address: first });
    const orca = await Orca.getInstance('mainnet-beta');
    const positions = await orca.getPositionsForWalletAddress(wallet.publicKey.toBase58());
    expect(positions).toEqual([{ address: first }]);
    expect(getPositionDetails).toHaveBeenCalledTimes(1);
    expect(fetchPositionsForOwner).toHaveBeenCalledWith(
      orca.solanaKitRpc,
      wallet.publicKey.toBase58(),
      orca.deployment,
    );
  });

  it('omits an owned position only when the final snapshot proves it closed', async () => {
    const positionAddress = Keypair.generate().publicKey.toBase58();
    (fetchPositionsForOwner as jest.Mock).mockResolvedValue([{ address: positionAddress, isPositionBundle: false }]);
    (getPositionDetails as jest.Mock).mockResolvedValue(null);
    const orca = await Orca.getInstance('mainnet-beta');

    await expect(orca.getPositionsForWalletAddress(wallet.publicKey.toBase58())).resolves.toEqual([]);
    expect(logger.debug).toHaveBeenCalledWith(`Position ${positionAddress} appears to be closed, skipping`);
  });

  it('validates and reads a specific position without a wallet-bound SDK client', async () => {
    const info = { address: Keypair.generate().publicKey.toBase58() };
    (getPositionDetails as jest.Mock).mockResolvedValue(info);
    const orca = await Orca.getInstance('mainnet-beta');
    await expect(orca.getPositionInfo(info.address, wallet.publicKey.toBase58())).resolves.toEqual(info);
    await expect(orca.getPositionInfo('invalid', wallet.publicKey.toBase58())).rejects.toThrow(
      'Invalid position address',
    );
  });

  it('returns null from getPositionInfo only when the account definitively does not exist', async () => {
    (getPositionDetails as jest.Mock).mockResolvedValue(null);
    const orca = await Orca.getInstance('mainnet-beta');
    const positionAddress = Keypair.generate().publicKey.toBase58();
    await expect(orca.getPositionInfo(positionAddress, wallet.publicKey.toBase58())).resolves.toBeNull();
    expect(getPositionDetails).toHaveBeenCalledWith(orca.solanaKitRpc, positionAddress, orca.deployment);
  });

  it('propagates transient errors from getPositionInfo instead of reporting the position closed', async () => {
    // Callers treat null as "position closed"; a swallowed RPC error here would
    // let an LP executor abandon a live, funded position while reporting success.
    const orca = await Orca.getInstance('mainnet-beta');
    const positionAddress = Keypair.generate().publicKey.toBase58();
    (getPositionDetails as jest.Mock).mockRejectedValue(new Error('RPC node behind'));
    await expect(orca.getPositionInfo(positionAddress, wallet.publicKey.toBase58())).rejects.toThrow('RPC node behind');
  });

  it('keeps connector configuration public', async () => {
    const orca = await Orca.getInstance('mainnet-beta');
    expect(orca.config).toBe(OrcaConfig.config);
    expect(orca.solanaKitRpc).toBeDefined();
    expect(new PublicKey(wallet.publicKey)).toBeDefined();
  });
});
