import { mnemonicToPrivateKey } from "@ton/crypto";
import { TonClient, WalletContractV3R2 } from "@ton/ton";

const mnemonic = "mammal entry lyrics addict swear sight artefact clog survey oil empower trip skill hospital similar piano slush bright gas depend warm whale marine merit".split(" ")

async function main() {
    const tonClient = new TonClient({ endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC" }); // testnet
    // const tonClient = new TonClient({ endpoint: "https://toncenter.com/api/v2/jsonRPC" });
    console.log(mnemonic)
    let keyPair = await mnemonicToPrivateKey(mnemonic);
    let workchain = 0;
    const wallet = WalletContractV3R2.create({ workchain, publicKey: keyPair.publicKey, });
    const contract = tonClient.open(wallet);

    const address = contract.address.toStringBuffer({ bounceable: false, testOnly: true })
    console.log("Result:", address.toString("base64url"));
    // console.log("KeyPair:", keyPair.publicKey.toString("base64url"));

}

main().then(e => console.log(e)).catch(err => console.log(err))
