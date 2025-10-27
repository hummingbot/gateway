import { QuoteSwapParams, QuoteSwapResult } from '../../types';
export declare function getRawSwapQuote(meteora: any, _solana: any, poolAddress: string, inputToken: any, outputToken: any, amount: number, side: 'BUY' | 'SELL', slippagePct: number): Promise<{
    inputToken: any;
    outputToken: any;
    swapAmount: import("bn.js");
    swapForY: boolean;
    quote: any;
    dlmmPool: any;
}>;
export declare function getSwapQuote(meteora: any, solana: any, params: QuoteSwapParams): Promise<QuoteSwapResult>;
