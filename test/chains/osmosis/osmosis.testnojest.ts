// @ts-nocheck
import fs = require('fs');
import https = require('https');
import axios from 'axios';
import BigNumber from 'bignumber.js';

type method = 'GET' | 'POST';

const certPath = '/home/vboxuser/hbot/gateway/certs';

const httpsAgent = axios.create({
  httpsAgent: new https.Agent({
    ca: fs.readFileSync(certPath.concat('/ca_cert.pem'), {
      encoding: 'utf-8',
    }),
    cert: fs.readFileSync(certPath.concat('/client_cert.pem'), {
      encoding: 'utf-8',
    }),
    key: fs.readFileSync(certPath.concat('/client_key.pem'), {
      encoding: 'utf-8',
    }),
    host: '127.0.0.1',
    port: 15888,
    requestCert: true,
    rejectUnauthorized: false,
  }),
});
const request = async (
  method: method,
  path: string,
  params: Record<string, any>
) => {
  try {
    let response;
    const gatewayAddress = 'https://127.0.0.1:15888';
    if (method === 'GET') {
      response = await httpsAgent.get(gatewayAddress + path);
    } else {
      response = await httpsAgent.post(gatewayAddress + path, params);
    }
    return response.data;
  } catch (err) {
    console.log(`${method} ${path} - ${err}`);
  }
};

import { Osmosis } from '../../../src/chains/osmosis/osmosis';
import { addWallet, getWallets } from '../../../src/services/wallet/wallet.controllers';
import Decimal from 'decimal.js-light';
import { Side } from '../../../src/amm/amm.requests';

const osmosisAddress_testnet = 'osmo1gxfandcf6x6y0lv3afv0p4w4akv809ycrly4cs';
const osmosisAddress_mainnet = 'osmo1mvsg3en5ulpnpd3dset2m86zjpnzp4v4epmjh7';

const osmosisPrivateKey_testnet = '2e8be986f72f76dba7f8448b2e2342d3297cd628cf08aad9b90098102824f9d5'; // real testnet
const osmosisPrivateKey_mainnet = '8155cee93c2ff619e0943db140a31fe0ab34df8c85fefe114eb2200ef1a017db';
// const osmosisPrivateKey_mainnet = 'ENTER PRIVATE KEY AND UPDATE osmosisAddress_mainnet';

const txHash_mainnet = 'FAEED1587F703D59CC8641D06DF18363E9E960D56F533D1ED75BA186990954D5'
const txHash_testnet = '0BF855ED36FDE2AEBA753A51FA0741A45E2D5CADD0583815559BDB9314F1380C'

// update this to mainnet if desired to test multi-hop routes
var network = 'testnet'

var slippage = '100%'
var osmosisAddress_from = osmosisAddress_testnet
var osmosisAddress_to = osmosisAddress_mainnet
var osmosisPrivateKey = osmosisPrivateKey_testnet
if (network == 'mainnet'){
  slippage = '2%'
  osmosisAddress_from = osmosisAddress_mainnet
  osmosisAddress_to = osmosisAddress_testnet
  osmosisPrivateKey = osmosisPrivateKey_mainnet
}

async function test() {
  let osmosis: Osmosis;
  
  osmosis = Osmosis.getInstance(network);
  await osmosis.init();

  var poolId;
  try {
    console.debug('addLiquidityResponse');
    const addLiquidityRequestFunction = {'fee': 'high', 'token0':'OSMO', 'token1':'ION', 'amount0':'0.0001', 'amount1':'0', 'chain':'osmosis', 'network': network, 'address':osmosisAddress_from, }; //'poolId':'62', 
    var addLiquidityResponse = await osmosis.controller.addLiquidity(osmosis, addLiquidityRequestFunction)
    poolId = addLiquidityResponse.poolId;
    console.debug(addLiquidityResponse);
  } catch (err) {
    console.debug(err);
  }

  try {
    console.debug('poolPriceResponse');
    const poolPriceRequest = {
      chain:'osmosis', 
      network:'testnet',
      address: osmosisAddress_from,
      token0: 'OSMO',
      token1: 'ATOM',
    }
    var poolPriceResponse = await osmosis.controller.poolPrice(osmosis, poolPriceRequest)
    console.debug(poolPriceResponse);
  } catch (err) {
    console.debug(err);
  }

  try {
    console.debug('positionsResponse1');
    const positionsRequest1 = {
      chain:'osmosis', 
      network:'testnet',
      address: osmosisAddress_from,
    }
    var positionsResponse1 = await osmosis.controller.poolPositions(osmosis, positionsRequest1)
    console.debug(positionsResponse1);
  } catch (err) {
    console.debug(err);
  }



  // START USUAL TEST RUNS

// // poll
// try {
//   console.debug('poll');
//   const pollRequest = {'txHash':txHash_testnet, 'chain':'osmosis', 'network': network};
//   const pollResponse = await osmosis.controller.poll(osmosis, pollRequest)
//   console.debug(pollResponse);
// } catch (err) {
//   console.debug(err);
// }

//   try {
//     await addWallet({
//       privateKey: osmosisPrivateKey,
//       chain: 'osmosis',
//       network: network,
//     });

//     const wallets = await getWallets();
//     console.debug(wallets);

//   } catch (err) {
//     console.debug(err);
//   }

//   try {
//     console.debug('balances OSMO');
//     const balances = await osmosis.controller.balances(osmosis, {address:osmosisAddress_from, tokenSymbols:['OSMO']});
//     console.debug(balances);
//   } catch (err) {
//     console.debug(err);
//   }

//   try {
//     console.debug('balances All');
//     const balances = await osmosis.controller.balances(osmosis, {address:osmosisAddress_from, tokenSymbols:[]});
//     console.debug(balances);
//   } catch (err) {
//     console.debug(err);
//   }

//   // DISABLED ENDPOINTS
//   try {
//     console.debug('allowances');
//     var allowances = await osmosis.controller.allowances(osmosis, {'address':osmosisAddress_to, 'spender':osmosisAddress_from, 'tokenSymbols':[], 'chain':'osmosis', 'network': network});
//     console.debug(allowances);
//     console.debug(allowances);
//   } catch (err) {
//     console.debug(err);
//   }
//   try {
//     console.debug('cancel');
//     var cancel = await osmosis.controller.cancel(osmosis, {'address':osmosisAddress_to, 'nonce':0, 'chain':'osmosis', 'network': network});
//     console.debug(cancel);
//   } catch (err) {
//     console.debug(err);
//   }
//   try {
//     console.debug('approve');
//     var approve = await osmosis.controller.approve(osmosis, {'address':osmosisAddress_to, 'spender':osmosisAddress_from, token:'OSMO', 'chain':'osmosis', 'network': network});
//     console.debug(approve);
//   } catch (err) {
//     console.debug(err);
//   }
//   // DISABLED ENDPOINTS
  
//   try {
//     console.debug('transfer');
//     var transfer = await osmosis.controller.transfer(osmosis, {'from':osmosisAddress_from, 'to':osmosisAddress_to, 'token':'OSMO', amount:'0.000001', 'chain':'osmosis', 'network': network});
//     console.debug(transfer);
//   } catch (err) {
//     console.debug(err);
//   }

//   try {
//     console.debug('getTokens OSMO');
//     var getTokens = await osmosis.controller.getTokens(osmosis, {tokenSymbols:['OSMO']});
//     console.debug(getTokens);
//   } catch (err) {
//     console.debug(err);
//   }

//   try {
//     console.debug('getTokens All');
//     var getTokens = await osmosis.controller.getTokens(osmosis, {});
//     console.debug(getTokens);
//   } catch (err) {
//     console.debug(err);
//   }

//   try {
//     console.debug('estimateGas');
//     var estimateGas = await osmosis.controller.estimateGas(osmosis);
//     console.debug(estimateGas);
//   } catch (err) {
//     console.debug(err);
//   }

//   try {
//     console.debug('block');
//     const block = await osmosis.getCurrentBlockNumber();
//     console.debug(block);
//   } catch (err) {
//     console.debug(err);
//   }

//   try {
//     console.debug('wallet balances All');
//     const walleto = await osmosis.getWalletFromPrivateKey(
//       osmosisPrivateKey,
//       'osmo'
//     );
//     console.debug(walleto);
//   } catch (err) {
//     console.debug(err);
//   }


//   try {
//     console.debug('get token');
//     var token = osmosis.getTokenBySymbol('ATOM');
//     var token2 = osmosis.getTokenForSymbol('OSMO');
//     console.debug(token);
//     console.debug(token2);
//   } catch (err) {
//     console.debug(err);
//   }




//   try {
//     console.debug('priceResponse1');
//     const priceRequest1 = {'quote':'ION', 'base':'OSMO', 'amount':'1', 'side':'BUY' as Side, 'allowedSlippage':slippage, 'chain':'osmosis', 'network': network};
//     const priceResponse1 = await osmosis.controller.price(osmosis, priceRequest1)
//     console.debug(priceResponse1)
//   } catch (err) {
//     console.debug(err);
//   }

//   try {
//     console.debug('priceResponse2');
//     const priceRequest2 = {'quote':'OSMO', 'base':'ION', 'amount':'1', 'side':'BUY' as Side, 'allowedSlippage':slippage, 'chain':'osmosis', 'network': network};
//     const priceResponse2 = await osmosis.controller.price(osmosis, priceRequest2)
//     console.debug(priceResponse2)
//   } catch (err) {
//     console.debug(err);
//   }


//   // trade
//   try {
//     console.debug('tradeResponse');
//     const tradeRequest = {'quote':'ION', 'base':'OSMO', 'amount':'0.01', 'side':'BUY' as Side, 'allowedSlippage':slippage, 'chain':'osmosis', 'network': network, 'address':osmosisAddress_from, };
//     const tradeResponse = await osmosis.controller.trade(osmosis, tradeRequest)
//     console.debug(tradeResponse);
//   } catch (err) {
//     console.debug(err);
//   }

//   // trade back
//   try {
//     console.debug('tradeResponse');
//     const tradeRequest = {'quote':'OSMO', 'base':'ION', 'amount':'0.00001', 'side':'BUY' as Side, 'allowedSlippage':slippage, 'chain':'osmosis', 'network': network, 'address':osmosisAddress_from, };
//     const tradeResponse = await osmosis.controller.trade(osmosis, tradeRequest)
//     console.debug(tradeResponse);
//   } catch (err) {
//     console.debug(err);
//   }


//   // 3 cycle trade - tests 2-hop trades. ONLY WORKS ON MAINNET
//   if (network == 'mainnet'){
//     try {
//       console.debug('tradeResponse');
//       const tradeRequest = {'quote':'JUNO', 'base':'OSMO', 'amount':'0.01', 'side':'BUY' as Side, 'allowedSlippage':slippage, 'chain':'osmosis', 'network': network, 'address':osmosisAddress_from, };
//       const tradeResponse = await osmosis.controller.trade(osmosis, tradeRequest)
//       console.debug(tradeResponse);
//     } catch (err) {
//       console.debug(err);
//     }
    
//     try {
//       console.debug('tradeResponse');
//       const tradeRequest = {'quote':'STARS', 'base':'JUNO', 'amount':'0.01', 'side':'BUY' as Side, 'allowedSlippage':slippage, 'chain':'osmosis', 'network': network, 'address':osmosisAddress_from, };
//       const tradeResponse = await osmosis.controller.trade(osmosis, tradeRequest)
//       console.debug(tradeResponse);
//     } catch (err) {
//       console.debug(err);
//     }

//     try {
//       console.debug('tradeResponse');
//       const tradeRequest = {'quote':'OSMO', 'base':'STARS', 'amount':'0.3', 'side':'BUY' as Side, 'allowedSlippage':slippage, 'chain':'osmosis', 'network': network, 'address':osmosisAddress_from, };
//       const tradeResponse = await osmosis.controller.trade(osmosis, tradeRequest)
//       console.debug(tradeResponse);
//     } catch (err) {
//       console.debug(err);
//     }
//   }
   
  
//   try {
//     console.debug('priceResponse3');
//     const priceRequest3 = {'quote':'ATOM', 'base':'OSMO', 'amount':'0.01', 'side':'BUY' as Side, 'allowedSlippage':slippage, 'chain':'osmosis', 'network': network};
//     const priceResponse3 = await osmosis.controller.price(osmosis, priceRequest3)
//     console.debug(priceResponse3)
//   } catch (err) {
//     console.debug(err);
//   }

//   try {
//     console.debug('tradeInfo');
//     const tradeInfo = await osmosis.controller.getTradeInfo(osmosis, "OSMO", "ION", new Decimal(1.0), "BUY")
//     console.debug(tradeInfo);
//   } catch (err) {
//     console.debug(err);
//   }

//   var poolId;
//   try {
//     console.debug('addLiquidityResponse');
//     const addLiquidityRequestFunction = {'fee': 'high', 'token0':'OSMO', 'token1':'ION', 'amount0':'0.0001', 'amount1':'0', 'chain':'osmosis', 'network': network, 'address':osmosisAddress_from, }; //'poolId':'62', 
//     var addLiquidityResponse = await osmosis.controller.addLiquidity(osmosis, addLiquidityRequestFunction)
//     poolId = addLiquidityResponse.poolId;
//     console.debug(addLiquidityResponse);
//   } catch (err) {
//     console.debug(err);
//   }

//   try {
//     if (poolId){
//       console.debug('removeLiquidityResponse');
//       const removeLiquidityRequest = {'decreasePercent':100, 'poolId':poolId, 'chain':'osmosis', 'network': network, 'address':osmosisAddress_from, 'allowedSlippage':slippage};
//       var removeLiquidityResponse = await osmosis.controller.removeLiquidity(osmosis, removeLiquidityRequest)
//       console.debug(removeLiquidityResponse);
//     }
//   } catch (err) {
//     console.debug(err);
//   }

//   try {
//     console.debug('poolPriceResponse');
//     const poolPriceRequest = {
//       chain:'osmosis', 
//       network:'testnet',
//       address: osmosisAddress_from,
//       token0: 'OSMO',
//       token1: 'ATOM',
//     }
//     var poolPriceResponse = await osmosis.controller.poolPrice(osmosis, poolPriceRequest)
//     console.debug(poolPriceResponse);
//   } catch (err) {
//     console.debug(err);
//   }

//   try {
//     console.debug('positionsResponse1');
//     const positionsRequest1 = {
//       chain:'osmosis', 
//       network:'testnet',
//       address: osmosisAddress_from,
//     }
//     var positionsResponse1 = await osmosis.controller.poolPositions(osmosis, positionsRequest1)
//     console.debug(positionsResponse1);
//   } catch (err) {
//     console.debug(err);
//   }

  
//   await osmosis.close();
// }

//   // BELOW NEEDS TO HAVE GATEWAY RUNNIN SEPARATELY
// async function testViaEndpoints() {
//   let osmosis: Osmosis;
  
//   osmosis = Osmosis.getInstance('testnet');
//   await osmosis.init();

//   console.debug('starting');
//   console.debug('starting');
//   console.debug('starting');
//   console.debug('starting');

//   const status = await request('GET', '/chain/status', {
//     privateKey: osmosisPrivateKey,
//     chain: 'osmosis',
//     network: 'testnet',
//   });
//   console.debug('status');
//   console.debug(status);

//   const balances = await request('POST', '/chain/balances', {
//     privateKey: osmosisPrivateKey,
//     address: osmosisAddress_testnet,
//     chain: 'osmosis',
//     network: 'testnet',
//     tokenSymbols: ['OSMO','ATOM','ION'],
//   });
//   console.debug('balances');
//   console.debug(balances);

//   const tokensList = await osmosis.controller.getTokens(osmosis,{})
//   console.debug(tokensList);

//   const tokens = await request('GET', '/chain/tokens?chain=osmosis&network=testnet', {
//     privateKey: osmosisPrivateKey,
//     chain: 'osmosis',
//     network: 'testnet',
//     query: {chain: 'osmosis', network: 'testnet'},
//   });
//   console.debug('tokens');
//   console.debug(tokens);

  await osmosis.close();

}

async function testViaEndpoints2() {

  const priceRequest = await request('POST', '/amm/price_osmosis', {
    privateKey: osmosisPrivateKey,
    chain: 'osmosis',
    network: 'testnet',
    address: osmosisAddress_testnet,
    connector: 'osmosis',
    quote: 'ION',
    base: 'OSMO',
    amount: '0.001',
    side: 'BUY',
    allowedSlippage: '1%',
  });
  console.debug(priceRequest);

  // can specify poolId
  const addLiquidityRequest = await request('POST', '/amm/liquidity/add_osmosis', {
    privateKey: osmosisPrivateKey,
    chain: 'osmosis',
    network: 'testnet',
    address: osmosisAddress_testnet,
    connector: 'osmosis',
    token0: 'ION',
    token1: 'OSMO',
    amount0: '0.001',
    amount1: '0.1',
    // poolId: 'X',
  });
  console.debug(addLiquidityRequest);

  const removeLiquidityRequest = await request('POST', '/amm/liquidity/remove_osmosis', {
    privateKey: osmosisPrivateKey,
    chain: 'osmosis',
    network: 'testnet',
    address: osmosisAddress_testnet,
    connector: 'osmosis',
    decreasePercent: 10,
    poolId: '62',
  });
  console.debug(removeLiquidityRequest);

  const poolPriceRequest = await request('POST', '/amm/liquidity/price_osmosis', {
    privateKey: osmosisPrivateKey,
    chain: 'osmosis',
    network: 'testnet',
    address: osmosisAddress_testnet,
    connector: 'osmosis',
    token0: 'ION',
    token1: 'OSMO',
  });
  console.debug(poolPriceRequest);

    
  const poolPriceRequestTest = await request('POST', '/amm/liquidity/price_osmosis', {
    privateKey: osmosisPrivateKey,
    chain: 'osmosis',
    network: 'testnet',
    address: osmosisAddress_testnet,
    connector: 'osmosis',
    token0: 'ATOM',
    token1: 'OSMO',
  });
  console.debug(poolPriceRequestTest);

  // can specify poolId
  const positionsRequest = await request('POST', '/amm/liquidity/positions_osmosis', {
    privateKey: osmosisPrivateKey,
    chain: 'osmosis',
    network: 'testnet',
    address: osmosisAddress_testnet,
    connector: 'osmosis',
    // poolId: 'X',
  });
  console.debug(positionsRequest);

  


};

if (false){
  testViaEndpoints2();
}

test();
