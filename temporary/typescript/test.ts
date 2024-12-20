import { mnemonicToPrivateKey, mnemonicToWalletKey } from "@ton/crypto";

const mnemonic = "mammal entry lyrics addict swear sight artefact clog survey oil empower trip skill hospital similar piano slush bright gas depend warm whale marine merit"
const password = "Xu@O#s$iXC%K00@E0qIAGzEqCL*^HL#iJnrUhU3f@wdrbcZ&cJ!yp65Uo2oln*#44pZl3mU*bnypm2^$JCqGwfJuYmz9^MeYhe3m"
async function main() {
    // we also tried with the wallet backup password, and other variations, among other variations like using mnemonicToSeed, etc
    const keys1 = await mnemonicToPrivateKey(mnemonic.split(" "));
    const keys2 = await mnemonicToPrivateKey(mnemonic.split(" "), password);
    const keys3 = await mnemonicToWalletKey(mnemonic.split(" "), password);
    const keys4 = await mnemonicToWalletKey(mnemonic.split(" "));

    // Criando constantes e logs para cada chave gerada
    const publicKeyBase64_1 = keys1.publicKey.toString("base64url");
    console.log("Public Key Base64 (private):", publicKeyBase64_1);

    const publicKeyBase64_2 = keys2.publicKey.toString("base64url");
    console.log("Public Key Base64 (private + pass):", publicKeyBase64_2);

    const publicKeyBase64_3 = keys3.publicKey.toString("base64url");
    console.log("Public Key Base64 (Wallet):", publicKeyBase64_3);

    const publicKeyBase64_4 = keys4.publicKey.toString("base64url");
    console.log("Public Key Base64 (Wallet + pass):", publicKeyBase64_4);
}

main().then(e => console.log(e)).catch(err => console.log(err))
