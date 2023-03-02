jest.useFakeTimers();
import { Defikingdoms } from '../../../src/connectors/defikingdoms/defikingdoms';
import { patch, unpatch } from '../../services/patch';
import { UniswapishPriceError } from '../../../src/services/error-handler';
import {
  Token,
  TokenAmount,
  TradeType,
  Trade,
  Pair,
  Route,
  Percent,
} from '@switchboard-xyz/defikingdoms-sdk';
import { BigNumber } from 'ethers';
import { Harmony } from '../../../src/chains/harmony/harmony';
import { patchEVMNonceManager } from '../../evm.nonce.mock';
import { DefikingdomsConfig } from '../../../src/connectors/defikingdoms/defikingdoms.config';

let harmony: Harmony;
let defikingdoms: Defikingdoms;

const WONE = new Token(
  1666700000,
  '0x7466d7d0C21Fa05F32F5a0Fa27e12bdC06348Ce2',
  18,
  'WONE'
);
const ETH = new Token(
  1666700000,
  '0x1E120B3b4aF96e7F394ECAF84375b1C661830013',
  18,
  'ETH'
);

beforeAll(async () => {
  harmony = Harmony.getInstance('testnet');
  patchEVMNonceManager(harmony.nonceManager);

  defikingdoms = Defikingdoms.getInstance('harmony', 'testnet');
  await defikingdoms.init();
});

beforeEach(() => {
  patchEVMNonceManager(harmony.nonceManager);
});

afterEach(() => {
  unpatch();
});

afterAll(async () => {
  await harmony.close();
});

const patchFetchData = () => {
  patch(defikingdoms, 'fetchPairData', () => {
    return new Pair(
      new TokenAmount(WONE, '2000000000000000000'),
      new TokenAmount(ETH, '1000000000000000000')
    );
  });
};

const patchTrade = (key: string, error?: Error) => {
  patch(Trade, key, () => {
    if (error) return [];
    const WONE_ETH = new Pair(
      new TokenAmount(WONE, '2000000000000000000'),
      new TokenAmount(ETH, '1000000000000000000')
    );
    const ETH_TO_WONE = new Route([WONE_ETH], ETH, WONE);
    return [
      new Trade(
        ETH_TO_WONE,
        new TokenAmount(ETH, '1000000000000000'),
        TradeType.EXACT_INPUT
      ),
    ];
  });
};

describe('verify defikingdoms gasLimit', () => {
  it('Should initially match the config for mainnet', () => {
    expect(defikingdoms.gasLimitEstimate).toEqual(
      DefikingdomsConfig.config.gasLimit
    );
  });
});

describe('verify defikingdoms getAllowedSlippage', () => {
  it('Should parse simple fractions', () => {
    expect(defikingdoms.getAllowedSlippage('3/100')).toEqual(
      new Percent('3', '100')
    );
  });
});

describe('verify defikingdoms estimateSellTrade', () => {
  it('Should return an ExpectedTrade when available', async () => {
    patchFetchData();
    patchTrade('bestTradeExactIn');

    const expectedTrade = await defikingdoms.estimateSellTrade(
      WONE,
      ETH,
      BigNumber.from(1)
    );
    expect(expectedTrade).toHaveProperty('trade');
    expect(expectedTrade).toHaveProperty('expectedAmount');
  });

  it('Should throw an error if no pair is available', async () => {
    patchFetchData();
    patchTrade('bestTradeExactIn', new Error('error getting trade'));

    await expect(async () => {
      await defikingdoms.estimateSellTrade(WONE, ETH, BigNumber.from(1));
    }).rejects.toThrow(UniswapishPriceError);
  });
});

describe('verify defikingdoms estimateBuyTrade', () => {
  it('Should return an ExpectedTrade when available', async () => {
    patchFetchData();
    patchTrade('bestTradeExactOut');

    const expectedTrade = await defikingdoms.estimateBuyTrade(
      WONE,
      ETH,
      BigNumber.from(1)
    );
    expect(expectedTrade).toHaveProperty('trade');
    expect(expectedTrade).toHaveProperty('expectedAmount');
  });

  it('Should return an error if no pair is available', async () => {
    patchFetchData();
    patchTrade('bestTradeExactOut', new Error('error getting trade'));

    await expect(async () => {
      await defikingdoms.estimateBuyTrade(WONE, ETH, BigNumber.from(1));
    }).rejects.toThrow(UniswapishPriceError);
  });
});

describe('verify defikingdoms Token List', () => {
  it('Should return a token by address', async () => {
    const token = defikingdoms.getTokenByAddress(ETH.address);
    expect(token).toBeInstanceOf(Token);
  });
});
