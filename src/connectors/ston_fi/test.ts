import { TonClient, WalletContractV4 } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";

const seedPhase = "ramp diet proof curve admit steak gospel jump twelve cigar clean inmate victory asthma change random left model conduct stay real any disease metal"

async function main() {
    try {
        const ton = new TonClient({
            endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC",
        });

        const mnemonics = Array.from(
            { length: 24 },
            (_, i) => `${seedPhase} ${i + 1}`
        );

        const keyPair = await mnemonicToPrivateKey(mnemonics);

        const workchain = 0;

        const wallet = WalletContractV4.create({
            workchain,
            publicKey: keyPair.publicKey,
        });


        wallet.getBalance()

        const stonfi = ton.open(new DEX.v1.Router());

        await stonfi.getRouterData()



        return ""

    } catch (error: any) {
        console.log(error)
        return error
    }
}



main().then(e => console.log(e)).catch(err => console.log(err))
