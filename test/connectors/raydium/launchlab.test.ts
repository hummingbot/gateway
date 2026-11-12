/**
 * The LaunchLab builders against a real launch: mainnet transaction
 * 4ahrum4b6gPHhYeASNTLsM4zLQP9T8RRW2S4yBbuNf5QWsWj1Gd2vftYQ2xaS9AcVddwxW7XeeDVu9F5aoLBtEb9,
 * `initialize_v2` on Raydium's platform (1 B supply, 800 M for sale, 85 SOL
 * to raise, CPMM) and the creator's 5 SOL `buy_exact_in` in the same
 * transaction. Its bytes, account lists and outcome were read off the chain.
 */
import { LaunchpadConfig, PlatformConfig } from '@raydium-io/raydium-sdk-v2';
import { NATIVE_MINT } from '@solana/spl-token';
import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import BN from 'bn.js';

import {
  buyInstruction,
  claimCreatorFeeInstruction,
  createInstruction,
  freshPool,
  globalConfigFor,
  launchCurveParams,
  launchTradeAccounts,
  quoteBuyExactIn,
  quoteSellExactIn,
  spotPrice,
} from '../../../src/connectors/raydium/launchlab/launchlab';

const pk = (s: string) => new PublicKey(s);
const CREATOR = pk('D5TND5V3XcjTpCLieHJ5CjXf1mmuKov5wtDfAGqjredu');
const MINT = pk('HNfmFAjMAz2gBh78wpZXhzn3iRTMN6iSWxdcfNCetray');
const PARAMS = {
  supply: new BN('1000000000000000'),
  totalSellA: new BN('800000000000000'),
  totalFundRaisingB: new BN('85000000000'),
};

/** Each account as `address s|- w|-`, the way the explorer lists them. */
const metas = (ix: TransactionInstruction) =>
  ix.keys.map((k) => `${k.pubkey.toBase58()} ${k.isSigner ? 's' : '-'}${k.isWritable ? 'w' : '-'}`);

/** The two configs as they stood (SOL global, Raydium's platform). */
const GLOBAL = {
  migrateFee: new BN(0),
  tradeFeeRate: new BN(2500),
  curveType: 0,
} as unknown as ReturnType<typeof LaunchpadConfig.decode>;
const PLATFORM = {
  feeRate: new BN(7500),
  creatorFeeRate: new BN(500),
} as unknown as ReturnType<typeof PlatformConfig.decode>;

describe('Raydium LaunchLab builders', () => {
  it('initialize_v2 is the reference launch to the byte', () => {
    const ix = createInstruction({
      payer: CREATOR,
      creator: CREATOR,
      mint: MINT,
      quoteMint: NATIVE_MINT,
      name: 'Seven',
      symbol: '7',
      uri: 'https://ipfs.io/ipfs/bafkreicdyr7q3cydzggcznkrigwjskkuuaswf5kt7whouhluvwzodnhndy',
      params: PARAMS,
    });
    expect(Buffer.from(Uint8Array.from(ix.data)).toString('hex')).toBe(
      '4399af27da1026200605000000536576656e01000000375000000068747470733a2f2f697066732e696f2f697066732f' +
        '6261666b726569636479723771336379647a6767637a6e6b726967776a736b6b757561737766356b743777686f7568' +
        '6c7576777a6f646e686e6479000080c6a47e8d03000000d28398d70200001265ca13000000010000000000000000000000' +
        '0000000000000000000000000000',
    );
    // The creator is an argument, not a signer: here it is also the payer,
    // which the transaction lists as a signer once for both.
    expect(metas(ix)).toEqual([
      'D5TND5V3XcjTpCLieHJ5CjXf1mmuKov5wtDfAGqjredu sw',
      'D5TND5V3XcjTpCLieHJ5CjXf1mmuKov5wtDfAGqjredu --',
      '6s1xP3hpbAfFoNtUNF8mfHsjr2Bd97JxFJRWLbL6aHuX --',
      '4Bu96XjU84XjPDSpveTVf6LYGCkfW5FK7SNkREWcEfV4 --',
      'WLHv2UAZm6z4KyaaELi5pjdbJh6RESMva1Rnn8pJVVh --',
      '7Zz3ZPBcDCqgXfgcWtVYNLqpM673A9WtanHimXZtcErk -w',
      'HNfmFAjMAz2gBh78wpZXhzn3iRTMN6iSWxdcfNCetray sw',
      'So11111111111111111111111111111111111111112 --',
      '6fzL42WGH21w3tiM9V29dMbXqzgUPm4XzooqTgxEHzHY -w',
      'F1xaMu4cbzTvC4hA6jaMEuoahCCz95qf2aeKoV3XXHnh -w',
      'DqNdimCqLxCLNE7WqLURBipxD3WyhbuyoeFHroSxtfRu -w',
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA --',
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA --',
      'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s --',
      '11111111111111111111111111111111 --',
      'SysvarRent111111111111111111111111111111111 --',
      '2DPAtwB8L12vrMRExbLuyGnC7n2J5LNoZQSejeQGpwkr --',
      'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj --',
    ]);
  });

  it('buy_exact_in is the reference buy to the byte, fee vaults and all', () => {
    const accounts = launchTradeAccounts(MINT, NATIVE_MINT, CREATOR, CREATOR);
    const ix = buyInstruction(accounts, new BN(5_000_000_000), new BN('157776898616899'));
    expect(Buffer.from(Uint8Array.from(ix.data)).toString('hex')).toBe(
      'faea0d7bd59c13ec00f2052a0100000043eefe4b7f8f00000000000000000000',
    );
    expect(metas(ix)).toEqual([
      'D5TND5V3XcjTpCLieHJ5CjXf1mmuKov5wtDfAGqjredu sw',
      'WLHv2UAZm6z4KyaaELi5pjdbJh6RESMva1Rnn8pJVVh --',
      '6s1xP3hpbAfFoNtUNF8mfHsjr2Bd97JxFJRWLbL6aHuX --',
      '4Bu96XjU84XjPDSpveTVf6LYGCkfW5FK7SNkREWcEfV4 --',
      '7Zz3ZPBcDCqgXfgcWtVYNLqpM673A9WtanHimXZtcErk -w',
      '88PBM4K1BLgLBNhNVbPuNNXDnsW7SopWe3J71dR6s6dC -w',
      '2WffwUdojgna61EsgE8C2Enz6yFfVUJGAmwbAxSuvmt6 -w',
      '6fzL42WGH21w3tiM9V29dMbXqzgUPm4XzooqTgxEHzHY -w',
      'F1xaMu4cbzTvC4hA6jaMEuoahCCz95qf2aeKoV3XXHnh -w',
      'HNfmFAjMAz2gBh78wpZXhzn3iRTMN6iSWxdcfNCetray --',
      'So11111111111111111111111111111111111111112 --',
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA --',
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA --',
      '2DPAtwB8L12vrMRExbLuyGnC7n2J5LNoZQSejeQGpwkr --',
      'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj --',
      '11111111111111111111111111111111 --',
      'EQLuLJ9X5oHpVAxJ77BvQxGu9Nbk8ssnrbferXDnN7Sa -w',
      'AW7M8svG1JDwXxZv2juYai1homfSf4JZYfDzdyFMSdP6 -w',
    ]);
  });

  it('quotes the first buy as the chain filled it', () => {
    // The pool's own virtual reserves, as initialize_v2 wrote them.
    const pool = freshPool(PARAMS, GLOBAL);
    expect(pool.virtualA.toString()).toBe('1066666666666666');
    expect(pool.virtualB.toString()).toBe('28333333333');
    const quote = quoteBuyExactIn(pool, GLOBAL, PLATFORM, new BN(5_000_000_000));
    // What the creator received on chain.
    expect(quote.amountOut.toString()).toBe('158569747353667');
    expect(quote.amountIn.toString()).toBe('5000000000');
    // 0.25 % protocol + 0.75 % platform + 0.05 % creator, rounded up.
    expect(quote.fee.toString()).toBe('52500000');
    // 28.3 SOL against 1.067 B virtual: 2.656e-8 SOL a token at the start.
    expect(spotPrice(pool, 9).toNumber()).toBeCloseTo(0.0000000265625, 13);
  });

  it('a sell returns less than the buy spent, and never more than the curve holds', () => {
    const pool = freshPool(PARAMS, GLOBAL);
    const bought = quoteBuyExactIn(pool, GLOBAL, PLATFORM, new BN(5_000_000_000));
    const after = { ...pool, realA: bought.amountOut, realB: new BN(5_000_000_000).sub(bought.fee) };
    const sold = quoteSellExactIn(after, GLOBAL, PLATFORM, bought.amountOut);
    expect(sold.amountOut.lt(new BN(5_000_000_000))).toBe(true);
    expect(() => quoteSellExactIn(after, GLOBAL, PLATFORM, bought.amountOut.addn(1))).toThrow(/cannot buy back more/);
  });

  it('derives the global per quote and the creator fee claim for the pot', () => {
    expect(globalConfigFor(NATIVE_MINT).toBase58()).toBe('6s1xP3hpbAfFoNtUNF8mfHsjr2Bd97JxFJRWLbL6aHuX');
    expect(globalConfigFor(pk('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toBase58()).toBe(
      '8gj14w8vkNZjJTPak6e96Uf1sY438WKheH4s5dHyxiRw',
    );
    const claim = claimCreatorFeeInstruction(CREATOR, NATIVE_MINT);
    expect([...claim.data]).toEqual([26, 97, 138, 203, 132, 171, 141, 252]);
    // The creator signs; the creator fee vault is the one the buy paid into.
    expect(metas(claim).slice(0, 3)).toEqual([
      'D5TND5V3XcjTpCLieHJ5CjXf1mmuKov5wtDfAGqjredu sw',
      '9sHpTfmVpCfP2zexRNK6j38NBchMv1RWpdXPK5NEcZan --',
      'AW7M8svG1JDwXxZv2juYai1homfSf4JZYfDzdyFMSdP6 -w',
    ]);
  });

  describe('launch terms', () => {
    // The SOL global's bounds, as Raydium set them: 10 M tokens, 20 % sold,
    // 15 % left to migrate, 24 SOL raised.
    const SOL_GLOBAL = {
      ...GLOBAL,
      minSupplyA: new BN(10_000_000),
      minSellRateA: new BN(200_000),
      minMigrateRateA: new BN(150_000),
      minFundRaisingB: new BN(24_000_000_000),
      maxLockRate: new BN(800_000),
    } as unknown as ReturnType<typeof LaunchpadConfig.decode>;
    // Only a USDC launch without a raise reads the chain.
    const offline = {} as Connection;
    const terms = (o: object) => launchCurveParams(offline, NATIVE_MINT, SOL_GLOBAL, o);

    it('defaults to a billion tokens, 80 % sold, 85 SOL raised — the reference launch', async () => {
      const p = await terms({});
      expect([p.supply, p.totalSellA, p.totalFundRaisingB].map(String)).toEqual([
        PARAMS.supply.toString(),
        PARAMS.totalSellA.toString(),
        PARAMS.totalFundRaisingB.toString(),
      ]);
    });

    it("refuses what the global or the curve's arithmetic would", async () => {
      await expect(terms({ sellSharePct: 50 })).rejects.toThrow(/sellSharePct must be above 50 and at most 85/);
      await expect(terms({ sellSharePct: 86 })).rejects.toThrow(/sellSharePct/);
      await expect(terms({ raise: 23 })).rejects.toThrow(/raise at least 24 SOL/);
      // Meteora's default ten thousand is a thousandth of LaunchLab's floor.
      for (const supply of [9_999_999, 10_000, 1_000]) {
        await expect(terms({ supply })).rejects.toThrow(/at least LaunchLab's minimum of 10000000 \(got/);
      }
      await expect(terms({ supply: 1.5 })).rejects.toThrow(/whole number/);
      await expect(terms({ sellSharePct: 85, raise: 24, supply: 10_000_000 })).resolves.toBeDefined();
    });
  });
});
