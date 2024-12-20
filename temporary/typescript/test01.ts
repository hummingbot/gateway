// import { TonClient, WalletContractV4 } from '@ton/ton';
// import { mnemonicToPrivateKey } from '@ton/crypto';
//
// async function test() {
//   const client = new TonClient({
//     endpoint: 'https://toncenter.com/api/v2/jsonRPC',
//   });
//
//   const mnemonics = Array.from(
//     { length: 24 },
//     (_, i) => `your mnemonic word ${i + 1}`,
//   ); // replace with your mnemonic
//   const keyPair = await mnemonicToPrivateKey(mnemonics);
//
//   const workchain = 0;
//   const wallet = WalletContractV4.create({
//     workchain,
//     publicKey: keyPair.publicKey,
//   });
//
//   const contract = client.open(wallet);
//
//   console.log(contract);
// }
//
// test();

console.log('test');
