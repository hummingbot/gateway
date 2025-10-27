import { QuoteSwapParams, QuoteSwapResult } from '../../types/amm';
export declare function getRawSwapQuote(raydium: any, solana: any, network: string, poolId: string, baseToken: string, quoteToken: string, amount: number, side: 'BUY' | 'SELL', slippagePct?: number): Promise<any>;
export declare function quoteSwap(raydium: any, solana: any, params: QuoteSwapParams): Promise<QuoteSwapResult>;
