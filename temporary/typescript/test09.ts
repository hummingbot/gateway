import { Address, beginCell, storeMessage, TonClient } from '@ton/ton';

const walletAddress = 'UQBSevYG7uExE6wJnWC2adG2SqcjUUqNlmfeTRMFhHT3kWfd';

const tonClient = new TonClient({
  endpoint: 'https://toncenter.com/api/v2/jsonRPC',
});

export async function getLatestTransactionHash(
  walletAddress: string,
): Promise<any> {
  const walletAddressAddress = Address.parse(walletAddress);
  const state = await tonClient.getContractState(walletAddressAddress);
  const { lt: lastLt, hash: lastHash } = state.lastTransaction;
  // const lastTx = await tonClient.getTransaction(
  //   walletAddressAddress,
  //   lastLt,
  //   lastHash,
  // );
  console.log(lastHash);
  const lastTx = await tonClient.getTransaction(
    walletAddressAddress,
    lastLt,
    // 'e3e600ed8f8af27de7294e1fbd471a09f569183875c9ffa35d6bd4556db824df'
    '4+YA7Y+K8n3nKU4fvUcaCfVpGDh1yf+jXWvUVW24JN8=',
  );

  console.log('lastTx', lastTx);

  if (lastTx && lastTx.inMessage) {
    const msgCell = beginCell().store(storeMessage(lastTx.inMessage)).endCell();
    const inMsgHash = msgCell.hash().toString('hex');
    console.log('InMsgHash', inMsgHash);
  }

  return lastTx;

  // // Fetch only 1 transaction (the most recent)
  // const transactions = await tonClient.getTransactions(address(walletAddress), {
  //   limit: 1,
  // });
  // if (!transactions || transactions.length === 0) {
  //   return null;
  // }
  //
  // // Assume the first item is the latest transaction
  // return transactions[0];
}

async function main() {
  const transcation = await getLatestTransactionHash(walletAddress);

  console.log(transcation);
}

main().catch((error) => {
  console.log(error);
});
