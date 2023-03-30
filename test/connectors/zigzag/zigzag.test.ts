import { ZigZag, ZigZagOrder } from '../../../src/connectors/zigzag/zigzag';
import { patch, unpatch } from '../../services/patch';
import { Ethereum } from '../../../src/chains/ethereum/ethereum';
import { patchEVMNonceManager } from '../../evm.nonce.mock';
import { BigNumber } from 'ethers';
import { floatStringWithDecimalToBigNumber } from '../../../src/services/base';
import { Token } from '@uniswap/sdk-core';
import { EVMTxBroadcaster } from '../../../src/chains/ethereum/evm.broadcaster';
import {
  price,
  trade,
} from '../../../src/connectors/zigzag/zigzag.controllers';

let ethereum: Ethereum;
let zigzag: ZigZag;

const TX_HASH =
  '0xf6f81a37796bd06a797484467302e4d6f72832409545e2e01feb86dd8b22e4b2'; // noqa: mock

const address: string = '0xFaA12FD102FE8623C9299c72B03E45107F2772B5';

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
        expirationTimeSeconds: '1234567890123456789',
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
        expirationTimeSeconds: '1234567890123456789',
      },
      signature:
        '0xc59491ac88ea0322053934616e209d7d891c2329a46aab34c9b55c2beaeda614477bdf5ec388bdced0df6c5febc2d3ead10b3576df3a57ed0030d055850902401b',
    },
    // WETH-USDT orders, never expire
    {
      hash: '0x4bc2e2e8af7378069c16635d29172f32d2afd080f6b138b0660e56d6de19c263',
      order: {
        user: '0x27a2c7121e287478375Ec8c64FDfA31E97038c03',
        buyToken: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
        sellToken: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
        buyAmount: '1666018405396825073694',
        sellAmount: '500507844',
        expirationTimeSeconds: '1234567890123456789',
      },
      signature:
        '0x3fcf8822dcfa2eac24f5dd68aabf30cff06348da93cc9e1af5824acff8e36795431a6ec8654384c4f0da10d769feb563b325d9c10bb7db4930a4647c14b816df1c',
    },
    {
      hash: '0xdfda8ce96d129bf219cfa4e1700a355946d95ef0f0a891c3e5e463e5f66561e6',
      order: {
        user: '0x27a2c7121e287478375Ec8c64FDfA31E97038c03',
        buyToken: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
        sellToken: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
        buyAmount: '1666018405396825073694',
        sellAmount: '500507844',
        expirationTimeSeconds: '1234567890123456789',
      },
      signature:
        '0xc59491ac88ea0322053934616e209d7d891c2329a46aab34c9b55c2beaeda614477bdf5ec388bdced0df6c5febc2d3ead10b3576df3a57ed0030d055850902401b',
    },
    // USDT-ZZLP orders, never expire
    {
      hash: '0x4bc2e2e8af7378069c16635d29172f32d2afd080f6b138b0660e56d6de19c263',
      order: {
        user: '0x27a2c7121e287478375Ec8c64FDfA31E97038c03',
        buyToken: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
        sellToken: '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8',
        buyAmount: '1666018405396825073694',
        sellAmount: '500507844',
        expirationTimeSeconds: '1234567890123456789',
      },
      signature:
        '0x3fcf8822dcfa2eac24f5dd68aabf30cff06348da93cc9e1af5824acff8e36795431a6ec8654384c4f0da10d769feb563b325d9c10bb7db4930a4647c14b816df1c',
    },
    {
      hash: '0xdfda8ce96d129bf219cfa4e1700a355946d95ef0f0a891c3e5e463e5f66561e6',
      order: {
        user: '0x27a2c7121e287478375Ec8c64FDfA31E97038c03',
        buyToken: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
        sellToken: '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8',
        buyAmount: '1666018405396825073694',
        sellAmount: '500507844',
        expirationTimeSeconds: '1234567890123456789',
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
        buyToken: '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8',
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
  '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8',
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
    [WETH.address.toLowerCase()]: WETH,
    [ZZ.address.toLowerCase()]: ZZ,
    [ZZLP.address.toLowerCase()]: ZZLP,
    [USDT.address.toLowerCase()]: USDT,
  });
};

const patchMarkets = () => {
  patch(zigzag, 'markets', [
    ZZ.address.toLowerCase() + '-' + WETH.address.toLowerCase(),
    ZZ.address.toLowerCase() + '-' + USDT.address.toLowerCase(),
    USDT.address.toLowerCase() + '-' + ZZLP.address.toLowerCase(),
    WETH.address.toLowerCase() + '-' + ZZLP.address.toLowerCase(),
    WETH.address.toLowerCase() + '-' + USDT.address.toLowerCase(),
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

const patchMsgBroadcaster = () => {
  patch(EVMTxBroadcaster, 'getInstance', () => {
    return {
      broadcast() {
        return {
          hash: TX_HASH,
        };
      },
    };
  });
};

const patchGetWallet = () => {
  patch(ethereum, 'getWallet', () => {
    return {
      address,
    };
  });
};

beforeAll(async () => {
  ethereum = Ethereum.getInstance('arbitrum_one');
  patchEVMNonceManager(ethereum.nonceManager);
  await ethereum.init();

  zigzag = ZigZag.getInstance('arbitrum_one');
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
      [
        {
          buyTokenAddress: ZZ.address.toLowerCase(),
          sellTokenAddress: WETH.address.toLowerCase(),
        },
      ],
    ]);
  });

  it('ZZ-ZZLP has two indirect routes', async () => {
    const routes = zigzag.getPossibleRoutes(ZZ, ZZLP);
    expect(routes).toEqual([
      [
        {
          buyTokenAddress: ZZ.address.toLowerCase(),
          sellTokenAddress: WETH.address.toLowerCase(),
        },
        {
          buyTokenAddress: WETH.address.toLowerCase(),
          sellTokenAddress: ZZLP.address.toLowerCase(),
        },
      ],
      [
        {
          buyTokenAddress: ZZ.address.toLowerCase(),
          sellTokenAddress: USDT.address.toLowerCase(),
        },
        {
          buyTokenAddress: USDT.address.toLowerCase(),
          sellTokenAddress: ZZLP.address.toLowerCase(),
        },
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
    const estimate = await zigzag.estimate(ZZ, USDT, <BigNumber>one, 'sell');
    expect(estimate.newSwapPrice).toEqual(0.30042155739617127);
  });

  it('Estimate ZZ-USDT buy', async () => {
    patchGetMarketOrders();
    const one = floatStringWithDecimalToBigNumber('1', USDT.decimals);
    const estimate = await zigzag.estimate(ZZ, USDT, <BigNumber>one, 'buy');
    expect(estimate.newSwapPrice).toEqual(3.3286559349044387);
  });
});

describe('executeTrade', () => {
  it('Execute ZZ-USDT sell trade', async () => {
    patchGetMarketOrders();
    patchMsgBroadcaster();
    const one = floatStringWithDecimalToBigNumber('1', ZZ.decimals);
    const estimate = await zigzag.estimate(ZZ, USDT, <BigNumber>one, 'sell');
    const trade = await zigzag.executeTrade(
      '',
      estimate,
      <BigNumber>one,
      false
    );
    expect(estimate.newSwapPrice).toEqual(0.30042155739617127);
    expect(trade.hash).toEqual(TX_HASH);
  });

  it('Execute ZZ-USDT buy trade', async () => {
    patchGetMarketOrders();
    patchMsgBroadcaster();
    const one = floatStringWithDecimalToBigNumber('1', USDT.decimals);
    const estimate = await zigzag.estimate(ZZ, USDT, <BigNumber>one, 'buy');
    const trade = await zigzag.executeTrade('', estimate, <BigNumber>one, true);
    expect(estimate.newSwapPrice).toEqual(3.3286559349044387);
    expect(trade.hash).toEqual(TX_HASH);
  });

  it('Execute ZZ-ZZLP sell trade(multi-order)', async () => {
    patchGetMarketOrders();
    patchMsgBroadcaster();
    const one = floatStringWithDecimalToBigNumber('1', 1);
    const estimate = await zigzag.estimate(ZZ, ZZLP, <BigNumber>one, 'sell');
    const trade = await zigzag.executeTrade(
      '',
      estimate,
      <BigNumber>one,
      false
    );
    expect(estimate.newSwapPrice).toEqual(9.025311214834104e-26);
    expect(trade.hash).toEqual(TX_HASH);
  });

  it('Execute ZZ-ZZLP buy trade(multi-order)', async () => {
    patchGetMarketOrders();
    patchMsgBroadcaster();
    const one = floatStringWithDecimalToBigNumber('1', 1);
    const estimate = await zigzag.estimate(ZZ, ZZLP, <BigNumber>one, 'buy');
    const trade = await zigzag.executeTrade('', estimate, <BigNumber>one, true);
    expect(estimate.newSwapPrice).toEqual(1.1079950332974543e25);
    expect(trade.hash).toEqual(TX_HASH);
  });
});

describe('controller tests', () => {
  it('price test', async () => {
    patchGetMarketOrders();
    const priceResult = await price(ethereum, zigzag, {
      connector: 'zigzag',
      chain: 'ethereum',
      network: 'arbitrum_one',
      quote: 'USDT',
      base: 'WETH',
      amount: '2',
      side: 'SELL',
    });
    expect(priceResult.base).toEqual(
      '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'
    );
    expect(priceResult.quote).toEqual(
      '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'
    );
    expect(priceResult.rawAmount).toEqual('2000000000000000000');
    expect(priceResult.price).toEqual('0.30042155739617127');
  });

  it('trade test', async () => {
    patchGetMarketOrders();
    patchGetWallet();
    patchMsgBroadcaster();
    const tradeResult = await trade(ethereum, zigzag, {
      address: address,
      quote: 'USDT',
      base: 'WETH',
      amount: '1',
      side: 'SELL',
      chain: 'ethereum',
      network: 'arbitrum_one',
      connector: 'zigzag',
    });
    expect(tradeResult.base).toEqual(
      '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'
    );
    expect(tradeResult.quote).toEqual(
      '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'
    );
    expect(tradeResult.rawAmount).toEqual('1000000000000000000');
    expect(tradeResult.txHash).toEqual(TX_HASH);
  });
});
