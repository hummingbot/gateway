import { patch, unpatch } from '../../../test/services/patch';
import { Osmosis } from '../../../src/chains/osmosis/osmosis';
import { ConfigManagerCertPassphrase } from '../../../src/services/config-manager-cert-passphrase';
import { addWallet, getWallets } from '../../../src/services/wallet/wallet.controllers';
import Decimal from 'decimal.js-light';
import { CosmosAsset } from '../../../src/chains/cosmos/cosmos-base';
import { Side } from '../../../src/amm/amm.requests';

const osmosisAddress = 'osmo1gxfandcf6x6y0lv3afv0p4w4akv809ycrly4cs';
const osmosisPrivateKey = '2e8be986f72f76dba7f8448b2e2342d3297cd628cf08aad9b90098102824f9d5';
const osmosisOutboundAddress = 'osmo1mvsg3en5ulpnpd3dset2m86zjpnzp4v4epmjh7'

const network = 'testnet'

jest.setTimeout(300000); // run for 5 mins

let osmosis: Osmosis;

beforeAll(async () => {
  patch(ConfigManagerCertPassphrase, 'readPassphrase', () => 'a');
  osmosis = Osmosis.getInstance(network);

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
      network: network,
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
    expect(getTokens.tokens[0].symbol).toEqual('OSMO');
  });

  it('getTokens All', async () => {
    var getTokens = await osmosis.controller.getTokens(osmosis, {});
    expect(getTokens.tokens.length).toBeGreaterThan(0);
  });

  it('balances OSMO', async () => {
    const balances = await osmosis.controller.balances(osmosis, {address:osmosisAddress, tokenSymbols:['OSMO']});
    expect(Number(balances.balances['OSMO'])).toBeGreaterThan(0);
  });

  it('balances All', async () => {
    const balances = await osmosis.controller.balances(osmosis, {address:osmosisAddress, tokenSymbols:['OSMO']});
    expect(Number(balances.balances['OSMO'])).toBeGreaterThan(0);
  });

  it('getWalletFromPrivateKey', async () => {
    const walleto = await osmosis.getWalletFromPrivateKey(
      osmosisPrivateKey,
      'osmo'
    );
    expect(walleto.prefix).toEqual('osmo');

    const balanceo = await osmosis.getBalances(walleto)
    expect(Number(balanceo['OSMO'].value)).toBeGreaterThan(0);
  });

  it('balances All', async () => {
    const block = await osmosis.getCurrentBlockNumber();
    expect(block).toBeGreaterThan(0);
  });

  it('getTokenBySymbol', async () => {
    var token = osmosis.getTokenBySymbol('ATOM')!;
    var token2 = osmosis.getTokenForSymbol('OSMO')!;
    expect(token.decimals).toEqual(6);
    expect(token2.symbol).toEqual('OSMO');
  });

  it('transfer', async () => {
    var transfer = await osmosis.controller.transfer(osmosis, {'from':osmosisAddress, 'to':osmosisOutboundAddress, 'token':'OSMO', amount:'0.000001', 'chain':'osmosis', 'network':network});
    expect(transfer).toContain('Transfer success');
  });

});


describe('chain.routes - DISABLED', () => {

  it('allowances', async () => {
    var allowances = await osmosis.controller.allowances(osmosis, {'address':osmosisAddress, 'spender':osmosisOutboundAddress, 'tokenSymbols':[], 'chain':'osmosis', 'network':network});
    expect(allowances.spender).toBeUndefined()
  });

  it('approve', async () => {
    var approve = await osmosis.controller.approve(osmosis, {'address':osmosisAddress, 'spender':osmosisOutboundAddress, token:'OSMO', 'chain':'osmosis', 'network':network});
    expect(approve.spender).toBeUndefined()
  });

  it('cancel', async () => {
    var cancel = await osmosis.controller.cancel(osmosis, {'address':osmosisAddress, 'nonce':0, 'chain':'osmosis', 'network':network});
    expect(cancel.txHash).toBeUndefined()
  });

  it('nextNonce', async () => {
    var nextNonce = await osmosis.controller.nextNonce(osmosis, {'address':osmosisAddress, 'chain':'osmosis', 'network':network});
    expect(nextNonce.nonce).toEqual(0)
  });

  it('nonce', async () => {
    var nonce = await osmosis.controller.nonce(osmosis, {'address':osmosisAddress, 'chain':'osmosis', 'network':network});
    expect(nonce.nonce).toEqual(0)
  });

});



describe('controllers - price + trade', () => {

  it('estimateGas', async () => {
    var estimateGas = await osmosis.controller.estimateGas(osmosis);
    expect(estimateGas.gasPriceToken).toEqual('uosmo');
  });

  it('getTradeInfo', async () => {
    const tradeInfo = await osmosis.controller.getTradeInfo(osmosis, "OSMO", "ION", new Decimal(1.0), "BUY")
    expect((tradeInfo.baseToken as CosmosAsset).base).toEqual('uosmo');
    expect(tradeInfo.requestAmount.toNumber()).toEqual(1);
    expect(tradeInfo.expectedTrade.routes.length).toBeGreaterThanOrEqual(1);
  });

  it('price', async () => {
    // slippage must be high on testnet due to price mismatch with pool ratios
    const priceRequest1 = {'quote':'ION', 'base':'OSMO', 'amount':'1', 'side':'BUY' as Side, 'allowedSlippage':'100/100', 'chain':'osmosis', 'network':network};
    const priceResponse1 = await osmosis.controller.price(osmosis, priceRequest1)
    expect(priceResponse1.base).toEqual('OSMO')
  });

  it('trade', async () => {
    const tradeRequest = {'quote':'ION', 'base':'OSMO', 'amount':'0.01', 'side':'BUY' as Side, 'allowedSlippage':'100/100', 'chain':'osmosis', 'network':network, 'address':osmosisAddress, };
    const tradeResponse = await osmosis.controller.trade(osmosis, tradeRequest)
    expect(tradeResponse.base).toEqual('uosmo')
  });

  it('trade back', async () => {
    const tradeRequest = {'quote':'OSMO', 'base':'ION', 'amount':'0.00001', 'side':'BUY' as Side, 'allowedSlippage':'100/100', 'chain':'osmosis', 'network':network, 'address':osmosisAddress, };
    const tradeResponse = await osmosis.controller.trade(osmosis, tradeRequest)
    expect(tradeResponse.base).toEqual('uion')
  });


});

// we're not testing poll() since transactions seem to 404 after a week or so

describe('controllers - CL Pools + Liquidity', () => {

  // best to join pools using one amount == 0 (so input 1 token type at a time)
  //  adds tend to fail unless amounts input are similar in relative $ value
  var poolIdGAMM: number;
  it('addLiquidity', async () => {
    const addLiquidityRequestFunction = {'fee': 'high', 'token0':'ION', 'token1':'OSMO', 'amount0':'0', 'amount1':'0.0005', 'chain':'osmosis', 'network':network, 'address':osmosisAddress, };
    var addLiquidityResponse = await osmosis.controller.addLiquidity(osmosis, addLiquidityRequestFunction)
    poolIdGAMM = addLiquidityResponse.tokenId;
    expect(addLiquidityResponse.tokenId).toBeDefined();
  });

  var poolIdCL: number;
  it('addLiquidity CL', async () => {
    const addLiquidityRequestFunction = {'allowedSlippage':'100/100', 'lowerPrice':'100', 'upperPrice':'500', 'fee': 'high', 'token0':'ION', 'token1':'OSMO', 'amount0':'0.000401', 'amount1':'0.1', 'chain':'osmosis', 'network':network, 'address':osmosisAddress};
    var addLiquidityResponse = await osmosis.controller.addLiquidity(osmosis, addLiquidityRequestFunction)
    poolIdCL = addLiquidityResponse.tokenId;
    expect(addLiquidityResponse.tokenId).toBeDefined();
  });

  it('positionsRequest CL', async () => {
    const positionsRequest1 = {
      chain:'osmosis', 
      network:network,
      address: osmosisAddress,
      tokenId: poolIdCL // CL
    }
    var positionsResponse1 = await osmosis.controller.poolPositions(osmosis, positionsRequest1)
    expect(positionsResponse1.pools!.length).toBeGreaterThan(0)
  });

  it('removeLiquidity GAMM', async () => {
    const removeLiquidityRequest = {'decreasePercent':100, 'tokenId':poolIdGAMM, 'chain':'osmosis', 'network':network, 'address':osmosisAddress, 'allowedSlippage':'100/100'};
    var removeLiquidityResponse = await osmosis.controller.removeLiquidity(osmosis, removeLiquidityRequest)
    expect(removeLiquidityResponse.txHash).toBeDefined();
  });

  it('removeLiquidity CL', async () => {
    const removeLiquidityRequest = {'decreasePercent':100, 'tokenId':poolIdCL, 'chain':'osmosis', 'network':network, 'address':osmosisAddress, 'allowedSlippage':'100/100'};
    var removeLiquidityResponse = await osmosis.controller.removeLiquidity(osmosis, removeLiquidityRequest)
    expect(removeLiquidityResponse.txHash).toBeDefined();
  });

  it('poolPrice', async () => {
    const poolPriceRequest = {
      chain:'osmosis', 
      network:network,
      address: osmosisAddress,
      token0: 'OSMO',
      token1: 'ATOM',
    }
    var poolPriceResponse = await osmosis.controller.poolPrice(osmosis, poolPriceRequest)
    expect(poolPriceResponse.token0).toEqual('OSMO')
  });

});

