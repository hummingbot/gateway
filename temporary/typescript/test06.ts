/* eslint-disable */

// npx tsx temporary/typescript/test06.ts

import { mnemonicToPrivateKey } from '@ton/crypto';
import { internal, toNano, TonClient, WalletContractV3R2 } from '@ton/ton';
import { DEX, pTON } from "@ston-fi/sdk";


const mnemonic = 'sort way burger decrease wild state welcome annual assume mix snack list scorpion improve anxiety fame soap crunch gain foil account knee top soul';

async function main() {
  // console.log('publicKey (original)', originalPublicKey);
  // console.log('publicKey (variation 1)', publicKeyVariation1);
  // console.log('publicKey (variation 2)', publicKeyVariation2);
  // console.log('publicKey (variation 3)', publicKeyVariation3);
  // console.log('publicKey (variation 4)', publicKeyVariation4);
  // console.log('publicKey (variation 5)', publicKeyVariation5);

  await trade();
}

function uint8ArrayToBase64Url(array: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...array));

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function trade() {
  const tonClient = new TonClient({ endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC" }); // testnet
  // const tonClient = new TonClient({ endpoint: "https://toncenter.com/api/v2/jsonRPC" });

  const mnemonics = Array.from(mnemonic.split(' '));
  let keyPair = await mnemonicToPrivateKey(mnemonics);
  let workchain = 0;
  const wallet = WalletContractV3R2.create({ workchain, publicKey: keyPair.publicKey });
  const contract = tonClient.open(wallet);
  // const balance = await wallet.getBalance();
  // console.log(balance);

  const router = tonClient.open(new DEX.v1.Router());

  // const dex = client.open(new DEX.v1.Router());

  // swap 1 TON to STON but not less than 1 nano STON
  const txParams = await router.getSwapTonToJettonTxParams({
    userWalletAddress: wallet.address.toString(), // ! replace with your address
    proxyTon: new pTON.v1(),
    offerAmount: toNano("1"),
    askJettonAddress: "kQAiboDEv_qRrcEdrYdwbVLNOXBHwShFbtKGbQVJ2OKxY_Di", // STON
    minAskAmount: "1",
  });

  console.log('txParams', txParams)


  // // swap 1 TON for a STON but not less than 0.1 STON
  // const txArgs = {
  //   offerAmount: toNano("1"),
  //   askJettonAddress: "kQAiboDEv_qRrcEdrYdwbVLNOXBHwShFbtKGbQVJ2OKxY_Di",
  //   minAskAmount: toNano("0.1"),
  //   proxyTon: new pTON.v1(),
  //   userWalletAddress: wallet.address.toString(),
  // };
  //
  // // you can instantly send the transaction using the router method with send suffix
  // await router.sendSwapTonToJetton(contract.sender(keyPair.secretKey), txArgs);
  //
  // // or you can get the transaction parameters
  // const txParams = await router.getSwapTonToJettonTxParams(txArgs);
  //
  // // and send it manually later
  // const result = await contract.sendTransfer({
  //   seqno: await contract.getSeqno(),
  //   secretKey: keyPair.secretKey,
  //   messages: [internal(txParams)],
  // });
  //
  // console.log(txParams)
  // console.log(result)
}

main()
  .then(() => console.log('Done'))
  .catch((err) => console.error('Error:', err));
