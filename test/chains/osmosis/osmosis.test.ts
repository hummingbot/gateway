import { patch, unpatch } from '../../services/patch';
import { Osmosis } from '../../../src/chains/osmosis/osmosis';
import { ConfigManagerCertPassphrase } from '../../../src/services/config-manager-cert-passphrase';
import { addWallet, getWallets } from '../../../src/services/wallet/wallet.controllers';
import Decimal from 'decimal.js-light';
import { CosmosAsset } from '../../../src/chains/cosmos/cosmos-base';
import { Side } from '../../../src/amm/amm.requests';

const osmosisAddress = 'osmo1gxfandcf6x6y0lv3afv0p4w4akv809ycrly4cs';
const osmosisPrivateKey = '2e8be986f72f76dba7f8448b2e2342d3297cd628cf08aad9b90098102824f9d5'; // real 
// const zer3oAddress = '0000000000000000000000000000000000000000000000000000000000000000'; // noqa: mock
const liveAddressNik = 'osmo1mvsg3en5ulpnpd3dset2m86zjpnzp4v4epmjh7'

jest.setTimeout(300000); // run for 5 mins

let osmosis: Osmosis;

beforeAll(async () => {
  patch(ConfigManagerCertPassphrase, 'readPassphrase', () => 'macymo');
  osmosis = Osmosis.getInstance('testnet');

  await osmosis.init();
});

beforeEach(() => {
});

afterEach(() => {
});

afterAll(async () => {
  unpatch();
  await osmosis.close();
});

describe('wallets', () => {
  it('add an Osmosmis wallet', async () => {
    await addWallet({
      privateKey: osmosisPrivateKey,
      chain: 'osmosis',
      network: 'testnet',
    });

    const wallets = await getWallets();

    const addresses: string[][] = wallets
      .filter((wallet) => wallet.chain === 'osmosis')
      .map((wallet) => wallet.walletAddresses);

    expect(addresses[0]).toContain(osmosisAddress);
  });
});

describe('chain.routes', () => {

  it('getTokens', async () => {
    var getTokens = await osmosis.controller.getTokens(osmosis, {tokenSymbols:['OSMO']});
    //console.debug(getTokens);
    expect(getTokens.tokens[0].symbol).toEqual('OSMO');
  });

  it('getTokens All', async () => {
    var getTokens = await osmosis.controller.getTokens(osmosis, {});
    //console.debug(getTokens);
    expect(getTokens.tokens.length).toEqual(12);
  });

  it('balances OSMO', async () => {
    const balances = await osmosis.controller.balances(osmosis, {address:osmosisAddress, tokenSymbols:['OSMO']});
    //console.debug(balances);
    expect(Number(balances.balances['OSMO'])).toBeGreaterThan(0);
  });

  it('balances All', async () => {
    const balances = await osmosis.controller.balances(osmosis, {address:osmosisAddress, tokenSymbols:['OSMO']});
    //console.debug(balances);
    expect(Number(balances.balances['OSMO'])).toBeGreaterThan(0);
  });

  it('getWalletFromPrivateKey', async () => {
    const walleto = await osmosis.getWalletFromPrivateKey(
      osmosisPrivateKey,
      'osmo'
    );
    //console.debug(walleto);
    expect(walleto.prefix).toEqual('osmo');

    const balanceo = await osmosis.getBalances(walleto)
    expect(Number(balanceo['OSMO'].value)).toBeGreaterThan(0);
  });

  it('balances All', async () => {
    const block = await osmosis.getCurrentBlockNumber();
    //console.debug(block);
    expect(block).toBeGreaterThan(0);
  });

  it('getTokenBySymbol', async () => {
    var token = osmosis.getTokenBySymbol('ATOM')!;
    var token2 = osmosis.getTokenForSymbol('OSMO')!;
    //console.debug(token);
    //console.debug(token2);
    expect(token.decimals).toEqual(6);
    expect(token2.symbol).toEqual('OSMO');
  });

  it('transfer', async () => {
    var transfer = await osmosis.controller.transfer(osmosis, {'from':osmosisAddress, 'to':liveAddressNik, 'token':'OSMO', amount:'0.000001', 'chain':'osmosis', 'network':'testnet'});
    //console.debug(transfer);
    expect(transfer).toContain('Transfer success');
  });

});


describe('chain.routes - DISABLED', () => {

  it('allowances', async () => {
    var allowances = await osmosis.controller.allowances(osmosis, {'address':osmosisAddress, 'spender':liveAddressNik, 'tokenSymbols':[], 'chain':'osmosis', 'network':'testnet'});
    //console.debug(allowances);
    expect(allowances.spender).toBeUndefined()
  });

  it('approve', async () => {
    var approve = await osmosis.controller.approve(osmosis, {'address':osmosisAddress, 'spender':liveAddressNik, token:'OSMO', 'chain':'osmosis', 'network':'testnet'});
    //console.debug(approve);
    expect(approve.spender).toBeUndefined()
  });

  it('cancel', async () => {
    var cancel = await osmosis.controller.cancel(osmosis, {'address':osmosisAddress, 'nonce':0, 'chain':'osmosis', 'network':'testnet'});
    //console.debug(cancel);
    expect(cancel.txHash).toBeUndefined()
  });

  it('nextNonce', async () => {
    var nextNonce = await osmosis.controller.nextNonce(osmosis, {'address':osmosisAddress, 'chain':'osmosis', 'network':'testnet'});
    //console.debug(nextNonce);
    expect(nextNonce.nonce).toEqual(0)
  });

  it('nonce', async () => {
    var nonce = await osmosis.controller.nonce(osmosis, {'address':osmosisAddress, 'chain':'osmosis', 'network':'testnet'});
    //console.debug(nonce);
    expect(nonce.nonce).toEqual(0)
  });

});



describe('controllers - price + trade', () => {

  it('estimateGas', async () => {
    var estimateGas = await osmosis.controller.estimateGas(osmosis);
    //console.debug(estimateGas);
    expect(estimateGas.gasPriceToken).toEqual('uosmo');
  });

  it('getTradeInfo', async () => {
    const tradeInfo = await osmosis.controller.getTradeInfo(osmosis, "OSMO", "ION", new Decimal(1.0), "BUY")
    //console.debug(tradeInfo);
    expect((tradeInfo.baseToken as CosmosAsset).base).toEqual('uosmo');
    expect(tradeInfo.requestAmount.toNumber()).toEqual(1);
    expect(tradeInfo.expectedTrade.routes.length).toBeGreaterThanOrEqual(1);
  });

  it('price', async () => {
    // slippage must be high on testnet due to price mismatch with pool ratios
    const priceRequest1 = {'quote':'ION', 'base':'OSMO', 'amount':'1', 'side':'BUY' as Side, 'allowedSlippage':'100%', 'chain':'osmosis', 'network':'testnet'};
    const priceResponse1 = await osmosis.controller.price(osmosis, priceRequest1)
    //console.debug(priceResponse1)
    expect(priceResponse1.base).toEqual('OSMO')
  });

  it('trade', async () => {
    const tradeRequest = {'quote':'ION', 'base':'OSMO', 'amount':'0.01', 'side':'BUY' as Side, 'allowedSlippage':'100%', 'chain':'osmosis', 'network':'testnet', 'address':osmosisAddress, };
    const tradeResponse = await osmosis.controller.trade(osmosis, tradeRequest)
    //console.debug(tradeResponse);
    expect(tradeResponse.base).toEqual('uosmo')
  });

  it('trade back', async () => {
    const tradeRequest = {'quote':'OSMO', 'base':'ION', 'amount':'0.0001', 'side':'BUY' as Side, 'allowedSlippage':'100%', 'chain':'osmosis', 'network':'testnet', 'address':osmosisAddress, };
    const tradeResponse = await osmosis.controller.trade(osmosis, tradeRequest)
    //console.debug(tradeResponse);
    expect(tradeResponse.base).toEqual('uion')
  });


  // try {
  //   //console.debug('priceResponse2');
  //   const priceRequest2 = {'quote':'OSMO', 'base':'ION', 'amount':'1', 'side':'BUY' as Side, 'allowedSlippage':'100%', 'chain':'osmosis', 'network':'testnet'};
  //   const priceResponse2 = await osmosis.controller.price(osmosis, priceRequest2)
  //   //console.debug(priceResponse2)
  // } catch (err) {
  //   //console.debug(err);
  // }

  // try {
  //   //console.debug('priceResponse3');
  //   const priceRequest3 = {'quote':'ATOM', 'base':'OSMO', 'amount':'0.01', 'side':'BUY' as Side, 'allowedSlippage':'100%', 'chain':'osmosis', 'network':'testnet'};
  //   const priceResponse3 = await osmosis.controller.price(osmosis, priceRequest3)
  //   //console.debug(priceResponse3)
  // } catch (err) {
  //   //console.debug(err);
  // }

  // fail no ATOM in wallet
  // try {
  //   //console.debug('tradeResponse2');
  //   const tradeRequest2 = {'quote':'OSMO', 'base':'ATOM', 'amount':'0.01', 'side':'BUY' as Side, 'allowedSlippage':'100%', 'chain':'osmosis', 'network':'testnet', 'address':osmosisAddress, };
  //   const tradeResponse2 = await osmosis.controller.trade(osmosis, tradeRequest2)
  //   //console.debug(tradeResponse2)
  // } catch (err) {
  //   //console.debug(err);
  // }

  // try {
  //   //console.debug('tradeResponse2');
  //   const tradeRequest2 = {'quote':'ATOM', 'base':'OSMO', 'amount':'0.01', 'side':'BUY' as Side, 'allowedSlippage':'20%', 'chain':'osmosis', 'network':'testnet', 'address':osmosisAddress, };
  //   const tradeResponse2 = await osmosis.controller.trade(osmosis, tradeRequest2)
  //   //console.debug(tradeResponse2)
  // } catch (err) {
  //   //console.debug(err);
  // }

  // try {
  //   //console.debug('tradeResponse2');
  //   const tradeRequest2 = {'quote':'ION', 'base':'OSMO', 'amount':'0.01', 'side':'BUY' as Side, 'allowedSlippage':'100%', 'chain':'osmosis', 'network':'testnet', 'address':osmosisAddress, };
  //   const tradeResponse2 = await osmosis.controller.trade(osmosis, tradeRequest2)
  //   //console.debug(tradeResponse2)
  // } catch (err) {
  //   //console.debug(err);
  // }


});


describe('controllers - CL Pools + Liquidity', () => {

  // best to join pools using one amount == 0 (so input 1 token type at a time)
  //  adds tend to fail unless amounts input are similar in relative $ value
  it('addLiquidity', async () => {
    const addLiquidityRequestFunction = {'poolId':'62', 'fee': 'high', 'token0':'ION', 'token1':'OSMO', 'amount0':'0.0005', 'amount1':'0', 'chain':'osmosis', 'network':'testnet', 'address':osmosisAddress, };
    var addLiquidityResponse = await osmosis.controller.addLiquidity(osmosis, addLiquidityRequestFunction)
    //console.debug(addLiquidityResponse);
    expect(addLiquidityResponse.poolId).toEqual('62')
  });

  it('positionsRequest', async () => {
    const positionsRequest1 = {
      chain:'osmosis', 
      network:'testnet',
      address: osmosisAddress,
    }
    var positionsResponse1 = await osmosis.controller.poolPositions(osmosis, positionsRequest1)
    //console.debug(positionsResponse1);
    expect(positionsResponse1.pools.length).toBeGreaterThan(0)
  });

  it('removeLiquidity', async () => {
    const removeLiquidityRequest = {'decreasePercent':100, 'poolId':'62', 'chain':'osmosis', 'network':'testnet', 'address':osmosisAddress, 'allowedSlippage':'100%'};
    var removeLiquidityResponse = await osmosis.controller.removeLiquidity(osmosis, removeLiquidityRequest)
    //console.debug(removeLiquidityResponse);
    expect(removeLiquidityResponse.txHash).toBeDefined();
  });

  it('poolPrice', async () => {
    const poolPriceRequest = {
      chain:'osmosis', 
      network:'testnet',
      address: osmosisAddress,
      token0: 'OSMO',
      token1: 'ATOM',
    }
    var poolPriceResponse = await osmosis.controller.poolPrice(osmosis, poolPriceRequest)
    //console.debug(poolPriceResponse);
    expect(poolPriceResponse.token0).toEqual('OSMO')
  });

});

  

// describe('chain.routes via endpoints', () => {
//   it('/status', async () => {
//     var res1 = await request(gatewayApp)
//     //console.debug(res1)
//     var res = await request(gatewayApp)
//       .get(`/status`)
//       .send({
//         chain: 'osmosis',
//         network: 'testnet',
//       })
//       .set('Accept', 'application/json')
//       .expect('Content-Type', /json/)
//       .expect(200)
//       //console.debug(res)
//   });

//   it('/balances', async () => {
//     var res = await request(gatewayApp)
//       .post(`/balances`)
//       .send({
//         chain: 'osmosis',
//         network: 'testnet',
//         address: osmosisAddress,
//         // tokenSymbols: ['OSMO'],
//       })
//       .set('Accept', 'application/json')
//       .expect('Content-Type', /json/)
//       .expect(200)
//       // .expect((res) => expect(res.body.approvals.WETH).toEqual('0.001'))
//       //console.debug(res)
//   });

//   it('/tokens', async () => {
//     var res = await request(gatewayApp)
//       .get(`/chain/tokens?chain=osmosis&network=testnet`)
//       .send({
//       })
//       .set('Accept', 'application/json')
//       .expect('Content-Type', /json/)
//       .expect(200)
//       // .expect((res) => expect(res.body.approvals.WETH).toEqual('0.001'))
//       //console.debug(res)
//   });

//   it('/poll', async () => {
//     var res = await request(gatewayApp)
//       .get(`/poll`)
//       .send({
//       })
//       .set('Accept', 'application/json')
//       .expect('Content-Type', /json/)
//       .expect(200)
//       .expect((res) => expect(res.body.currentBlock).toBeDefined())
//       //console.debug(res)
//   });

//   it('/transfer', async () => {
//     var res = await request(gatewayApp)
//       .post(`/transfer`)
//       .send({
//         chain: 'osmosis',
//         network: 'testnet',
//         to: liveAddressNik,
//         from: osmosisAddress,
//         amount: 0.0001,
//         token: 'OSMO'
//       })
//       .set('Accept', 'application/json')
//       .expect('Content-Type', /json/)
//       .expect(200)
//       .expect((res) => expect(res.body).toContain('Transfer success'))
//       //console.debug(res)
//   });

// });

// describe('chain.routes - DISABLED via endpoints', () => {

//   it('/allowances', async () => {
//     var res = await request(gatewayApp)
//       .post(`/allowances`)
//       .send({
//       })
//       .set('Accept', 'application/json')
//       .expect('Content-Type', /json/)
//       .expect(200)
//       .expect((res) => expect(res.body.spender).toBeUndefined())
//       //console.debug(res)
//   });

//   it('/approve', async () => {
//     var res = await request(gatewayApp)
//       .post(`/approve`)
//       .send({
//       })
//       .set('Accept', 'application/json')
//       .expect('Content-Type', /json/)
//       .expect(200)
//       .expect((res) => expect(res.body.spender).toBeUndefined())
//       //console.debug(res)
//   });
    
//   it('/cancel', async () => {
//     var res = await request(gatewayApp)
//       .post(`/cancel`)
//       .send({
//       })
//       .set('Accept', 'application/json')
//       .expect('Content-Type', /json/)
//       .expect(200)
//       .expect((res) => expect(res.body.txHash).toBeUndefined())
//       //console.debug(res)
//   });
    
//   it('/nextNonce', async () => {
//     var res = await request(gatewayApp)
//       .post(`/nextNonce`)
//       .send({
//       })
//       .set('Accept', 'application/json')
//       .expect('Content-Type', /json/)
//       .expect(200)
//       .expect((res) => expect(res.body.nextNonce).toEqual(0))
//       //console.debug(res)
//   });

// });



describe('balances', () => {
  it('fail if wallet not found', async () => {

  });
});
