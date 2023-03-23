import { ZigZag, ZigZagOrder } from '../../../src/connectors/zigzag/zigzag';
import { patch, unpatch } from '../../services/patch';
import { Ethereum } from '../../../src/chains/ethereum/ethereum';
import { patchEVMNonceManager } from '../../evm.nonce.mock';
import { BigNumber } from 'ethers';
import { floatStringWithDecimalToBigNumber } from '../../../src/services/base';
import { Token } from '@uniswap/sdk-core';

let ethereum: Ethereum;
let zigzag: ZigZag;

const ORDERS = {
  orders: [
    // ZZ-USDT orders, never expire
    {
      hash: '0x4bc2e2e8af7378069c16635d29172f32d2afd080f6b138b0660e56d6de19c263',
      order: {
        user: '0x27a2c7121e287478375Ec8c64FDfA31E97038c03',
        buyToken: '0xada42bb73b42e0472a994218fb3799dfcda21237',
        sellToken: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
        buyAmount: '1666018405396825073694',
        sellAmount: '500507844',
        expirationTimeSeconds: 'Infinity',
      },
      signature:
        '0x3fcf8822dcfa2eac24f5dd68aabf30cff06348da93cc9e1af5824acff8e36795431a6ec8654384c4f0da10d769feb563b325d9c10bb7db4930a4647c14b816df1c',
    },
    {
      hash: '0xdfda8ce96d129bf219cfa4e1700a355946d95ef0f0a891c3e5e463e5f66561e6',
      order: {
        user: '0x27a2c7121e287478375Ec8c64FDfA31E97038c03',
        buyToken: '0xada42bb73b42e0472a994218fb3799dfcda21237',
        sellToken: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
        buyAmount: '1666018405396825073694',
        sellAmount: '500507844',
        expirationTimeSeconds: 'Infinity',
      },
      signature:
        '0xc59491ac88ea0322053934616e209d7d891c2329a46aab34c9b55c2beaeda614477bdf5ec388bdced0df6c5febc2d3ead10b3576df3a57ed0030d055850902401b',
    },
    // ZZ-WETH orders, expired
    {
      hash: '0x4bc2e2e8af7378069c16635d29172f32d2afd080f6b138b0660e56d6de19c263',
      order: {
        user: '0x27a2c7121e287478375Ec8c64FDfA31E97038c03',
        buyToken: '0xada42bb73b42e0472a994218fb3799dfcda21237',
        sellToken: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
        buyAmount: '1666018405396825073694',
        sellAmount: '500507844',
        expirationTimeSeconds: '0',
      },
      signature:
        '0x3fcf8822dcfa2eac24f5dd68aabf30cff06348da93cc9e1af5824acff8e36795431a6ec8654384c4f0da10d769feb563b325d9c10bb7db4930a4647c14b816df1c',
    },
    {
      hash: '0xdfda8ce96d129bf219cfa4e1700a355946d95ef0f0a891c3e5e463e5f66561e6',
      order: {
        user: '0x27a2c7121e287478375Ec8c64FDfA31E97038c03',
        buyToken: '0xada42bb73b42e0472a994218fb3799dfcda21237',
        sellToken: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
        buyAmount: '1666018405396825073694',
        sellAmount: '500507844',
        expirationTimeSeconds: '0',
      },
      signature:
        '0xc59491ac88ea0322053934616e209d7d891c2329a46aab34c9b55c2beaeda614477bdf5ec388bdced0df6c5febc2d3ead10b3576df3a57ed0030d055850902401b',
    },
  ],
};

const WETH = new Token(
  0,
  '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
  18,
  'WETH',

  'Wrapped Ether'
);

const ZZ = new Token(
  0,
  '0xada42bb73b42e0472a994218fb3799dfcda21237',
  18,
  'ZZ',
  'ZigZag'
);

const ZZLP = new Token(
  0,
  '0xF4037F59C92c9893C43c2372286699430310CFe7',
  18,
  'ZZLP',
  'ZigZag LP'
);

const USDT = new Token(
  0,
  '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
  6,
  'USDT',
  'Tether USD'
);

const patchInit = () => {
  patch(zigzag, 'init', async () => {
    return;
  });
};

const patchStoredTokenList = () => {
  patch(zigzag, 'tokenList', {
    [WETH.address]: WETH,
    [ZZ.address]: ZZ,
    [ZZLP.address]: ZZLP,
    [USDT.address]: USDT,
  });
};

const patchMarkets = () => {
  patch(zigzag, 'markets', [
    ZZ.address + '-' + WETH.address,
    ZZ.address + '-' + USDT.address,
    USDT.address + '-' + ZZLP.address,
    WETH.address + '-' + ZZLP.address,
    WETH.address + '-' + USDT.address,
  ]);
};

const patchGetMarketOrders = () => {
  patch(
    zigzag,
    'getMarketOrders',
    (
      buyTokenAddress: string,
      sellTokenAddress: string,
      _minExpires: number
    ) => {
      return ORDERS.orders.filter(
        (order: ZigZagOrder) =>
          order.order.buyToken === buyTokenAddress &&
          order.order.sellToken === sellTokenAddress
      );
    }
  );
};

beforeAll(async () => {
  ethereum = Ethereum.getInstance('arbitrum_one');
  patchEVMNonceManager(ethereum.nonceManager);
  await ethereum.init();

  zigzag = ZigZag.getInstance('ethereum', 'arbitrum_one');
  patchInit();
  await zigzag.init();
});

beforeEach(() => {
  patchInit();
  patchStoredTokenList();
  patchMarkets();
  patchEVMNonceManager(ethereum.nonceManager);
});

afterEach(() => {
  unpatch();
});

afterAll(async () => {
  await ethereum.close();
});

describe('getPossibleRoutes', () => {
  it('ZZ-WETH has a direct route', async () => {
    const routes = zigzag.getPossibleRoutes(ZZ, WETH);
    expect(routes).toEqual([
      [{ buyTokenAddress: ZZ.address, sellTokenAddress: WETH.address }],
    ]);
  });

  it('ZZ-ZZLP has two indirect routes', async () => {
    const routes = zigzag.getPossibleRoutes(ZZ, ZZLP);
    expect(routes).toEqual([
      [
        { buyTokenAddress: ZZ.address, sellTokenAddress: WETH.address },
        { buyTokenAddress: WETH.address, sellTokenAddress: ZZLP.address },
      ],
      [
        { buyTokenAddress: ZZ.address, sellTokenAddress: USDT.address },
        { buyTokenAddress: USDT.address, sellTokenAddress: ZZLP.address },
      ],
    ]);
  });
});

describe('getOrderBook', () => {
  it('ZZ-WETH return no orders, they are expired', async () => {
    patchGetMarketOrders();
    const orders = await zigzag.getOrderBook([
      [{ buyTokenAddress: ZZ.address, sellTokenAddress: WETH.address }],
    ]);
    const result: { [key: string]: Array<ZigZagOrder> } = {};
    result[ZZ.address + '-' + WETH.address] = [];
    expect(orders).toEqual(result);
  });

  it('ZZ-USDT returns two orders, they never expire', async () => {
    patchGetMarketOrders();
    const orders = await zigzag.getOrderBook([
      [{ buyTokenAddress: ZZ.address, sellTokenAddress: USDT.address }],
    ]);
    const result: { [key: string]: Array<ZigZagOrder> } = {};
    result[ZZ.address + '-' + USDT.address] = ORDERS.orders.filter(
      (order: ZigZagOrder) =>
        order.order.buyToken === ZZ.address &&
        order.order.sellToken === USDT.address
    );
    expect(orders).toEqual(result);
  });
});

describe('estimate', () => {
  it('Estimate ZZ-USDT sell', async () => {
    patchGetMarketOrders();
    const one = floatStringWithDecimalToBigNumber('1', ZZ.decimals);
    if (one !== null) {
      const estimate = await zigzag.estimate(
        ZZ,
        USDT,
        one,
        BigNumber.from(0),
        'sell'
      );
      expect(estimate.sellAmount).toEqual(one);
      expect(estimate.buyAmount).toEqual(BigNumber.from('300421'));
    }
  });

  it('Estimate ZZ-USDT buy', async () => {
    patchGetMarketOrders();
    const one = floatStringWithDecimalToBigNumber('1', USDT.decimals);
    if (one !== null) {
      const estimate = await zigzag.estimate(
        ZZ,
        USDT,
        BigNumber.from(0),
        one,
        'buy'
      );
      expect(estimate.buyAmount).toEqual(one);
      expect(estimate.sellAmount).toEqual(
        BigNumber.from('3328655934904438927')
      );
    }
  });
});

/*
export enum TradeType {
  EXACT_INPUT,
  EXACT_OUTPUT
}

*/
