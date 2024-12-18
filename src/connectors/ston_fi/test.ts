import { StonApiClient } from "@ston-fi/api";
import { mnemonicToPrivateKey } from "@ton/crypto";
import TonWeb, { AddressType } from "tonweb";
import { WalletV3ContractR1 } from "tonweb/dist/types/contract/wallet/v3/wallet-v3-contract-r1";

import { TonClient, toNano } from "@ton/ton";
import { DEX, pTON } from "@ston-fi/sdk";



//RUN TESTS: npx tsx src/connectors/ston_fi/test.ts

const testnetSeedPhase = "ramp diet proof curve admit steak gospel jump twelve cigar clean inmate victory asthma change random left model conduct stay real any disease metal"

//const tonweb = new TonWeb(new TonWeb.HttpProvider('https://testnet.toncenter.com/api/v2/jsonRPC'));
const tonweb = new TonWeb(new TonWeb.HttpProvider('https://toncenter.com/api/v2/jsonRPC'));
const stonfi = new StonApiClient()
const address = 'EQBibkPM-RnqV4OKguNTStuN4MFpR0a91OPmitogqC6SKIqt';
let publicKey: string


async function main() {
    try {
        const mnemonics = Array.from(
            { length: 24 },
            (_, i) => `${testnetSeedPhase} ${i + 1}`
        );
        const keys = await mnemonicToPrivateKey(mnemonics);
        publicKey = keys.publicKey.toString("utf8");

        //call Ton Methods
        //await tonMethods();


        //call Ston.fi Methods
        await stonfiMethods();

        return ""
    } catch (error: any) {
        console.log(error)
        return error
    }
}

const tonMethods = async () => {
    // const wallet = tonweb.wallet.create({ address });
    // const balance = await tonweb.getBalance(address);
    // const transactions = await tonweb.getTransactions(address, 1);
    // const block = await tonweb.provider.getMasterchainInfo()
}



const stonfiMethods = async () => {
  const res = stonfi.simulateSwap()
}



main().then(e => console.log(e)).catch(err => console.log(err))
