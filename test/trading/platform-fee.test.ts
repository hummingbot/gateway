/**
 * The platform fee a build carries (trading/platform-fee): its arithmetic, the
 * instructions that pay it, and the routes that put them in the transaction —
 * pool and launch swaps (a transfer of the input after the swap), Jupiter
 * (feeAccount + a prepended ATA create) and LP deposits (quote-token value).
 */
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  MINT_SIZE,
  MintLayout,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { Keypair, PublicKey, SystemProgram, SystemInstruction, TransactionInstruction } from '@solana/web3.js';

import { quoteCache } from '../../src/services/quote-cache';
import {
  lpDepositValue,
  appendedPlatformFee,
  lpPlatformFee,
  platformFeeInstructions,
  platformFeeRaw,
  recordRouterFeeQuote,
  routerPlatformFee,
  uiToRaw,
} from '../../src/trading/platform-fee';
import { fastifyWithTypeProvider } from '../utils/testUtils';

const WALLET = new PublicKey('82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5');
// An off-curve owner, as a program-owned account is.
const VAULT = PublicKey.findProgramAddressSync([Buffer.from('income')], SystemProgram.programId)[0];
const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const T22 = Keypair.generate().publicKey;

function mintAccount(decimals: number, owner: PublicKey) {
  const data = Buffer.alloc(MINT_SIZE);
  MintLayout.encode(
    {
      mintAuthorityOption: 0,
      mintAuthority: PublicKey.default,
      supply: 1_000_000n,
      decimals,
      isInitialized: true,
      freezeAuthorityOption: 0,
      freezeAuthority: PublicKey.default,
    },
    data as unknown as Uint8Array,
  );
  return { owner, data, lamports: 1, executable: false };
}

const connection: any = {
  getAccountInfo: jest.fn(async (key: PublicKey) => {
    if (key.equals(USDC)) return mintAccount(6, TOKEN_PROGRAM_ID);
    if (key.equals(NATIVE_MINT)) return mintAccount(9, TOKEN_PROGRAM_ID);
    if (key.equals(T22)) return mintAccount(6, TOKEN_2022_PROGRAM_ID);
    return null;
  }),
};

// The chain names USDC and wSOL; the Token-2022 mint has no metadata, so it is
// named by its address.
const chain: any = {
  connection,
  getToken: async (mint: string) =>
    mint === USDC.toBase58()
      ? { symbol: 'USDC' }
      : mint === NATIVE_MINT.toBase58()
        ? { symbol: 'WSOL' }
        : { symbol: mint },
};

const mockSolanaGetInstance = jest.fn(async () => chain);
jest.mock('../../src/chains/solana/solana', () => ({
  Solana: { getInstance: (...args: any[]) => (mockSolanaGetInstance as any)(...args) },
}));

/** transferChecked's data: tag 12, amount u64, decimals. */
function transferChecked(ix: TransactionInstruction) {
  expect(ix.data[0]).toBe(12);
  return { amount: ix.data.readBigUInt64LE(1), decimals: ix.data[9], keys: ix.keys.map((k) => k.pubkey.toBase58()) };
}

describe('arithmetic', () => {
  it('takes bps of a raw amount, rounded down', () => {
    expect(platformFeeRaw(1_000_000_000n, 5)).toBe(500_000n);
    expect(platformFeeRaw(1_999n, 5)).toBe(0n);
    expect(platformFeeRaw(2_000n, 5)).toBe(1n);
    expect(platformFeeRaw(123n, 10_000)).toBe(123n);
    expect(() => platformFeeRaw(1n, 0)).toThrow(/1 to 10000/);
  });

  it('turns UI amounts into raw units, rounded down', () => {
    expect(uiToRaw(1.5, 6)).toBe(1_500_000n);
    expect(uiToRaw(0.1234567891, 9)).toBe(123_456_789n);
  });

  it("values a deposit in the quote token: quote + base × the pool's price", () => {
    expect(lpDepositValue(2, 100, 150)).toBe(400);
    expect(lpDepositValue(undefined, 5, 150)).toBe(5);
    expect(lpDepositValue(0.1, undefined, 200)).toBe(20);
    expect(() => lpDepositValue(1, 1, 0)).toThrow(/price/);
  });
});

describe('platformFeeInstructions', () => {
  it('pays SOL as one lamport transfer to the recipient', async () => {
    const ixs = await platformFeeInstructions(connection, WALLET, NATIVE_MINT, 500_000n, VAULT);
    expect(ixs).toHaveLength(1);
    expect(ixs[0].programId.equals(SystemProgram.programId)).toBe(true);
    const t = SystemInstruction.decodeTransfer(ixs[0]);
    expect(t.fromPubkey.equals(WALLET)).toBe(true);
    expect(t.toPubkey.equals(VAULT)).toBe(true);
    expect(t.lamports).toBe(500_000n);
  });

  it("pays an SPL token into the recipient's associated account, created idempotently first", async () => {
    const ixs = await platformFeeInstructions(connection, WALLET, USDC, 2_500n, VAULT);
    const vaultAta = getAssociatedTokenAddressSync(USDC, VAULT, true, TOKEN_PROGRAM_ID);
    expect(ixs).toHaveLength(2);
    expect(ixs[0].programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(true);
    expect(ixs[0].data[0]).toBe(1); // CreateIdempotent
    expect(ixs[0].keys[1].pubkey.equals(vaultAta)).toBe(true);
    expect(ixs[0].keys[2].pubkey.equals(VAULT)).toBe(true);
    const t = transferChecked(ixs[1]);
    expect(t).toEqual({
      amount: 2_500n,
      decimals: 6,
      keys: [
        getAssociatedTokenAddressSync(USDC, WALLET, true, TOKEN_PROGRAM_ID).toBase58(),
        USDC.toBase58(),
        vaultAta.toBase58(),
        WALLET.toBase58(),
      ],
    });
  });

  it("uses the mint's own token program for a Token-2022 mint", async () => {
    const ixs = await platformFeeInstructions(connection, WALLET, T22, 7n, VAULT);
    expect(ixs[1].programId.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
    expect(ixs[1].keys[2].pubkey.equals(getAssociatedTokenAddressSync(T22, VAULT, true, TOKEN_2022_PROGRAM_ID))).toBe(
      true,
    );
  });

  it('adds nothing for a zero fee, and refuses a mint that does not exist', async () => {
    expect(await platformFeeInstructions(connection, WALLET, USDC, 0n, VAULT)).toEqual([]);
    await expect(platformFeeInstructions(connection, WALLET, Keypair.generate().publicKey, 1n, VAULT)).rejects.toThrow(
      /does not exist/,
    );
  });

  it("LP: bps of the deposit's quote value, in the quote token", async () => {
    // 2 base at 150 USDC + 100 USDC = 400 USDC; 5 bps = 0.2 USDC.
    const { platform, charged } = await lpPlatformFee(
      chain,
      WALLET.toBase58(),
      { quoteTokenAddress: USDC.toBase58(), price: 150 },
      2,
      100,
      { bps: 5, recipient: VAULT.toBase58() },
    );
    expect(platform.prepend).toEqual([]);
    expect(transferChecked(platform.append[1]).amount).toBe(200_000n);
    expect(charged).toEqual({ bps: 5, amount: '0.2', mint: USDC.toBase58(), symbol: 'USDC' });
  });

  it('echoes an unlisted fee mint by its address', async () => {
    const { charged } = await appendedPlatformFee(chain, WALLET, T22, 1, { bps: 5, recipient: VAULT.toBase58() });
    expect(charged).toEqual({ bps: 5, amount: '0.0005', mint: T22.toBase58(), symbol: T22.toBase58() });
  });
});

describe('routerPlatformFee (Jupiter)', () => {
  // inAmount is raw: 123.456789 USDC in.
  const quote = { inputMint: USDC.toBase58(), outputMint: NATIVE_MINT.toBase58(), inAmount: '123456789' };

  it("names the recipient's input-mint account as feeAccount and prepends its create", async () => {
    quoteCache.set('q-fee', 'jupiter', quote, { platformFeeBps: 5 });
    const fee = await routerPlatformFee('jupiter', chain, WALLET.toBase58(), 'q-fee', {
      bps: 5,
      recipient: VAULT.toBase58(),
    });
    const vaultAta = getAssociatedTokenAddressSync(USDC, VAULT, true, TOKEN_PROGRAM_ID);
    expect(fee.feeAccount).toBe(vaultAta.toBase58());
    expect(fee.platform.append).toEqual([]);
    expect(fee.platform.prepend).toHaveLength(1);
    expect(fee.platform.prepend[0].programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(true);
    expect(fee.platform.prepend[0].keys[1].pubkey.equals(vaultAta)).toBe(true);
    // floor(123456789 × 5 / 10000) = 61728 raw.
    expect(fee.charged).toEqual({ bps: 5, amount: '0.061728', mint: USDC.toBase58(), symbol: 'USDC' });
  });

  it('refuses a quote made with other bps, or none', async () => {
    quoteCache.set('q-other', 'jupiter', quote, { platformFeeBps: 10 });
    quoteCache.set('q-none', 'jupiter', quote, {});
    const fee = { bps: 5, recipient: VAULT.toBase58() };
    await expect(routerPlatformFee('jupiter', chain, WALLET.toBase58(), 'q-other', fee)).rejects.toThrow(
      /platformFeeBps 10; platformFee.bps is 5/,
    );
    await expect(routerPlatformFee('jupiter', chain, WALLET.toBase58(), 'q-none', fee)).rejects.toThrow(
      /platformFeeBps unset/,
    );
  });

  it('charges any other Solana router (Pump) by a transfer of the quoted input after the trade', async () => {
    quoteCache.set('q-pump', 'pump', { venue: 'curve' }, {});
    recordRouterFeeQuote('pump', { quoteId: 'q-pump', tokenIn: NATIVE_MINT.toBase58(), amountIn: 0.002 }, 5);
    const fee = await routerPlatformFee('pump', chain, WALLET.toBase58(), 'q-pump', {
      bps: 5,
      recipient: VAULT.toBase58(),
    });
    expect(fee.feeAccount).toBeUndefined();
    expect(fee.platform.prepend).toEqual([]);
    const [transfer] = fee.platform.append;
    expect(transfer.programId.equals(SystemProgram.programId)).toBe(true);
    // floor(2 000 000 lamports × 5 / 10000) = 1000.
    expect(SystemInstruction.decodeTransfer(transfer).lamports).toBe(1000n);
    expect(SystemInstruction.decodeTransfer(transfer).toPubkey.equals(VAULT)).toBe(true);
    expect(fee.charged).toMatchObject({ bps: 5, amount: '0.000001', mint: NATIVE_MINT.toBase58() });
  });

  it('refuses a router off Solana', async () => {
    await expect(
      routerPlatformFee('uniswap', chain, WALLET.toBase58(), 'q-fee', { bps: 5, recipient: VAULT.toBase58() }),
    ).rejects.toThrow(/Solana routers only/);
  });
});

// ── routes ──────────────────────────────────────────────────────────────────

const mockBuildUnsigned = jest.fn();
jest.mock('../../src/trading/build-common', () => ({
  ...jest.requireActual('../../src/trading/build-common'),
  buildUnsigned: (...args: any[]) => mockBuildUnsigned(...args),
}));

const mockExecuteQuote = jest.fn();
const mockRouterQuote = jest.fn();
const mockLaunchQuote = jest.fn();
const mockLaunchExecuteQuote = jest.fn();
const mockPoolQuote = jest.fn();
const mockPoolExecute = jest.fn();
jest.mock('../../src/trading/connector-registry', () => ({
  ...jest.requireActual('../../src/trading/connector-registry'),
  getRouterOps: () => ({
    quoteSwap: (...args: any[]) => mockRouterQuote(...args),
    executeQuote: (...args: any[]) => mockExecuteQuote(...args),
  }),
  getLaunchOps: () => ({
    quoteSwap: (...args: any[]) => mockLaunchQuote(...args),
    executeQuote: (...args: any[]) => mockLaunchExecuteQuote(...args),
  }),
  getPoolOps: () => ({
    quoteSwap: (...args: any[]) => mockPoolQuote(...args),
    executeSwap: (...args: any[]) => mockPoolExecute(...args),
  }),
}));

jest.mock('../../src/trading/learn-pool', () => ({ learnPool: jest.fn() }));
jest.mock('../../src/connectors/meteora/clmm-routes/openPosition', () => ({ openPosition: jest.fn() }));
jest.mock('../../src/connectors/meteora/clmm-routes/addLiquidity', () => ({ addLiquidity: jest.fn() }));
jest.mock('../../src/connectors/meteora/amm-routes/addLiquidity', () => ({ addLiquidity: jest.fn() }));

const mockPositionInfo = jest.fn();
jest.mock('../../src/trading/clmm/positions', () => ({
  ...jest.requireActual('../../src/trading/clmm/positions'),
  getUnifiedPositionInfo: (...args: any[]) => mockPositionInfo(...args),
}));

const mockAmmPoolInfo = jest.fn();
jest.mock('../../src/trading/trading-amm-routes/pool-info', () => ({
  ...jest.requireActual('../../src/trading/trading-amm-routes/pool-info'),
  getAmmPoolInfo: (...args: any[]) => mockAmmPoolInfo(...args),
}));

const mockPoolInfo = jest.fn();
jest.mock('../../src/trading/clmm/pools', () => ({
  ...jest.requireActual('../../src/trading/clmm/pools'),
  getUnifiedPoolInfo: (...args: any[]) => mockPoolInfo(...args),
}));

const BUILT = {
  transaction: Buffer.from('unsigned-tx').toString('base64'),
  feePayer: WALLET.toBase58(),
  recentBlockhash: 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N',
  lastValidBlockHeight: 2,
  currentBlockHeight: 1,
  extraSigners: [],
};
const POOL = '2sf5NYcY4zUPXUSmG6f66mskb24t5F8S11pC1Nz5nQT3';
const FEE = { bps: 5, recipient: VAULT.toBase58() };

describe('routes carry the fee into the build', () => {
  let app: any;

  beforeAll(async () => {
    app = fastifyWithTypeProvider();
    await app.register(require('@fastify/sensible'));
    const { makeBuildSwapRoute } = await import('../../src/trading/pool-swap-routes');
    const { buildQuoteRoute } = await import('../../src/trading/trading-router-routes/buildQuote');
    const { buildSwapRoute: routerBuildSwap } = await import('../../src/trading/trading-router-routes/buildSwap');
    const { buildSwapRoute: launchBuildSwap } = await import('../../src/trading/trading-launch-routes/build-swap');
    const { openPositionRoute } = await import('../../src/trading/trading-clmm-routes/open');
    const { addLiquidityRoute: clmmAdd } = await import('../../src/trading/trading-clmm-routes/add');
    const { addLiquidityRoute: ammAdd } = await import('../../src/trading/trading-amm-routes/add');
    await app.register(makeBuildSwapRoute('clmm'), { prefix: '/clmm' });
    await app.register(buildQuoteRoute, { prefix: '/router' });
    await app.register(routerBuildSwap, { prefix: '/router' });
    await app.register(launchBuildSwap, { prefix: '/launch' });
    await app.register(openPositionRoute, { prefix: '/clmm' });
    await app.register(clmmAdd, { prefix: '/clmm' });
    await app.register(ammAdd, { prefix: '/amm' });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildUnsigned.mockImplementation(async (_chain, _connector, _extra, run) => {
      await run();
      return BUILT;
    });
  });

  /** The `platform` argument the route handed buildUnsigned. */
  const platformArg = () => mockBuildUnsigned.mock.calls[0][5];

  it('clmm build-swap: a BUY pays bps of the quoted input, in the input token, after the swap', async () => {
    mockPoolQuote.mockResolvedValue({ tokenIn: USDC.toBase58(), amountIn: 150.5 });
    const response = await app.inject({
      method: 'POST',
      url: '/clmm/build-swap',
      payload: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'meteora',
        walletAddress: WALLET.toBase58(),
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: 1,
        side: 'BUY',
        poolAddress: POOL,
        platformFee: FEE,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(mockPoolQuote).toHaveBeenCalledWith(expect.objectContaining({ side: 'BUY', amount: 1, poolAddress: POOL }));
    const { prepend, append } = platformArg();
    expect(prepend).toEqual([]);
    // 150.5 USDC × 5 bps = 0.075250 USDC.
    expect(transferChecked(append[1]).amount).toBe(75_250n);
    expect(mockPoolExecute).toHaveBeenCalled();
    expect(JSON.parse(response.body)).toEqual({
      ...BUILT,
      platformFee: { bps: 5, amount: '0.07525', mint: USDC.toBase58(), symbol: 'USDC' },
    });
  });

  it('clmm build-swap: a SOL input pays lamports', async () => {
    mockPoolQuote.mockResolvedValue({ tokenIn: NATIVE_MINT.toBase58(), amountIn: 2 });
    const response = await app.inject({
      method: 'POST',
      url: '/clmm/build-swap',
      payload: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'meteora',
        walletAddress: WALLET.toBase58(),
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: 2,
        side: 'SELL',
        poolAddress: POOL,
        platformFee: FEE,
      },
    });
    const [transfer] = platformArg().append;
    expect(SystemInstruction.decodeTransfer(transfer).lamports).toBe(1_000_000n);
    expect(JSON.parse(response.body).platformFee).toEqual({
      bps: 5,
      amount: '0.001',
      mint: NATIVE_MINT.toBase58(),
      symbol: 'WSOL',
    });
  });

  it('clmm build-swap without platformFee quotes nothing extra, adds nothing and echoes nothing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/clmm/build-swap',
      payload: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'meteora',
        walletAddress: WALLET.toBase58(),
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: 2,
        side: 'SELL',
        poolAddress: POOL,
      },
    });
    expect(mockPoolQuote).not.toHaveBeenCalled();
    expect(platformArg()).toBeUndefined();
    expect(JSON.parse(response.body)).toEqual(BUILT);
  });

  it('router build-quote: Jupiter gets the feeAccount, the create is prepended', async () => {
    quoteCache.set(
      'q-route',
      'jupiter',
      { inputMint: NATIVE_MINT.toBase58(), inAmount: '1000000000' },
      {
        platformFeeBps: 5,
      },
    );
    const response = await app.inject({
      method: 'POST',
      url: '/router/build-quote',
      payload: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'jupiter',
        walletAddress: WALLET.toBase58(),
        quoteId: 'q-route',
        platformFee: FEE,
      },
    });
    expect(response.statusCode).toBe(200);
    const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, VAULT, true, TOKEN_PROGRAM_ID).toBase58();
    expect(mockExecuteQuote).toHaveBeenCalledWith(WALLET.toBase58(), 'mainnet-beta', 'q-route', wsolAta);
    expect(platformArg().prepend[0].keys[1].pubkey.toBase58()).toBe(wsolAta);
    expect(JSON.parse(response.body).platformFee).toEqual({
      bps: 5,
      amount: '0.0005',
      mint: NATIVE_MINT.toBase58(),
      symbol: 'WSOL',
    });
  });

  it('router build-quote: bps that differ from the quote are a 400', async () => {
    quoteCache.set('q-mismatch', 'jupiter', { inputMint: USDC.toBase58() }, { platformFeeBps: 10 });
    const response = await app.inject({
      method: 'POST',
      url: '/router/build-quote',
      payload: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'jupiter',
        walletAddress: WALLET.toBase58(),
        quoteId: 'q-mismatch',
        platformFee: FEE,
      },
    });
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/platformFeeBps 10/);
    expect(mockBuildUnsigned).not.toHaveBeenCalled();
  });

  it("clmm build-open: bps of (quote + base × pool price) in the pool's quote token", async () => {
    mockPoolInfo.mockResolvedValue({ quoteTokenAddress: USDC.toBase58(), price: 200 });
    const response = await app.inject({
      method: 'POST',
      url: '/clmm/build-open',
      payload: {
        connector: 'meteora',
        chainNetwork: 'solana-mainnet-beta',
        walletAddress: WALLET.toBase58(),
        lowerPrice: 100,
        upperPrice: 300,
        poolAddress: POOL,
        baseTokenAmount: 0.5,
        quoteTokenAmount: 50,
        platformFee: FEE,
      },
    });
    expect(mockPoolInfo).toHaveBeenCalledWith(expect.anything(), 'meteora', 'solana-mainnet-beta', POOL);
    // (50 + 0.5 × 200) = 150 USDC; 5 bps = 0.075 USDC.
    expect(transferChecked(platformArg().append[1]).amount).toBe(75_000n);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).platformFee).toEqual({
      bps: 5,
      amount: '0.075',
      mint: USDC.toBase58(),
      symbol: 'USDC',
    });
  });

  // A launch-curve or router quote in the response shape the build routes serialize.
  const routeQuote = (tokenIn: string, amountIn: number, quoteId: string) => ({
    quoteId,
    tokenIn,
    tokenOut: USDC.toBase58(),
    amountIn,
    amountOut: 1,
    price: 1,
    priceImpactPct: 0,
    minAmountOut: 1,
    maxAmountIn: amountIn,
  });

  it('launch build-swap: bps of the quoted input after the trade, echoed beside the quote', async () => {
    mockLaunchQuote.mockResolvedValue(routeQuote(NATIVE_MINT.toBase58(), 0.5, 'lq-1'));
    const response = await app.inject({
      method: 'POST',
      url: '/launch/build-swap',
      payload: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'meteora',
        walletAddress: WALLET.toBase58(),
        baseToken: T22.toBase58(),
        quoteToken: 'SOL',
        amount: 0.5,
        side: 'BUY',
        platformFee: FEE,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(mockLaunchExecuteQuote).toHaveBeenCalledWith(WALLET.toBase58(), 'mainnet-beta', 'lq-1');
    expect(SystemInstruction.decodeTransfer(platformArg().append[0]).lamports).toBe(250_000n);
    const body = JSON.parse(response.body);
    expect(body.quote.quoteId).toBe('lq-1');
    expect(body.platformFee).toEqual({ bps: 5, amount: '0.00025', mint: NATIVE_MINT.toBase58(), symbol: 'WSOL' });
  });

  it('router build-swap: quotes with the bps, builds with the feeAccount and echoes the fee', async () => {
    mockRouterQuote.mockImplementation(async (args: any) => {
      quoteCache.set(
        'rq-1',
        'jupiter',
        { inputMint: USDC.toBase58(), inAmount: '20000000' },
        {
          platformFeeBps: args.platformFeeBps,
        },
      );
      return routeQuote(USDC.toBase58(), 20, 'rq-1');
    });
    const response = await app.inject({
      method: 'POST',
      url: '/router/build-swap',
      payload: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'jupiter',
        walletAddress: WALLET.toBase58(),
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: 0.1,
        side: 'BUY',
        platformFee: FEE,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(mockRouterQuote).toHaveBeenCalledWith(expect.objectContaining({ platformFeeBps: 5 }));
    const usdcAta = getAssociatedTokenAddressSync(USDC, VAULT, true, TOKEN_PROGRAM_ID).toBase58();
    expect(mockExecuteQuote).toHaveBeenCalledWith(WALLET.toBase58(), 'mainnet-beta', 'rq-1', usdcAta);
    // floor(20000000 × 5 / 10000) = 10000 raw = 0.01 USDC.
    expect(JSON.parse(response.body).platformFee).toEqual({
      bps: 5,
      amount: '0.01',
      mint: USDC.toBase58(),
      symbol: 'USDC',
    });
  });

  it("clmm build-add: the position's pool prices the deposit", async () => {
    mockPositionInfo.mockResolvedValue({ poolAddress: POOL });
    mockPoolInfo.mockResolvedValue({ quoteTokenAddress: USDC.toBase58(), price: 100 });
    const response = await app.inject({
      method: 'POST',
      url: '/clmm/build-add',
      payload: {
        connector: 'meteora',
        chainNetwork: 'solana-mainnet-beta',
        walletAddress: WALLET.toBase58(),
        positionAddress: VAULT.toBase58(),
        baseTokenAmount: 1,
        quoteTokenAmount: 100,
        platformFee: FEE,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(mockPoolInfo).toHaveBeenCalledWith(expect.anything(), 'meteora', 'solana-mainnet-beta', POOL);
    // (100 + 1 × 100) = 200 USDC; 5 bps = 0.1 USDC.
    expect(transferChecked(platformArg().append[1]).amount).toBe(100_000n);
    expect(JSON.parse(response.body).platformFee).toEqual({
      bps: 5,
      amount: '0.1',
      mint: USDC.toBase58(),
      symbol: 'USDC',
    });
  });

  it("amm build-add: the pool's price values the deposit", async () => {
    mockAmmPoolInfo.mockResolvedValue({ quoteTokenAddress: NATIVE_MINT.toBase58(), price: 0.5 });
    const response = await app.inject({
      method: 'POST',
      url: '/amm/build-add',
      payload: {
        connector: 'meteora',
        chainNetwork: 'solana-mainnet-beta',
        walletAddress: WALLET.toBase58(),
        poolAddress: POOL,
        baseTokenAmount: 4,
        quoteTokenAmount: 2,
        platformFee: FEE,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(mockAmmPoolInfo).toHaveBeenCalledWith('meteora', 'mainnet-beta', POOL);
    // (2 + 4 × 0.5) = 4 SOL; 5 bps = 0.002 SOL, as lamports.
    expect(SystemInstruction.decodeTransfer(platformArg().append[0]).lamports).toBe(2_000_000n);
    expect(JSON.parse(response.body).platformFee).toEqual({
      bps: 5,
      amount: '0.002',
      mint: NATIVE_MINT.toBase58(),
      symbol: 'WSOL',
    });
  });
});

describe('Jupiter executeQuote', () => {
  it('refuses a fee-priced quote without a fee account, and a fee account on a quote without a fee', async () => {
    const { executeQuote } = await import('../../src/connectors/jupiter/router-routes/executeQuote');
    quoteCache.set('q-needs-fee', 'jupiter', { inputMint: USDC.toBase58() }, { platformFeeBps: 5 });
    quoteCache.set('q-no-fee', 'jupiter', { inputMint: USDC.toBase58() }, {});
    await expect(executeQuote(WALLET.toBase58(), 'mainnet-beta', 'q-needs-fee')).rejects.toThrow(
      /carries a 5 bps platform fee/,
    );
    await expect(executeQuote(WALLET.toBase58(), 'mainnet-beta', 'q-no-fee', VAULT.toBase58())).rejects.toThrow(
      /takes no fee account/,
    );
  });
});
