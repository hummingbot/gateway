import {
  CREATE_CPMM_POOL_PROGRAM,
  CpmmConfigInfoLayout,
  CpmmPoolInfoLayout,
  Raydium as RaydiumSDK,
} from '@raydium-io/raydium-sdk-v2';
import { AccountLayout, MintLayout, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { AccountInfo, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import BN from 'bn.js';

import { Solana } from '../../../../src/chains/solana/solana';
import { removeLiquidity } from '../../../../src/connectors/raydium/amm-routes/removeLiquidity';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/raydium/raydium.config', () => ({
  RaydiumConfig: { config: { slippagePct: 1 } },
}));
jest.mock('../../../../src/services/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// A CPMM pool on a fork whose state has moved since Raydium's API last indexed it.
const poolId = new PublicKey('47hq28mcL7q5GhBg7epyGF2dnuJd4MKFt8QhT7CzYUp4');
const wallet = Keypair.generate().publicKey;
const mintA = Keypair.generate().publicKey;
const mintB = Keypair.generate().publicKey;
const lpMint = Keypair.generate().publicKey;
const vaultA = Keypair.generate().publicKey;
const vaultB = Keypair.generate().publicKey;
const configId = Keypair.generate().publicKey;
const lpAta = getAssociatedTokenAddressSync(lpMint, wallet);

// On-chain state
const VAULT_A = new BN('5000000000'); // 5,000 A (6 decimals)
const VAULT_B = new BN('80000000000000'); // 80,000 B (9 decimals)
const PROTOCOL_FEES_A = new BN('1000000');
const FUND_FEES_A = new BN('500000');
const PROTOCOL_FEES_B = new BN('20000000000');
const FUND_FEES_B = new BN('10000000000');
const LP_SUPPLY = new BN('600000000000');
const WALLET_LP = new BN('60000000000'); // a tenth of the supply

// spl-token's layouts are typed for Uint8Array; view the Buffer's bytes as one.
const bytes = (b: Buffer) => new Uint8Array(b.buffer, b.byteOffset, b.length);

const account = (owner: PublicKey, data: Buffer): AccountInfo<Buffer> => ({
  owner,
  data,
  lamports: 2_039_280,
  executable: false,
  rentEpoch: 0,
});

const mintAccount = (decimals: number, supply: BN) => {
  const data = Buffer.alloc(MintLayout.span);
  MintLayout.encode(
    {
      mintAuthorityOption: 0,
      mintAuthority: PublicKey.default,
      supply: BigInt(supply.toString()),
      decimals,
      isInitialized: true,
      freezeAuthorityOption: 0,
      freezeAuthority: PublicKey.default,
    },
    bytes(data),
  );
  return account(TOKEN_PROGRAM_ID, data);
};

const tokenAccount = (mint: PublicKey, owner: PublicKey, amount: BN) => {
  const data = Buffer.alloc(AccountLayout.span);
  AccountLayout.encode(
    {
      mint,
      owner,
      amount: BigInt(amount.toString()),
      delegateOption: 0,
      delegate: PublicKey.default,
      state: 1,
      isNativeOption: 0,
      isNative: BigInt(0),
      delegatedAmount: BigInt(0),
      closeAuthorityOption: 0,
      closeAuthority: PublicKey.default,
    },
    bytes(data),
  );
  return account(TOKEN_PROGRAM_ID, data);
};

const poolAccount = () => {
  const data = Buffer.alloc(CpmmPoolInfoLayout.span);
  CpmmPoolInfoLayout.encode(
    {
      configId,
      poolCreator: Keypair.generate().publicKey,
      vaultA,
      vaultB,
      mintLp: lpMint,
      mintA,
      mintB,
      mintProgramA: TOKEN_PROGRAM_ID,
      mintProgramB: TOKEN_PROGRAM_ID,
      observationId: Keypair.generate().publicKey,
      bump: 255,
      status: 0,
      lpDecimals: 9,
      mintDecimalA: 6,
      mintDecimalB: 9,
      lpAmount: LP_SUPPLY,
      protocolFeesMintA: PROTOCOL_FEES_A,
      protocolFeesMintB: PROTOCOL_FEES_B,
      fundFeesMintA: FUND_FEES_A,
      fundFeesMintB: FUND_FEES_B,
      openTime: new BN(0),
    } as any,
    data,
  );
  return account(CREATE_CPMM_POOL_PROGRAM, data);
};

const configAccount = () => {
  const data = Buffer.alloc(CpmmConfigInfoLayout.span);
  CpmmConfigInfoLayout.encode(
    {
      bump: 255,
      disableCreatePool: false,
      index: 0,
      tradeFeeRate: new BN(2500),
      protocolFeeRate: new BN(120000),
      fundFeeRate: new BN(40000),
      createPoolFee: new BN(0),
      protocolOwner: PublicKey.default,
      fundOwner: PublicKey.default,
    } as any,
    data,
  );
  return account(CREATE_CPMM_POOL_PROGRAM, data);
};

const chain: Record<string, AccountInfo<Buffer>> = {
  [poolId.toBase58()]: poolAccount(),
  [configId.toBase58()]: configAccount(),
  [vaultA.toBase58()]: tokenAccount(mintA, Keypair.generate().publicKey, VAULT_A),
  [vaultB.toBase58()]: tokenAccount(mintB, Keypair.generate().publicKey, VAULT_B),
  [mintA.toBase58()]: mintAccount(6, new BN('1000000000000')),
  [mintB.toBase58()]: mintAccount(9, new BN('1000000000000000')),
  [lpMint.toBase58()]: mintAccount(9, LP_SUPPLY),
  [lpAta.toBase58()]: tokenAccount(lpMint, wallet, WALLET_LP),
};

const connection = {
  getAccountInfo: jest.fn(async (key: PublicKey) => chain[key.toBase58()] ?? null),
  getMultipleAccountsInfo: jest.fn(async (keys: PublicKey[]) => keys.map((k) => chain[k.toBase58()] ?? null)),
  getTokenAccountsByOwner: jest.fn(async (owner: PublicKey, filter: { mint?: PublicKey; programId?: PublicKey }) => ({
    context: { slot: 1 },
    value: Object.entries(chain)
      .filter(([, info]) => info.owner.equals(TOKEN_PROGRAM_ID) && info.data.length === AccountLayout.span)
      .filter(([, info]) => AccountLayout.decode(bytes(info.data)).owner.equals(owner))
      .filter(([, info]) => !filter.mint || AccountLayout.decode(bytes(info.data)).mint.equals(filter.mint))
      .filter(([, info]) => !filter.programId || info.owner.equals(filter.programId))
      .map(([pubkey, info]) => ({ pubkey: new PublicKey(pubkey), account: info })),
  })),
  getTokenAccountBalance: jest.fn(async (key: PublicKey) => {
    const amount = AccountLayout.decode(bytes(chain[key.toBase58()].data)).amount.toString();
    return { context: { slot: 1 }, value: { amount, decimals: 9, uiAmount: Number(amount) / 1e9 } };
  }),
  getEpochInfo: jest.fn(async () => ({ epoch: 700, slotIndex: 0, slotsInEpoch: 432000, absoluteSlot: 1 })),
  getLatestBlockhash: jest.fn(async () => ({
    blockhash: '4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZAMdL4VZHirAn',
    lastValidBlockHeight: 1,
  })),
  onAccountChange: jest.fn(() => 1),
  removeAccountChangeListener: jest.fn(),
};

// What Raydium's HTTP API still says about the pool: reserves from before the swaps.
const staleApi = {
  fetchPoolById: jest.fn(async () => [
    {
      id: poolId.toBase58(),
      programId: CREATE_CPMM_POOL_PROGRAM.toBase58(),
      mintAmountA: 2500,
      mintAmountB: 160000,
      lpAmount: 600,
    },
  ]),
};

describe('Raydium CPMM removeLiquidity', () => {
  let sent: VersionedTransaction | undefined;

  beforeEach(() => {
    sent = undefined;
    jest
      .spyOn(RaydiumSDK, 'load')
      .mockImplementation(
        async (config: any) => new RaydiumSDK({ ...config, api: staleApi, cluster: 'mainnet' } as any),
      );
    (Solana.getInstance as jest.Mock).mockResolvedValue({
      network: 'mainnet-beta',
      connection,
      estimateGasPrice: jest.fn().mockResolvedValue(0.0001),
      sendAndConfirmTransactionForWallet: jest.fn(async (tx: VersionedTransaction) => {
        sent = tx;
        return { signature: 'sig' };
      }),
      getConfirmedTransactionData: jest.fn().mockResolvedValue(null),
    });
  });

  it("sets the withdraw's minimum amounts from the chain's reserves, not Raydium's API", async () => {
    const result = await removeLiquidity('mainnet-beta', wallet.toBase58(), poolId.toBase58(), 50, 1);
    expect(result.status).toBe(0);

    const message = sent!.message;
    const keys = message.staticAccountKeys;
    const withdraw = message.compiledInstructions.find((ix) =>
      keys[ix.programIdIndex].equals(CREATE_CPMM_POOL_PROGRAM),
    );
    const data = Buffer.from(withdraw!.data);
    // discriminator(8) | lp_token_amount u64 | minimum_token_0_amount u64 | minimum_token_1_amount u64
    const lpAmount = new BN(data.subarray(8, 16), 'le');
    const minA = new BN(data.subarray(16, 24), 'le');
    const minB = new BN(data.subarray(24, 32), 'le');

    const lpBurned = WALLET_LP.divn(2);
    expect(lpAmount.toString()).toBe(lpBurned.toString());

    // Share of the on-chain reserves (vault less protocol and fund fees), less 1% slippage.
    const reserveA = VAULT_A.sub(PROTOCOL_FEES_A).sub(FUND_FEES_A);
    const reserveB = VAULT_B.sub(PROTOCOL_FEES_B).sub(FUND_FEES_B);
    const expectedMinA = lpBurned.mul(reserveA).div(LP_SUPPLY).muln(99).divn(100);
    const expectedMinB = lpBurned.mul(reserveB).div(LP_SUPPLY).muln(99).divn(100);
    expect(minA.toString()).toBe(expectedMinA.toString());
    expect(minB.toString()).toBe(expectedMinB.toString());

    // The API's stale reserves would have asked for half as much A and twice as much B.
    expect(staleApi.fetchPoolById).not.toHaveBeenCalled();
  });

  it('refuses a pool that neither Raydium AMM v4 nor CPMM owns', async () => {
    const foreign = Keypair.generate().publicKey;
    chain[foreign.toBase58()] = account(Keypair.generate().publicKey, Buffer.alloc(8));

    await expect(removeLiquidity('mainnet-beta', wallet.toBase58(), foreign.toBase58(), 50, 1)).rejects.toThrow(
      /neither Raydium AMM v4 nor Raydium CPMM/,
    );
  });
});
