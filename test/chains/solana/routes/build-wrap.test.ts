/**
 * /chains/solana/build-wrap and build-unwrap: the same code as wrap and unwrap, stopped
 * at the signing chokepoint, which hands back the unsigned transaction.
 */
import { NATIVE_MINT, AccountLayout, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js';

import { chainRoutes } from '../../../../src/chains/chain.routes';
import { Solana } from '../../../../src/chains/solana/solana';
import { UnsignedTransactionCaptured } from '../../../../src/chains/solana/solana-build-mode';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

const WALLET = Keypair.generate().publicKey;
const BUILT = {
  transaction: 'dGVzdA==',
  feePayer: WALLET.toBase58(),
  recentBlockhash: 'hash',
  lastValidBlockHeight: 10,
  currentBlockHeight: 5,
  extraSigners: [],
};

describe('Solana build-wrap and build-unwrap', () => {
  let server: any;
  let solana: any;
  let wsolBalance: bigint | undefined;

  beforeAll(async () => {
    server = fastifyWithTypeProvider();
    await server.register(chainRoutes);
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    wsolBalance = 2_000_000_000n;
    solana = {
      wrapSOL: jest.fn(async () => [new TransactionInstruction({ programId: PublicKey.default, keys: [] })]),
      unwrapSOL: jest.fn(() => new TransactionInstruction({ programId: PublicKey.default, keys: [] })),
      sendAndConfirmTransactionForWallet: jest.fn(async () => {
        throw new UnsignedTransactionCaptured(BUILT);
      }),
      getConfirmedTransactionData: jest.fn(),
      connection: {
        getLatestBlockhash: jest.fn(async () => ({ blockhash: '11111111111111111111111111111111' })),
        getAccountInfo: jest.fn(async (account: PublicKey) => {
          expect(account.equals(getAssociatedTokenAddressSync(NATIVE_MINT, WALLET, false, TOKEN_PROGRAM_ID))).toBe(
            true,
          );
          if (wsolBalance === undefined) return null;
          const data = new Uint8Array(AccountLayout.span);
          AccountLayout.encode(
            {
              mint: NATIVE_MINT,
              owner: WALLET,
              amount: wsolBalance,
              delegateOption: 0,
              delegate: PublicKey.default,
              state: 1,
              isNativeOption: 0,
              isNative: 0n,
              delegatedAmount: 0n,
              closeAuthorityOption: 0,
              closeAuthority: PublicKey.default,
            },
            data,
          );
          return { data };
        }),
      },
    };
    jest.spyOn(Solana, 'getInstance').mockResolvedValue(solana);
  });

  afterEach(() => jest.restoreAllMocks());

  it('build-wrap returns the unsigned wrap transaction and confirms nothing', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/solana/build-wrap',
      payload: { network: 'mainnet-beta', address: WALLET.toBase58(), amount: '0.5' },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ transaction: BUILT.transaction, feePayer: BUILT.feePayer });
    expect(solana.wrapSOL).toHaveBeenCalledWith(expect.any(PublicKey), 500_000_000);
    expect(solana.getConfirmedTransactionData).not.toHaveBeenCalled();
  });

  it('build-unwrap returns the unsigned unwrap transaction', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/solana/build-unwrap',
      payload: { network: 'mainnet-beta', address: WALLET.toBase58() },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ transaction: BUILT.transaction });
    expect(solana.unwrapSOL).toHaveBeenCalled();
    expect(solana.getConfirmedTransactionData).not.toHaveBeenCalled();
  });

  it('build-unwrap refuses a wallet with no WSOL, as unwrap does', async () => {
    wsolBalance = 0n;

    const response = await server.inject({
      method: 'POST',
      url: '/solana/build-unwrap',
      payload: { network: 'mainnet-beta', address: WALLET.toBase58() },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/WSOL balance is zero/);
  });

  it('build-wrap refuses a zero amount, as wrap does', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/solana/build-wrap',
      payload: { network: 'mainnet-beta', address: WALLET.toBase58(), amount: '0' },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/Amount must be greater than 0/);
  });
});
