import { createConcentratedLiquidityPoolInstructions } from '@orca-so/whirlpools';
import { AccountRole, address } from '@solana/kit';
import { Keypair } from '@solana/web3.js';

import { Solana } from '../../../../src/chains/solana/solana';
import { Orca } from '../../../../src/connectors/orca/orca';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('@orca-so/whirlpools', () => ({
  ...jest.requireActual('@orca-so/whirlpools'),
  createConcentratedLiquidityPoolInstructions: jest.fn(),
}));
jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/orca/orca');

const mockSOL = { symbol: 'SOL', address: 'So11111111111111111111111111111111111111112', decimals: 9 };
const mockUSDC = { symbol: 'USDC', address: 'EPjFWdd5AufqSSqeM2q8fWrMZBCw9p4DkGSSb3nZr1v', decimals: 6 };
const mockWallet = '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5';

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { createPoolRoute } = await import('../../../../src/connectors/orca/clmm-routes/createPool');
  await server.register(createPoolRoute);
  return server;
};

describe('POST /create-pool (Orca CLMM)', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (Orca.getInstance as jest.Mock).mockResolvedValue({});
  });

  it('rejects when baseToken and quoteToken resolve to the same mint', async () => {
    // Resolve both tokens to the same mint so the base != quote guard fires before any SDK call.
    (Solana.getInstance as jest.Mock).mockResolvedValue({
      getToken: jest.fn(() => Promise.resolve(mockSOL)),
    });

    const response = await server.inject({
      method: 'POST',
      url: '/create-pool',
      payload: {
        network: 'mainnet-beta',
        walletAddress: mockWallet,
        baseToken: 'SOL',
        quoteToken: 'SOL',
        tickSpacing: 64,
        initialPrice: 150,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/must be different/);
  });

  it('rejects when tickSpacing is not a positive integer', async () => {
    (Solana.getInstance as jest.Mock).mockResolvedValue({
      getToken: jest.fn(() => Promise.resolve(mockSOL)),
    });

    const response = await server.inject({
      method: 'POST',
      url: '/create-pool',
      payload: {
        network: 'mainnet-beta',
        walletAddress: mockWallet,
        baseToken: 'SOL',
        quoteToken: 'USDC',
        tickSpacing: 0,
        initialPrice: 150,
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('builds with the current SDK and forwards Web3 vault signers', async () => {
    const poolAddress = Keypair.generate().publicKey.toBase58();
    const generatedVaults = [Keypair.generate().publicKey.toBase58(), Keypair.generate().publicKey.toBase58()];
    const sendAndConfirm = jest.fn().mockResolvedValue({ signature: 'test-signature', fee: 0.000005 });

    (Solana.getInstance as jest.Mock).mockResolvedValue({
      getToken: jest.fn((token: string) => Promise.resolve(token === 'SOL' ? mockSOL : mockUSDC)),
      connection: {
        getAccountInfo: jest.fn().mockResolvedValue(null),
        getTransaction: jest.fn().mockResolvedValue({ meta: { fee: 5000 } }),
      },
      sendAndConfirmTransactionForWallet: sendAndConfirm,
      getConfirmedTransactionData: jest.fn().mockResolvedValue({ meta: { fee: 5000 } }),
    });
    (Orca.getInstance as jest.Mock).mockResolvedValue({
      solanaKitRpc: {},
      deployment: {
        configAddress: address('2LecshUwdy9xiVQvkhfV4Qq2QMyXpfY2r6VjBuqFzodx'),
        programId: address('whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc'),
      },
    });
    (createConcentratedLiquidityPoolInstructions as jest.Mock).mockResolvedValue({
      poolAddress: address(poolAddress),
      initializationCost: 0n,
      instructions: [
        {
          programAddress: address('whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc'),
          accounts: [
            {
              address: address(mockWallet),
              role: AccountRole.WRITABLE_SIGNER,
              signer: { address: address(mockWallet) },
            },
            ...generatedVaults.map((vault) => ({
              address: address(vault),
              role: AccountRole.WRITABLE_SIGNER,
              signer: { address: address(vault) },
            })),
          ],
          data: new Uint8Array(),
        },
      ],
    });

    const response = await server.inject({
      method: 'POST',
      url: '/create-pool',
      payload: {
        network: 'mainnet-beta',
        walletAddress: mockWallet,
        baseToken: 'SOL',
        quoteToken: 'USDC',
        tickSpacing: 64,
        initialPrice: 150,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(createConcentratedLiquidityPoolInstructions).toHaveBeenCalledTimes(1);
    const [transaction, signingWallet, extraSigners] = sendAndConfirm.mock.calls[0];
    expect(signingWallet).toBe(mockWallet);
    expect(extraSigners).toHaveLength(2);
    const transactionAccounts = transaction.instructions[0].keys.map((key) => key.pubkey.toBase58());
    expect(transactionAccounts).toEqual(
      expect.arrayContaining(extraSigners.map((signer) => signer.publicKey.toBase58())),
    );
    expect(transactionAccounts).not.toEqual(expect.arrayContaining(generatedVaults));
  });
});
