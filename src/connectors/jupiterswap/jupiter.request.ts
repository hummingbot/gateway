export interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: any;
  priceImpactPct: string;
  routePlan: RoutePlan[];
  contextSlot: number;
  timeTaken: number;
}

export interface RoutePlan {
  swapInfo: SwapInfo;
  percent: number;
}

export interface SwapInfo {
  ammKey: string;
  label: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  feeAmount: string;
  feeMint: string;
}

export interface JupiterPriceResponse {
  data: Data;
  timeTaken: number;
}

export interface Data {
  [key: string]: Price;
}

export interface Price {
  id: string;
  type: string;
  price: string;
}

export interface SwapTransactionBuilderResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
  computeUnitLimit: number;
  prioritizationType: PrioritizationType;
  dynamicSlippageReport: any;
  simulationError: any;
}

export interface PrioritizationType {
  computeBudget: ComputeBudget;
}

export interface ComputeBudget {
  microLamports: number;
  estimatedMicroLamports: number;
}
