jest.useFakeTimers();
import { Xsswap } from '../../../src/connectors/xsswap/xsswap';
import { patch, unpatch } from '../../services/patch';
import { UniswapishPriceError } from '../../../src/services/error-handler';
import {
  ChainId,
  Fetcher,
  Pair,
  Percent,
  Route,
  Token,
  TokenAmount,
  Trade,
  TradeType,
} from 'xsswap-sdk';
import { BigNumber } from 'ethers';
import { Xdc } from '../../../src/chains/xdc/xdc';
import { patchEVMNonceManager } from '../../evm.nonce.mock';

let xdc: Xdc;
let xsswap: Xsswap;

const WXDC = new Token(
  ChainId.XINFIN,
  '0x951857744785E80e2De051c32EE7b25f9c458C42',
  18,
  'WXDC'
);
const xUSDT = new Token(
  ChainId.XINFIN,
  '0xD4B5f10D61916Bd6E0860144a91Ac658dE8a1437',
  18,
  'xUSDT'
);

beforeAll(async () => {
  xdc = Xdc.getInstance('xinfin');
  patchEVMNonceManager(xdc.nonceManager);
  await xdc.init();
  xsswap = Xsswap.getInstance('xdc', 'xinfin') as Xsswap;
  await xsswap.init();
});

beforeEach(() => {
  patchEVMNonceManager(xdc.nonceManager);
});

afterEach(() => {
  unpatch();
});

afterAll(async () => {
  await xdc.close();
});

const patchFetchPairData = () => {
  patch(Fetcher, 'fetchPairData', () => {
    return new Pair(
      new TokenAmount(WXDC, '2000000000000000000'),
      new TokenAmount(xUSDT, '1000000000000000000')
    );
  });
};

const patchTrade = (key: string, error?: Error) => {
  patch(Trade, key, () => {
    if (error) return [];
    const WXDC_xUSDT = new Pair(
      new TokenAmount(WXDC, '2000000000000000000'),
      new TokenAmount(xUSDT, '1000000000000000000')
    );
    const xUSDT_TO_WXDC = new Route([WXDC_xUSDT], xUSDT);
    return [
      new Trade(
        xUSDT_TO_WXDC,
        new TokenAmount(xUSDT, '1000000000000000'),
        TradeType.EXACT_INPUT
      ),
    ];
  });
};

describe('verify Xsswap estimateSellTrade', () => {
  it('Should return an ExpectedTrade when available', async () => {
    patchFetchPairData();
    patchTrade('bestTradeExactIn');

    const expectedTrade = await xsswap.estimateSellTrade(
      WXDC,
      xUSDT,
      BigNumber.from(1)
    );
    expect(expectedTrade).toHaveProperty('trade');
    expect(expectedTrade).toHaveProperty('expectedAmount');
  });

  it('Should throw an error if no pair is available', async () => {
    patchFetchPairData();
    patchTrade('bestTradeExactIn', new Error('error getting trade'));

    await expect(async () => {
      await xsswap.estimateSellTrade(WXDC, xUSDT, BigNumber.from(1));
    }).rejects.toThrow(UniswapishPriceError);
  });
});

describe('verify Xsswap estimateBuyTrade', () => {
  it('Should return an ExpectedTrade when available', async () => {
    patchFetchPairData();
    patchTrade('bestTradeExactOut');

    const expectedTrade = await xsswap.estimateBuyTrade(
      WXDC,
      xUSDT,
      BigNumber.from(1)
    );
    expect(expectedTrade).toHaveProperty('trade');
    expect(expectedTrade).toHaveProperty('expectedAmount');
  });

  it('Should return an error if no pair is available', async () => {
    patchFetchPairData();
    patchTrade('bestTradeExactOut', new Error('error getting trade'));

    await expect(async () => {
      await xsswap.estimateBuyTrade(WXDC, xUSDT, BigNumber.from(1));
    }).rejects.toThrow(UniswapishPriceError);
  });
});

describe('getAllowedSlippage', () => {
  it('return value of string when not null', () => {
    const allowedSlippage = xsswap.getAllowedSlippage('3/100');
    expect(allowedSlippage).toEqual(new Percent('3', '100'));
  });

  it('return value from config when string is null', () => {
    const allowedSlippage = xsswap.getAllowedSlippage();
    expect(allowedSlippage).toEqual(new Percent('2', '100'));
  });

  it('return value from config when string is malformed', () => {
    const allowedSlippage = xsswap.getAllowedSlippage('malformedConfig');
    expect(allowedSlippage).toEqual(new Percent('2', '100'));
  });
});
