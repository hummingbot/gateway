/* eslint-disable */
import { mnemonicToPrivateKey, mnemonicToWalletKey } from '@ton/crypto';
import { mnemonicToKeyPair } from 'tonweb-mnemonic';
import { TonClient, WalletContractV4 } from '@ton/ton';

const publicKey = '<wallet address got from https://wallet.ton.org/?testnet=true>';
const mnemonic = '<my mnemonic string with 24 different words>';
const password = '<my password used to send tokens or backup the wallet on https://wallet.ton.org/?testnet=true>';
const seed = 'TON default seed';

async function main() {
  console.log('mnemonic', mnemonic);
  console.log('password', password);
  console.log('seed', seed);
  console.log('publicKey', publicKey);

  await test01();
  await test02();
  await test03();
  await test04();
  await test05();
  await test06();
  await test07();
}

async function test01() {
  const mnemonics = Array.from(mnemonic.split(' '));
  const keyPair = await mnemonicToPrivateKey(mnemonics);
  console.log(keyPair.publicKey.toString('base64url'));
}

async function test02() {
  const mnemonics = Array.from(mnemonic.split(' '));
  const keyPair = await mnemonicToPrivateKey(mnemonics, password);
  console.log(keyPair.publicKey.toString('base64url'));
}

async function test03() {
  const mnemonics = Array.from(mnemonic.split(' '));
  const keyPair = await mnemonicToWalletKey(mnemonics);
  console.log(keyPair.publicKey.toString('base64url'));
}

async function test04() {
  const mnemonics = Array.from(mnemonic.split(' '));
  const keyPair = await mnemonicToWalletKey(mnemonics, password);
  console.log(keyPair.publicKey.toString('base64url'));
}

async function test05() {
  const mnemonics = Array.from(mnemonic.split(' '));
  const keyPair = await mnemonicToKeyPair(mnemonics);
  console.log(uint8ArrayToBase64Url(keyPair.publicKey));
}

async function test06() {
  const mnemonics = Array.from(mnemonic.split(' '));
  const keyPair = await mnemonicToKeyPair(mnemonics, password);
  console.log(uint8ArrayToBase64Url(keyPair.publicKey));
}

async function test07() {
  const tonClient = new TonClient({ endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC" }); // testnet
  // const tonClient = new TonClient({ endpoint: "https://toncenter.com/api/v2/jsonRPC" });

  const mnemonics = Array.from(mnemonic.split(' '));
  let keyPair = await mnemonicToPrivateKey(mnemonics);
  let workchain = 0;
  const wallet = WalletContractV4.create({ workchain, publicKey: keyPair.publicKey, });
  const contract = tonClient.open(wallet);

  console.log('wallet address', wallet.address);
  console.log('wallet publicKey', uint8ArrayToBase64Url(wallet.publicKey));
  console.log('wallet walletId', wallet.walletId);
  console.log('contract', contract.address.toString());
}

function uint8ArrayToBase64Url(array: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...array));

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

main()
  .then(() => console.log('Done'))
  .catch((err) => console.error('Error:', err));
