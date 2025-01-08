import { TonClient } from '@ton/ton';
import { Address } from '@ton/core';
import { OperationType, StonApiClient } from '@ston-fi/api';

async function main() {
    try {
        // Cria o cliente

        const client = new StonApiClient();
        // Chama o método get
        const operations = await client.getWalletOperations({
            since: new Date('2025-01-07T08:00:00'),
            until: new Date('2025-01-08T23:00:00'),
            walletAddress: 'UQBSevYG7uExE6wJnWC2adG2SqcjUUqNlmfeTRMFhHT3kWfd',
            opType: 'Swap',
        });
        const operation1 = operations[0];

        // console.log(operations)



        const statusOperation1 = await client.getSwapStatus({
            ownerAddress: operation1.operation.walletAddress,
            routerAddress: operation1.operation.routerAddress,
            queryId: "100000000561710",
        });

        console.log(":", statusOperation1);
        // console.log("Operations:", operations);

    } catch (error) {
        console.error('Error:', error.message);
    }
}

main();
