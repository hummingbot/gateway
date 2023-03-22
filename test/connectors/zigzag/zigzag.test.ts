import { ZigZag } from '../../../src/connectors/zigzag/zigzag';
import { patch, unpatch } from '../../services/patch';
import { Ethereum } from '../../../src/chains/ethereum/ethereum';
import { patchEVMNonceManager } from '../../evm.nonce.mock';

let ethereum: Ethereum;
let zigzag: ZigZag;

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
  it('ZZ-WETH', async () => {
    const routes = zigzag.getPossibleRoutes(ZZ, WETH);
    expect(routes).toEqual([
      [{ buyTokenAddress: ZZ.address, sellTokenAddress: WETH.address }],
    ]);
  });

  it('ZZ-ZZLP', async () => {
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
