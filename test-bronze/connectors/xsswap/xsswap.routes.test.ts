import request from 'supertest';
import { patch, unpatch } from '../../services/patch';
import { gatewayApp } from '../../../src/app';
import { Xdc } from '../../../src/chains/xdc/xdc';
import { Xsswap } from '../../../src/connectors/xsswap/xsswap';
import { patchEVMNonceManager } from '../../evm.nonce.mock';
let xdc: Xdc;
let xsswap: Xsswap;

beforeAll(async () => {
  xdc = Xdc.getInstance('xinfin');
  patchEVMNonceManager(xdc.nonceManager);
  await xdc.init();
  xsswap = Xsswap.getInstance('xdc', 'xinfin');
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

const address: string = '0x010216bB52E46807a07d0101Bb828bA547534F37';

const patchGetWallet = () => {
  patch(xdc, 'getWallet', () => {
    return {
      address: '0x010216bB52E46807a07d0101Bb828bA547534F37',
    };
  });
};

const patchStoredTokenList = () => {
  patch(xdc, 'tokenList', () => {
    return [
      {
        chainId: 50,
        name: 'WXDC',
        symbol: 'WXDC',
        address: '0x951857744785E80e2De051c32EE7b25f9c458C42',
        decimals: 18,
      },
      {
        chainId: 50,
        name: 'xUSDT',
        symbol: 'xUSDT',
        address: '0xD4B5f10D61916Bd6E0860144a91Ac658dE8a1437',
        decimals: 18,
      },
    ];
  });
};

const patchGetTokenBySymbol = () => {
  patch(xdc, 'getTokenBySymbol', (symbol: string) => {
    if (symbol === 'WXDC') {
      return {
        chainId: 50,
        name: 'WXDC',
        symbol: 'WXDC',
        address: '0x951857744785E80e2De051c32EE7b25f9c458C42',
        decimals: 18,
      };
    } else {
      return {
        chainId: 51,
        name: 'xUSDT',
        symbol: 'xUSDT',
        address: '0x4f96fe3b7a6cf9725f59d353f723c1bdb64ca6aa',
        decimals: 18,
      };
    }
  });
};

const patchGetTokenByAddress = () => {
  patch(xsswap, 'getTokenByAddress', () => {
    return {
      chainId: 50,
      name: 'WXDC',
      symbol: 'WXDC',
      address: '0x951857744785E80e2De051c32EE7b25f9c458C42',
      decimals: 18,
    };
  });
};

const patchGasPrice = () => {
  patch(xdc, 'gasPrice', () => 100);
};

const patchEstimateBuyTrade = () => {
  patch(xsswap, 'estimateBuyTrade', () => {
    return {
      expectedAmount: {
        toSignificant: () => 100,
      },
      trade: {
        executionPrice: {
          invert: jest.fn().mockReturnValue({
            toSignificant: () => 100,
            toFixed: () => '100',
          }),
        },
      },
    };
  });
};

const patchEstimateSellTrade = () => {
  patch(xsswap, 'estimateSellTrade', () => {
    return {
      expectedAmount: {
        toSignificant: () => 100,
      },
      trade: {
        executionPrice: {
          toSignificant: () => 100,
          toFixed: () => '100',
        },
      },
    };
  });
};

const patchGetNonce = () => {
  patch(xdc.nonceManager, 'getNonce', () => 21);
};

const patchExecuteTrade = () => {
  patch(xsswap, 'executeTrade', () => {
    return { nonce: 21, hash: '000000000000000' };
  });
};

describe('POST /amm/price', () => {
  it('should return 200 for BUY', async () => {
    patchGetWallet();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();
    patchGasPrice();
    patchEstimateBuyTrade();
    patchGetNonce();
    patchExecuteTrade();

    await request(gatewayApp)
      .post(`/amm/price`)
      .send({
        chain: 'xdc',
        network: 'xinfin',
        connector: 'xsswap',
        quote: 'xUSDT',
        base: 'WXDC',
        amount: '10000',
        side: 'BUY',
      })
      .set('Accept', 'application/json')
      .expect(200)
      .then((res: any) => {
        expect(res.body.amount).toEqual('10000.000000000000000000');
        expect(res.body.rawAmount).toEqual('10000000000000000000000');
      });
  });

  it('should return 200 for SELL', async () => {
    patchGetWallet();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();
    patchGasPrice();
    patchEstimateSellTrade();
    patchGetNonce();
    patchExecuteTrade();

    await request(gatewayApp)
      .post(`/amm/price`)
      .send({
        chain: 'xdc',
        network: 'xinfin',
        connector: 'xsswap',
        quote: 'xUSDT',
        base: 'WXDC',
        amount: '10000',
        side: 'SELL',
      })
      .set('Accept', 'application/json')
      .expect(200)
      .then((res: any) => {
        expect(res.body.amount).toEqual('10000.000000000000000000');
        expect(res.body.rawAmount).toEqual('10000000000000000000000');
      });
  });

  it('should return 500 for unrecognized quote symbol', async () => {
    patchGetWallet();
    patchStoredTokenList();
    patch(xdc, 'getTokenBySymbol', (symbol: string) => {
      if (symbol === 'WXDC') {
        return {
          chainId: 50,
          name: 'WXDC',
          symbol: 'WXDC',
          address: '0x951857744785E80e2De051c32EE7b25f9c458C42',
          decimals: 18,
        };
      } else {
        return null;
      }
    });
    patchGetTokenByAddress();

    await request(gatewayApp)
      .post(`/amm/price`)
      .send({
        chain: 'xdc',
        network: 'xinfin',
        connector: 'xsswap',
        quote: 'DOGE',
        base: 'WXDC',
        amount: '10000',
        side: 'SELL',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });

  it('should return 500 for unrecognized base symbol', async () => {
    patchGetWallet();
    patchStoredTokenList();
    patch(xdc, 'getTokenBySymbol', (symbol: string) => {
      if (symbol === 'WXDC') {
        return {
          chainId: 50,
          name: 'WXDC',
          symbol: 'WXDC',
          address: '0x951857744785E80e2De051c32EE7b25f9c458C42',
          decimals: 18,
        };
      } else {
        return null;
      }
    });
    patchGetTokenByAddress();

    await request(gatewayApp)
      .post(`/amm/price`)
      .send({
        chain: 'xdc',
        network: 'xinfin',
        connector: 'xsswap',
        quote: 'xUSDT',
        base: 'SHIBA',
        amount: '10000',
        side: 'SELL',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });
});

describe('POST /amm/trade', () => {
  const patchForBuy = () => {
    patchGetWallet();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();
    patchGasPrice();
    patchEstimateBuyTrade();
    patchGetNonce();
    patchExecuteTrade();
  };
  it('should return 200 for BUY', async () => {
    patchForBuy();
    await request(gatewayApp)
      .post(`/amm/trade`)
      .send({
        chain: 'xdc',
        network: 'xinfin',
        connector: 'xsswap',
        quote: 'xUSDT',
        base: 'WXDC',
        amount: '10000',
        address,
        side: 'BUY',
        nonce: 21,
      })
      .set('Accept', 'application/json')
      .expect(200)
      .then((res: any) => {
        expect(res.body.nonce).toEqual(21);
      });
  });

  it('should return 200 for BUY without nonce parameter', async () => {
    patchForBuy();
    await request(gatewayApp)
      .post(`/amm/trade`)
      .send({
        chain: 'xdc',
        network: 'xinfin',
        connector: 'xsswap',
        quote: 'xUSDT',
        base: 'WXDC',
        amount: '10000',
        address,
        side: 'BUY',
      })
      .set('Accept', 'application/json')
      .expect(200);
  });

  it('should return 200 for BUY with maxFeePerGas and maxPriorityFeePerGas', async () => {
    patchForBuy();
    await request(gatewayApp)
      .post(`/amm/trade`)
      .send({
        chain: 'xdc',
        network: 'xinfin',
        connector: 'xsswap',
        quote: 'xUSDT',
        base: 'WXDC',
        amount: '10000',
        address,
        side: 'BUY',
        nonce: 21,
        maxFeePerGas: '5000000000',
        maxPriorityFeePerGas: '5000000000',
      })
      .set('Accept', 'application/json')
      .expect(200);
  });

  const patchForSell = () => {
    patchGetWallet();
    patchStoredTokenList();
    patchGetTokenBySymbol();
    patchGetTokenByAddress();
    patchGasPrice();
    patchEstimateSellTrade();
    patchGetNonce();
    patchExecuteTrade();
  };
  it('should return 200 for SELL', async () => {
    patchForSell();
    await request(gatewayApp)
      .post(`/amm/trade`)
      .send({
        chain: 'xdc',
        network: 'xinfin',
        connector: 'xsswap',
        quote: 'xUSDT',
        base: 'WXDC',
        amount: '10000',
        address,
        side: 'SELL',
        nonce: 21,
      })
      .set('Accept', 'application/json')
      .expect(200)
      .then((res: any) => {
        expect(res.body.nonce).toEqual(21);
      });
  });

  it('should return 200 for SELL  with maxFeePerGas and maxPriorityFeePerGas', async () => {
    patchForSell();
    await request(gatewayApp)
      .post(`/amm/trade`)
      .send({
        chain: 'xdc',
        network: 'xinfin',
        connector: 'xsswap',
        quote: 'xUSDT',
        base: 'WXDC',
        amount: '10000',
        address,
        side: 'SELL',
        nonce: 21,
        maxFeePerGas: '5000000000',
        maxPriorityFeePerGas: '5000000000',
      })
      .set('Accept', 'application/json')
      .expect(200);
  });

  it('should return 404 when parameters are incorrect', async () => {
    await request(gatewayApp)
      .post(`/amm/trade`)
      .send({
        chain: 'xdc',
        network: 'xinfin',
        connector: 'xsswap',
        quote: 'xUSDT',
        base: 'WXDC',
        amount: 10000,
        address: 'da8',
        side: 'comprar',
      })
      .set('Accept', 'application/json')
      .expect(404);
  });

  it('should return 500 when base token is unknown', async () => {
    patchForSell();
    patch(xdc, 'getTokenBySymbol', (symbol: string) => {
      if (symbol === 'WXDC') {
        return {
          chainId: 50,
          name: 'WXDC',
          symbol: 'WXDC',
          address: '0x951857744785E80e2De051c32EE7b25f9c458C42',
          decimals: 18,
        };
      } else {
        return null;
      }
    });

    await request(gatewayApp)
      .post(`/amm/trade`)
      .send({
        chain: 'xdc',
        network: 'xinfin',
        connector: 'xsswap',
        quote: 'WXDC',
        base: 'BITCOIN',
        amount: '10000',
        address,
        side: 'BUY',
        nonce: 21,
        maxFeePerGas: '5000000000',
        maxPriorityFeePerGas: '5000000000',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });

  it('should return 500 when quote token is unknown', async () => {
    patchForSell();
    patch(xdc, 'getTokenBySymbol', (symbol: string) => {
      if (symbol === 'WXDC') {
        return {
          chainId: 50,
          name: 'WXDC',
          symbol: 'WXDC',
          address: '0x951857744785E80e2De051c32EE7b25f9c458C42',
          decimals: 18,
        };
      } else {
        return null;
      }
    });

    await request(gatewayApp)
      .post(`/amm/trade`)
      .send({
        chain: 'xdc',
        network: 'xinfin',
        connector: 'xsswap',
        quote: 'BITCOIN',
        base: 'WXDC',
        amount: '10000',
        address,
        side: 'BUY',
        nonce: 21,
        maxFeePerGas: '5000000000',
        maxPriorityFeePerGas: '5000000000',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });

  it('should return 200 for SELL with limitPrice', async () => {
    patchForSell();
    await request(gatewayApp)
      .post(`/amm/trade`)
      .send({
        chain: 'xdc',
        network: 'xinfin',
        connector: 'xsswap',
        quote: 'xUSDT',
        base: 'WXDC',
        amount: '10000',
        address,
        side: 'SELL',
        nonce: 21,
        limitPrice: '9',
      })
      .set('Accept', 'application/json')
      .expect(200);
  });

  it('should return 200 for BUY with limitPrice', async () => {
    patchForBuy();
    await request(gatewayApp)
      .post(`/amm/trade`)
      .send({
        chain: 'xdc',
        network: 'xinfin',
        connector: 'xsswap',
        quote: 'xUSDT',
        base: 'WXDC',
        amount: '10000',
        address,
        side: 'BUY',
        nonce: 21,
        limitPrice: '999999999999999999999',
      })
      .set('Accept', 'application/json')
      .expect(200);
  });

  it('should return 200 for SELL with price higher than limitPrice', async () => {
    patchForSell();
    await request(gatewayApp)
      .post(`/amm/trade`)
      .send({
        chain: 'xdc',
        network: 'xinfin',
        connector: 'xsswap',
        quote: 'xUSDT',
        base: 'WXDC',
        amount: '10000',
        address,
        side: 'SELL',
        nonce: 21,
        limitPrice: '99999999999',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });

  it('should return 200 for BUY with price less than limitPrice', async () => {
    patchForBuy();
    await request(gatewayApp)
      .post(`/amm/trade`)
      .send({
        chain: 'xdc',
        network: 'xinfin',
        connector: 'xsswap',
        quote: 'xUSDT',
        base: 'WXDC',
        amount: '10000',
        address,
        side: 'BUY',
        nonce: 21,
        limitPrice: '9',
      })
      .set('Accept', 'application/json')
      .expect(500);
  });
});
