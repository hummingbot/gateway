import { mnemonicNew, mnemonicToPrivateKey } from "@ton/crypto";
import { TonClient, WalletContractV4, Address } from "@ton/ton";

const mnemonic = "mammal entry lyrics addict swear sight artefact clog survey oil empower trip skill hospital similar piano slush bright gas depend warm whale marine merit"

async function main() {
    const tonClient = new TonClient({ endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC" });

    let mnemonics = await mnemonicNew(24, mnemonic);
    let keyPair = await mnemonicToPrivateKey(mnemonics);
    let workchain = 0;
    let wallet = WalletContractV4.create({ workchain, publicKey: keyPair.publicKey, });
    const contract = tonClient.open(wallet);


    // Criando constantes e logs para cada chave gerada
    const address = keyPair.publicKey.toString("base64url");
    console.log("Address:", address.toString());

    // const publicKeyBase64_2 = contract.publicKey;
    // console.log("Public Key Base64 ():", Address.parseFriendly(publicKeyBase64_2));

    // const publicKeyBase64_3 = contract.walletId.toString();
    // console.log("Wallet ID ():", publicKeyBase64_3);

    // const publicKeyBase64_4 = contract.publicKey.toString("base64url");
    // console.log("Public Key Base64 (Wallet + pass):", publicKeyBase64_4);
}

main().then(e => console.log(e)).catch(err => console.log(err))
