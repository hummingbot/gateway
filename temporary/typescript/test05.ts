/* eslint-disable */
import { mnemonicToPrivateKey, mnemonicToWalletKey } from '@ton/crypto';
// import { mnemonicToKeyPair } from 'tonweb-mnemonic';
import { TonClient, WalletContractV3R2, WalletContractV4 } from '@ton/ton';

// This TON address can be represented in the following forms:
//   HEX:
//     0:527af606eee13113ac099d60b669d1b64aa723514a8d9667de4d13058474f791
// Mainnet:
//   Bounceable:
//     EQBSevYG7uExE6wJnWC2adG2SqcjUUqNlmfeTRMFhHT3kToY
// Non-bounceable:
// UQBSevYG7uExE6wJnWC2adG2SqcjUUqNlmfeTRMFhHT3kWfd
// Testnet:
//   Bounceable:
//     kQBSevYG7uExE6wJnWC2adG2SqcjUUqNlmfeTRMFhHT3kYGS
// Non-bounceable:
// 0QBSevYG7uExE6wJnWC2adG2SqcjUUqNlmfeTRMFhHT3kdxX

const originalPublicKey = '0QAqjRhhmF6KFJF1HHFC-M_5hqWMlwFrSaFcQHXGw3Nusbb9';
const publicKeyVariation1 = '';
const publicKeyVariation2 = '';
const publicKeyVariation3 = '';
const publicKeyVariation4 = '';
const publicKeyVariation5 = '';

const mnemonic = 'mammal entry lyrics addict swear sight artefact clog survey oil empower trip skill hospital similar piano slush bright gas depend warm whale marine merit';
const password = 'j8mwl^yi5gGvz*&ICUhgK45qU26ZnuPc_9M+rQL.1M*1EzM23$KKL)\\5GyRG4=!,6&ET]@027K.gb!~ND5i3?rGX3v7:MfH<WAd%';
const seed = 'TON default seed';

async function main() {
  console.log('mnemonic', mnemonic);
  console.log('password', password);
  console.log('seed', seed);

  console.log('publicKey (original)', originalPublicKey);
  console.log('publicKey (variation 1)', publicKeyVariation1);
  console.log('publicKey (variation 2)', publicKeyVariation2);
  console.log('publicKey (variation 3)', publicKeyVariation3);
  console.log('publicKey (variation 4)', publicKeyVariation4);
  console.log('publicKey (variation 5)', publicKeyVariation5);

  // await test01();
  // await test02();
  // await test03();
  // await test04();
  // await test05();
  // await test06();
  await test07();
}

async function test01() {
  const mnemonics = Array.from(mnemonic.split(' '));
  const keyPair = await mnemonicToPrivateKey(mnemonics);
  console.log('attempt 1', keyPair.publicKey.toString('base64url'));
}

async function test02() {
  const mnemonics = Array.from(mnemonic.split(' '));
  const keyPair = await mnemonicToPrivateKey(mnemonics, password);
  console.log('attempt 2', keyPair.publicKey.toString('base64url'));
}

async function test03() {
  const mnemonics = Array.from(mnemonic.split(' '));
  const keyPair = await mnemonicToWalletKey(mnemonics);
  console.log('attempt 3', keyPair.publicKey.toString('base64url'));
}

async function test04() {
  const mnemonics = Array.from(mnemonic.split(' '));
  const keyPair = await mnemonicToWalletKey(mnemonics, password);
  console.log('attempt 4', keyPair.publicKey.toString('base64url'));
}

async function test05() {
  const mnemonics = Array.from(mnemonic.split(' '));
  // const keyPair = await mnemonicToKeyPair(mnemonics);
  // console.log('attempt 5', uint8ArrayToBase64Url(keyPair.publicKey));
}

// async function test06() {
//   const mnemonics = Array.from(mnemonic.split(' '));
//   const keyPair = await mnemonicToKeyPair(mnemonics, password);
//   console.log('attempt 6', uint8ArrayToBase64Url(keyPair.publicKey));
// }

async function test07() {
  // const tonClient = new TonClient({ endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC" }); // testnet
  const tonClient = new TonClient({ endpoint: "https://toncenter.com/api/v2/jsonRPC" });

  const mnemonics = Array.from(mnemonic.split(' '));
  let keyPair = await mnemonicToPrivateKey(mnemonics);
  let workchain = 0;
  const wallet = WalletContractV3R2.create({ workchain, publicKey: keyPair.publicKey, });
  const contract = tonClient.open(wallet);

  console.log(contract.address.toString());

  //   console.log('attempt 7 - wallet address', wallet.address);
  // console.log('attempt 7 - wallet publicKey', uint8ArrayToBase64Url(wallet.publicKey));
  // console.log('attempt 7 - wallet walletId', wallet.walletId);
  // console.log('attempt 7 - contract', contract.address.toString());
}

function uint8ArrayToBase64Url(array: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...array));

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

main()
  .then(() => console.log('Done'))
  .catch((err) => console.error('Error:', err));
