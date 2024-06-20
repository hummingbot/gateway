export interface NodeInfoResponse {
  fullHeight: number;
}

export interface NodeChainSliceResponse {
  extensionId: string,
  difficulty: string,
  votes: string,
  timestamp: number,
  size: number,
  stateRoot: string,
  height: number,
  nBits: number,
  version: number,
  id: string,
  adProofsRoot: string,
  transactionsRoot: string,
  extensionHash: string,
  powSolutions: {
    "pk": string,
    "w": string,
    "n": string,
    "d": number
  },
  adProofsId: string,
  transactionsId: string,
  parentId: string
}
