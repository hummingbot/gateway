import { ZigZag, ZigZagOrder } from '../../../src/connectors/zigzag/zigzag';
import { patch, unpatch } from '../../services/patch';
import { Ethereum } from '../../../src/chains/ethereum/ethereum';
import { patchEVMNonceManager } from '../../evm.nonce.mock';

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

const WETH = {
  address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
  symbol: 'WETH',
  decimals: 18,
  name: 'Wrapped Ether',
};

const ZZ = {
  address: '0xada42bb73b42e0472a994218fb3799dfcda21237',
  symbol: 'ZZ',
  decimals: 18,
  name: 'ZigZag',
};

const ZZLP = {
  address: '0xF4037F59C92c9893C43c2372286699430310CFe7',
  symbol: 'ZZLP',
  decimals: 18,
  name: 'ZigZag LP',
};

const USDT = {
  address: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
  symbol: 'USDT',
  decimals: 6,
  name: 'Tether USD',
};

const patchInit = () => {
  patch(zigzag, 'init', async () => {
    return;
  });
};

const patchStoredTokenList = () => {
  patch(zigzag, 'tokenList', () => {
    return [WETH, ZZ, ZZLP, USDT];
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
