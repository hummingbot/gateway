import { Address, beginCell, storeMessage, TonClient } from '@ton/ton';

const walletAddress = 'UQBSevYG7uExE6wJnWC2adG2SqcjUUqNlmfeTRMFhHT3kWfd';

const tonClient = new TonClient({
  endpoint: 'https://toncenter.com/api/v2/jsonRPC',
});

export async function getLatestTransactionHash(
  walletAddress: string,
): Promise<string> {
  const parsedWalletAddress = Address.parse(walletAddress);
  const contractState = await tonClient.getContractState(parsedWalletAddress);
  const { lt: lastLocationTime, hash: lastHash } =
    contractState.lastTransaction;

  const lastTransaction = await tonClient.getTransaction(
    parsedWalletAddress,
    lastLocationTime,
    lastHash,
  );

  if (!lastTransaction || !lastTransaction.inMessage) {
    return null;
  }

  const msgCell = beginCell()
    .store(storeMessage(lastTransaction.inMessage))
    .endCell();

  // noinspection UnnecessaryLocalVariableJS
  const transactionHash = msgCell.hash().toString('base64url');

  return transactionHash;
}

async function main() {
  const transcation = await getLatestTransactionHash(walletAddress);

  console.log(transcation);
}

main().catch((error) => {
  console.log(error);
});
