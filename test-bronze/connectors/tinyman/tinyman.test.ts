jest.useFakeTimers();
import { Tinyman } from '../../../src/connectors/tinyman/tinyman';
import { patch, unpatch } from '../../../test/services/patch';
import { Algorand } from '../../../src/chains/algorand/algorand';
import { poolUtils, SwapQuoteType, } from '@tinymanorg/tinyman-js-sdk';
import { getAlgorandConfig } from '../../../src/chains/algorand/algorand.config';

let algorand: Algorand;
let tm: Tinyman;
const EXPECTED_CURRENT_BLOCK_NUMBER = 100;
const CHAIN_NAME = 'algorand';
const NETWORK = 'testnet';
const CONFIG = getAlgorandConfig(NETWORK);
const NATIVE_TOKEN = CONFIG.nativeCurrencySymbol;
const NATIVE_TOKEN_ID = 0;
const USDC_TOKEN = 'USDC';
const USDC_TOKEN_ID = 10458941;
const TX = {
  txnID: 1234,
  round: 1,
  quote: {},
  assetOut: undefined,
};
const MNEUMONIC =
  'share' +
  ' general' +
  ' gasp' +
  ' trial' +
  ' until' +
  ' jelly' +
  ' mobile' +
  ' category' +
  ' viable' +
  ' meadow' +
  ' civil' +
  ' pigeon' +
  ' dream' +
  ' vehicle' +
  ' process' +
  ' crack' +
  ' devote' +
  ' outside' +
  ' ankle' +
  ' mobile' +
  ' analyst' +
  ' stomach' +
  ' dignity' +
  ' above' +
  ' vast'; // mock
const ALGO_DECIMALS = 6;
const USDC_DECIMALS = 6;

export const patchCurrentBlockNumber = (
  withError: boolean = false,
  instance: Algorand | undefined = undefined,
  expectedCurrentBlockNumber: number = EXPECTED_CURRENT_BLOCK_NUMBER
) => {
  instance = instance !== undefined ? instance : algorand;
  patch(instance.algod, 'status', () => {
    return withError
      ? {}
      : {
          do: async () => {
            return { 'next-version-round': expectedCurrentBlockNumber };
          },
        };
  });
};

export const patchGetAssetData = () => {
  patch(algorand, 'getAssetData', async () => {
    return [
      {
        id: NATIVE_TOKEN_ID.toString(),
        is_liquidity_token: false,
        name: 'Algorand',
        unit_name: NATIVE_TOKEN,
        decimals: ALGO_DECIMALS,
        total_amount: null,
        url: 'https://algorand.org',
        is_verified: true,
        clawback_address: '',
        liquidity_in_usd: '744662.849801994861',
        last_day_volume_in_usd: '58.407348762305',
        last_week_volume_in_usd: '2261.387003578427',
        last_day_price_change: '-0.156310',
        is_stable: false,
        is_wrapped: false,
      },
      {
        id: USDC_TOKEN_ID.toString(),
        is_liquidity_token: false,
        name: 'USDC',
        unit_name: USDC_TOKEN,
        decimals: USDC_DECIMALS,
        total_amount: '18446744073709551615',
        url: 'https://centre.io',
        is_verified: true,
        clawback_address:
          'XM2W7VZODABS6RAL3FENBRKCOF6XLOQZZWIVVZTBYCVH2ADRYKN53CQLXM',
        liquidity_in_usd: '210464.272543000000',
        last_day_volume_in_usd: '8.000000000000',
        last_week_volume_in_usd: '6198.073873000000',
        last_day_price_change: '0.000000',
        is_stable: false,
        is_wrapped: false,
      },
    ];
  });
};

beforeAll(async () => {
  algorand = Algorand.getInstance(NETWORK);
  patchCurrentBlockNumber();
  patchGetAssetData();
  await algorand.init();

  tm = Tinyman.getInstance(NETWORK);
  await tm.init();
});

afterEach(() => {
  unpatch();
});

afterAll(async () => {
  await algorand.close();
});

const patchSwap = () => {
  patch(tm.swap, 'v2', {
    getQuote() {
      return { type: SwapQuoteType.Direct, data: { quote: { rate: 1 } } };
    },
    generateTxns() {
      return [];
    },
    signTxns() {
      return;
    },
    async execute() {
      return TX;
    },
  });
};

const patchFetcher = () => {
  patch(poolUtils.v2, 'getPoolInfo', () => {
    return {
      account: {
        lsig: {
          tag: new Uint8Array([80, 114, 111, 103, 114, 97, 109]),
          logic: new Uint8Array([
            6, 128, 24, 0, 0, 0, 0, 59, 193, 147, 29, 0, 0, 0, 0, 1, 225, 171,
            112, 0, 0, 0, 0, 0, 0, 0, 0, 129, 0, 91, 53, 0, 52, 0, 49, 24, 18,
            68, 49, 25, 129, 1, 18, 68, 129, 1, 67,
          ]),
          args: undefined,
          sig: undefined,
          msig: undefined,
        },
        sigkey: undefined,
      },
      validatorAppID: 1002541853,
      asset1ID: 31566704,
      asset2ID: 0,
      status: 'ready',
      contractVersion: 'v2',
      asset1ProtocolFees: BigInt('10961420982'),
      asset2ProtocolFees: BigInt('48196942141'),
      asset1Reserves: BigInt('1200097723737'),
      asset2Reserves: BigInt('6633822022882'),
      issuedPoolTokens: BigInt('2690871970933'),
      cumulativePriceUpdateTimeStamp: 1682547803,
      protocolFeeRatio: 6,
      totalFeeShare: BigInt('30'),
      poolTokenID: 1002590888,
    };
  });
};

describe('verify Tinyman estimate Sell Trade', () => {
  it('Should return an ExpectedTrade when available', async () => {
    patchFetcher();

    const expectedTrade = await tm.estimateTrade({
      chain: CHAIN_NAME,
      network: NETWORK,
      base: 'ALGO',
      quote: 'USDC',
      amount: '1',
      side: 'SELL',
    });
    expect(expectedTrade).toHaveProperty('trade');
    expect(expectedTrade).toHaveProperty('expectedAmount');
    expect(expectedTrade.expectedAmount).toEqual(0.180363);
    expect(expectedTrade.expectedPrice).toEqual(0.180363);
  });

  it('Should throw an error if no pair is available', async () => {
    patchFetcher();

    await expect(async () => {
      await tm.estimateTrade({
        chain: CHAIN_NAME,
        network: NETWORK,
        base: 'ETH',
        quote: 'DAI',
        amount: '1',
        side: 'SELL',
      });
    }).rejects.toThrow('');
  });
});

describe('verify Tinyman estimate Buy Trade', () => {
  it('Should return an ExpectedTrade when available', async () => {
    patchFetcher();

    const expectedTrade = await tm.estimateTrade({
      chain: CHAIN_NAME,
      network: NETWORK,
      base: 'ALGO',
      quote: 'USDC',
      amount: '1',
      side: 'BUY',
    });
    expect(expectedTrade).toHaveProperty('trade');
    expect(expectedTrade).toHaveProperty('expectedAmount');
    expect(expectedTrade.expectedAmount).toEqual(1);
    expect(expectedTrade.expectedPrice).toEqual(0.18145);
  });

  it('Should return an error if no pair is available', async () => {
    patchFetcher();

    await expect(async () => {
      await tm.estimateTrade({
        chain: CHAIN_NAME,
        network: NETWORK,
        base: 'ETH',
        quote: 'DAI',
        amount: '1',
        side: 'BUY',
      });
    }).rejects.toThrow('');
  });
});

describe('getAllowedSlippage', () => {
  it('return value from config when string is null', () => {
    const allowedSlippage = tm.getSlippage();
    expect(allowedSlippage).toEqual(0.02);
  });
});

describe('verify Tinyman executeTrade', () => {
  it('Should pass when pair is available', async () => {
    patchFetcher();
    patchSwap();

    const trade = await tm.estimateTrade({
      chain: CHAIN_NAME,
      network: NETWORK,
      base: 'ALGO',
      quote: 'USDC',
      amount: '1',
      side: 'BUY',
    });

    const tradeResult = await tm.executeTrade(
      algorand.getAccountFromPrivateKey(MNEUMONIC),
      trade.trade,
      true
    );
    expect(tradeResult.txnID).toEqual(TX.txnID);
    expect(tradeResult.round).toEqual(TX.round);
  });
});
