import { TonClient, WalletContractV4 } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";
import { DEX } from "@ston-fi/sdk";
import { StonApiClient } from '@ston-fi/api';

const seedPhase = "ramp diet proof curve admit steak gospel jump twelve cigar clean inmate victory asthma change random left model conduct stay real any disease metal"

async function main() {
    try {
        // const ton = new TonClient({
        //     endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC",
        // });

        // const mnemonics = Array.from(
        //     { length: 24 },
        //     (_, i) => `${seedPhase} ${i + 1}`
        // );

        // const keyPair = await mnemonicToPrivateKey(mnemonics);

        // const workchain = 0;

        // const wallet = WalletContractV4.create({
        //     workchain,
        //     publicKey: keyPair.publicKey,
        // });

        // const stonfi = ton.open(new DEX.v1.Router());

        //await stonfi.getRouterData()).poolCode

        const client = new StonApiClient();

        const assets = await client.getAssets();

        

        const asset1 = {
            symbol: assets[0].symbol,
            assetId: assets[0].contractAddress,
            decimals: assets[0].decimals,
        }


        const usdt = assets.find(a=> a.symbol === 'USDT')

        if (!usdt) return

        const asset2 =  {
            symbol: usdt.symbol,
            assetId: usdt.contractAddress,
            decimals: usdt.decimals,
        }

        console.log(asset1.symbol, asset2.symbol)

        const swapSimulation = await client.simulateSwap({
            askAddress: asset1.assetId,
            offerAddress: asset2.assetId,
            offerUnits: "300",
            slippageTolerance: "0.001"
        });


        console.log(swapSimulation)

        return ""

    } catch (error: any) {
        console.log(error)
        return error
    }
}



main().then(e => console.log(e)).catch(err => console.log(err))
