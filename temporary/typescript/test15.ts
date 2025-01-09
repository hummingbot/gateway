import { TonClient } from '@ton/ton';
import { Address } from '@ton/core';
import { OperationType, StonApiClient } from '@ston-fi/api';

async function main() {
    try {
        // Cria o cliente

        const client = new StonApiClient();
        //Chama o método get
        const operations = await client.getWalletOperations({
            since: new Date('2025-01-07T08:00:00'),
            until: new Date('2025-01-08T23:00:00'),
            walletAddress: 'UQBSevYG7uExE6wJnWC2adG2SqcjUUqNlmfeTRMFhHT3kWfd',
            opType: 'Swap',
        });


        const operation1 = operations[0];

        console.log(operation1.operation.routerAddress)



        const statusOperation1 = await client.getSwapStatus({
            ownerAddress: 'EQBSevYG7uExE6wJnWC2adG2SqcjUUqNlmfeTRMFhHT3kToY',
            routerAddress: operation1.operation.routerAddress || 'EQCS4UEa5UaJLzOyyKieqQOQ2P9M-7kXpkO5HnP3Bv250cN3',
            queryId: "100000000076957",
        });

        console.log(":", statusOperation1);
        // console.log("Operations:", operations);

    } catch (error) {
        console.error('Error:', error.message);
    }
}

main();
