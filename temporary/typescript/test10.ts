// Import necessary modules
import {
  TonClient,
  WalletContractV3R2,
  internal,
  toNano,
  SendMode,
} from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { beginCell, Cell, storeMessage } from '@ton/core';

// Buffer polyfill for browser environments
require('buffer');

// Configuration variables
const MNEMONIC_PHRASE =
  'sort way burger decrease wild state welcome annual assume mix snack list scorpion improve anxiety fame soap crunch gain foil account knee top soul'; // Replace with your 24-word mnemonic phrase
const RECIPIENT_ADDRESS = 'UQBSevYG7uExE6wJnWC2adG2SqcjUUqNlmfeTRMFhHT3kWfd'; // Replace with the recipient's address
const AMOUNT_TON = '0.00000001'; // Sending 0.01 TON to minimize transaction cost
const UNIQUE_IDENTIFIER = 'unique-transaction-id'; // Replace with your unique identifier
// const TON_ENDPOINT = 'https://toncenter.com/api/v2/jsonRPC'; // TON API endpoint
const TON_ENDPOINT = 'https://testnet.toncenter.com/api/v2/jsonRPC'; // TON API endpoint
const API_KEY =
  '77b55ab3113b508818880560617ca4e99cff502ea0121be935ed0ffda1811519';

(async () => {
  try {
    // Initialize the TON client
    const client = new TonClient({
      endpoint: TON_ENDPOINT,
      apiKey: API_KEY,
    });

    // Convert mnemonic phrase to an array of words
    const mnemonicArray = MNEMONIC_PHRASE.trim().split(/\s+/);

    // Derive key pair from mnemonic
    const keyPair = await mnemonicToPrivateKey(mnemonicArray);

    // Define the workchain (usually 0)
    const workchain = 0;

    // Create a WalletContractV3R2 instance
    const wallet = WalletContractV3R2.create({
      workchain,
      publicKey: keyPair.publicKey,
    });

    // Open the wallet contract
    const contract = client.open(wallet);

    // Retrieve the current sequence number
    const seqno = await contract.getSeqno();

    // Create a message body with the unique identifier
    const messageBody = beginCell()
      .storeBuffer(Buffer.from(UNIQUE_IDENTIFIER, 'base64url'))
      .endCell();

    // Send the transfer
    // await contract.sendTransfer({
    //   seqno,
    //   secretKey: keyPair.secretKey,
    //   sendMode: SendMode.PAY_GAS_SEPARATELY, // Ensures the sender pays for the gas
    //   messages: [
    //     internal({
    //       value: toNano(AMOUNT_TON),
    //       to: RECIPIENT_ADDRESS,
    //       body: messageBody,
    //     }),
    //   ],
    // });
    // console.log(
    //   `Transaction of ${AMOUNT_TON} TON to ${RECIPIENT_ADDRESS} sent with identifier: ${UNIQUE_IDENTIFIER}.`,
    // );

    // Function to wait for transaction confirmation
    const waitForConfirmation = async () => {
      // eslint-disable-next-line
      while (true) {
        const contractState = await client.getContractState(wallet.address);
        const { lt: lt, hash: hash } = contractState.lastTransaction;

        // Fetch recent transactions for the wallet
        const transactions = await client.getTransactions(wallet.address, {
          limit: 1,
          lt: lt,
          hash: hash,
        });

        // Check if any transaction contains the unique identifier in its payload
        const matchingTransaction = transactions.find((tx) => {
          const payload = tx.inMessage?.body?.beginParse();
          if (payload) {
            // const receivedIdentifier = payload
            //   .loadBuffer(UNIQUE_IDENTIFIER.length)
            //   .toString('base64url');
            // const receivedIdentifier = Buffer.from(payload.loadBuffer(77)).toString('base64url');
            // const receivedIdentifier = beginCell().store(storeMessage(tx.inMessage)).endCell().hash().toString('base64url');
            // const receivedIdentifier = payload
            //   .loadRef()
            //   .beginParse()
            //   .loadBuffer(Buffer.from(UNIQUE_IDENTIFIER, 'base64url').length)
            //   .toString('base64url');
            // const receivedIdentifier = tx.inMessage?.body?.toString();
            // const receivedIdentifier = tx.inMessage?.body?.beginParse().loadBuffer(tx.inMessage.body.bits.length / 8).toString('base64url');
            // eslint-disable-next-line
            const receivedIdentifier = beginCell().store(storeMessage(tx.inMessage?.body?.beginParse().loadRef().beginParse().loadStringTail())).endCell();
            console.log('Received identifier:', receivedIdentifier);
            return receivedIdentifier === UNIQUE_IDENTIFIER;
          }
          return false;
        });

        if (matchingTransaction) {
          console.log('Transaction confirmed with matching identifier.');
          break;
        }

        console.log('Waiting for confirmation...');
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait for 5 seconds before retrying
      }
    };

    // Wait for the transaction to be confirmed
    await waitForConfirmation();
  } catch (error) {
    console.error('An error occurred:', error);
  }
})();
