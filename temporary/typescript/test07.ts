import { TonClient } from '@ton/ton';
import { Address } from '@ton/core';

async function main() {
    try {
        // Cria o cliente
        const client = new TonClient({
            endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC',
        });

        // Chama o método get
        const result = await client.runMethod(
            Address.parse('0QAqjRhhmF6KFJF1HHFC-M_5hqWMlwFrSaFcQHXGw3Nusbb9'),
            'get_total'
        );

        console.log('Raw result:', result);


        if (!result || !result.stack) {
            throw new Error('Invalid result structure');
        }

        const total = result.stack.readNumber();
        console.log('Total:', total);
    } catch (error) {
        console.error('Error:', error.message);
    }
}

main();
