import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

import {
  constantProductPriceImpactPct,
  fromRawAmount,
  pumpSwapTotalFeeBps,
  toRawAmount,
  uploadTokenMetadata,
} from '../../../src/connectors/pump/pump.utils';

// pumpPoolAuthorityPda(baseMint) — recomputed here so the canonical-pool branch
// can be exercised without importing the helper under test's own dependency.
const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const poolAuthority = (mint: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from('pool-authority'), mint.toBuffer()], PUMP_PROGRAM_ID)[0];

const BASE_MINT = new PublicKey('So11111111111111111111111111111111111111112');

const fees = (lp: number, protocol: number, creator: number) => ({
  lpFeeBps: new BN(lp),
  protocolFeeBps: new BN(protocol),
  creatorFeeBps: new BN(creator),
});

const globalConfig: any = {
  lpFeeBasisPoints: new BN(20),
  protocolFeeBasisPoints: new BN(5),
  coinCreatorFeeBasisPoints: new BN(5),
};

const basePool: any = {
  baseMint: BASE_MINT,
  creator: PublicKey.unique(),
  coinCreator: PublicKey.unique(),
};

describe('raw amount conversion', () => {
  it('round-trips without float drift', () => {
    expect(toRawAmount(1.234567, 6).toString()).toBe('1234567');
    expect(fromRawAmount(new BN('1234567'), 6)).toBe(1.234567);
    // 0.1 + 0.2 style drift: 1.1 * 10^9 must not become 1100000000.0000001 -> floor error
    expect(toRawAmount(1.1, 9).toString()).toBe('1100000000');
  });
});

describe('pumpSwapTotalFeeBps', () => {
  const reserves = {
    baseReserve: new BN('1000000000000'),
    quoteReserve: new BN('50000000000'),
    baseMintSupply: new BN('1000000000000000'),
  };

  it('falls back to GlobalConfig flat fees when no FeeConfig exists', () => {
    expect(pumpSwapTotalFeeBps({ globalConfig, feeConfig: null, pool: basePool, ...reserves })).toBe(30);
  });

  it('omits the coin-creator fee when the pool has no coin creator', () => {
    const pool = { ...basePool, coinCreator: PublicKey.default };
    expect(pumpSwapTotalFeeBps({ globalConfig, feeConfig: null, pool, ...reserves })).toBe(25);
  });

  it('uses flat FeeConfig fees for a non-canonical pool', () => {
    const feeConfig: any = {
      flatFees: fees(30, 10, 10),
      feeTiers: [{ marketCapLamportsThreshold: new BN(0), fees: fees(1, 1, 1) }],
    };
    expect(pumpSwapTotalFeeBps({ globalConfig, feeConfig, pool: basePool, ...reserves })).toBe(50);
  });

  it('selects the market-cap tier for a canonical pump pool', () => {
    const pool = { ...basePool, creator: poolAuthority(BASE_MINT) };
    // marketCap = quote * supply / base = 50e9 * 1e15 / 1e12 = 5e13 lamports
    const feeConfig: any = {
      flatFees: fees(99, 99, 99),
      feeTiers: [
        { marketCapLamportsThreshold: new BN(0), fees: fees(20, 61, 30) },
        { marketCapLamportsThreshold: new BN('1000000000000'), fees: fees(20, 10, 5) },
        { marketCapLamportsThreshold: new BN('100000000000000'), fees: fees(20, 5, 1) },
      ],
    };
    // 5e13 sits in the middle tier: 20 + 10 + 5
    expect(pumpSwapTotalFeeBps({ globalConfig, feeConfig, pool, ...reserves })).toBe(35);
  });
});

describe('constantProductPriceImpactPct', () => {
  const reserve = new BN(1_000_000);

  it('is t/(x-t) for a buy and t/(x+t) for a sell', () => {
    const t = new BN(10_000);
    expect(constantProductPriceImpactPct('BUY', t, reserve)).toBeCloseTo((10_000 / 990_000) * 100, 6);
    expect(constantProductPriceImpactPct('SELL', t, reserve)).toBeCloseTo((10_000 / 1_010_000) * 100, 6);
  });

  it('is ~0 for a dust-sized trade', () => {
    expect(constantProductPriceImpactPct('BUY', new BN(1), reserve)).toBeLessThan(0.001);
  });
});

describe('uploadTokenMetadata', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fetches the image, posts the form, and returns the metadataUri', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    global.fetch = jest.fn(async (url: any, init?: any) => {
      calls.push({ url: String(url), init });
      if (calls.length === 1) {
        return new Response(Buffer.from('png-bytes'), { status: 200 });
      }
      return new Response(JSON.stringify({ metadataUri: 'https://ipfs.io/ipfs/QmTest' }), { status: 200 });
    }) as any;

    const uri = await uploadTokenMetadata('https://upload.example/api/ipfs', {
      name: 'Test Token',
      symbol: 'TEST',
      description: 'a test',
      imageUrl: 'https://img.example/logo.png',
    });

    expect(uri).toBe('https://ipfs.io/ipfs/QmTest');
    expect(calls[0].url).toBe('https://img.example/logo.png');
    expect(calls[1].url).toBe('https://upload.example/api/ipfs');
    expect(calls[1].init?.method).toBe('POST');
  });

  it('throws a clear 400 when the image cannot be fetched', async () => {
    global.fetch = jest.fn(async () => new Response('nope', { status: 404 })) as any;
    await expect(
      uploadTokenMetadata('https://upload.example/api/ipfs', {
        name: 'T',
        symbol: 'T',
        imageUrl: 'https://img.example/missing.png',
      }),
    ).rejects.toThrow(/Failed to fetch token image/);
  });

  it('tells the caller to pass metadataUri when the upload endpoint fails', async () => {
    let call = 0;
    global.fetch = jest.fn(async () => {
      call += 1;
      return call === 1
        ? new Response(Buffer.from('png'), { status: 200 })
        : new Response('cloudflare says no', { status: 403 });
    }) as any;

    await expect(
      uploadTokenMetadata('https://upload.example/api/ipfs', {
        name: 'T',
        symbol: 'T',
        imageUrl: 'https://img.example/logo.png',
      }),
    ).rejects.toThrow(/pass metadataUri instead/i);
  });
});
