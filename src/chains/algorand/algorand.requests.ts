export interface PollRequest {
  network: string;
  txHash: string;
}

export type PollResponse = {
  currentBlock: number;
  txBlock: number | null;
  txHash: string;
  fee: string;
};
