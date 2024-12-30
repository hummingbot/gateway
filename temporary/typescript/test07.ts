import { TonClient } from '@ton/ton';
import { Address } from '@ton/core';
import { StonApiClient } from '@ston-fi/api';

async function main() {
    try {
        // Cria o cliente

        const client = new StonApiClient();
        // Chama o método get
        const assetBalances = await client.getWalletAssets("0QAqjRhhmF6KFJF1HHFC-M_5hqWMlwFrSaFcQHXGw3Nusbb9")
        // const assets = await (await client.getAssets()).find(v => )
        console.log("AssetList:", assetBalances.filter(v => v.balance !== undefined));
    } catch (error) {
        console.error('Error:', error.message);
    }
}

main();
