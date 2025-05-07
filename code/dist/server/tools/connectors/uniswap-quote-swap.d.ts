/**
 * Uniswap Quote Swap Tool
 * Gets a quote for swapping tokens on Uniswap.
 */
import { z } from 'zod';
import { BaseTool } from '../base-tool';
import { McpServerConfig } from '../../mcp/config';
declare const parametersSchema: z.ZodObject<{
    chain: z.ZodString;
    network: z.ZodString;
    connector: z.ZodLiteral<"uniswap">;
    quote: z.ZodObject<{
        marketAddress: z.ZodOptional<z.ZodString>;
        baseToken: z.ZodObject<{
            address: z.ZodString;
            symbol: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            symbol?: string;
            address?: string;
        }, {
            symbol?: string;
            address?: string;
        }>;
        quoteToken: z.ZodObject<{
            address: z.ZodString;
            symbol: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            symbol?: string;
            address?: string;
        }, {
            symbol?: string;
            address?: string;
        }>;
        amount: z.ZodString;
        side: z.ZodEnum<["BUY", "SELL"]>;
        type: z.ZodOptional<z.ZodEnum<["EXACT_INPUT", "EXACT_OUTPUT"]>>;
    }, "strip", z.ZodTypeAny, {
        type?: "EXACT_INPUT" | "EXACT_OUTPUT";
        marketAddress?: string;
        baseToken?: {
            symbol?: string;
            address?: string;
        };
        quoteToken?: {
            symbol?: string;
            address?: string;
        };
        amount?: string;
        side?: "BUY" | "SELL";
    }, {
        type?: "EXACT_INPUT" | "EXACT_OUTPUT";
        marketAddress?: string;
        baseToken?: {
            symbol?: string;
            address?: string;
        };
        quoteToken?: {
            symbol?: string;
            address?: string;
        };
        amount?: string;
        side?: "BUY" | "SELL";
    }>;
}, "strip", z.ZodTypeAny, {
    chain?: string;
    network?: string;
    connector?: "uniswap";
    quote?: {
        type?: "EXACT_INPUT" | "EXACT_OUTPUT";
        marketAddress?: string;
        baseToken?: {
            symbol?: string;
            address?: string;
        };
        quoteToken?: {
            symbol?: string;
            address?: string;
        };
        amount?: string;
        side?: "BUY" | "SELL";
    };
}, {
    chain?: string;
    network?: string;
    connector?: "uniswap";
    quote?: {
        type?: "EXACT_INPUT" | "EXACT_OUTPUT";
        marketAddress?: string;
        baseToken?: {
            symbol?: string;
            address?: string;
        };
        quoteToken?: {
            symbol?: string;
            address?: string;
        };
        amount?: string;
        side?: "BUY" | "SELL";
    };
}>;
interface QuoteResponse {
    network: string;
    timestamp: number;
    latency: number;
    quote: {
        price: string;
        guaranteedPrice: string;
        estimatedPriceImpact: string;
        estimatedGas: string;
        gasPrice: string;
        gasCost: string;
        gasCostInUSD: string;
        routeParams: {
            route: string;
            routerAddress: string;
            expectedAmountOut: string;
            expectedAmountIn: string;
            slippage: string;
            path: string[];
        };
    };
}
export declare class UniswapQuoteSwapTool extends BaseTool<z.infer<typeof parametersSchema>, QuoteResponse> {
    name: string;
    description: string;
    category: string;
    parameters: z.ZodObject<{
        chain: z.ZodString;
        network: z.ZodString;
        connector: z.ZodLiteral<"uniswap">;
        quote: z.ZodObject<{
            marketAddress: z.ZodOptional<z.ZodString>;
            baseToken: z.ZodObject<{
                address: z.ZodString;
                symbol: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                symbol?: string;
                address?: string;
            }, {
                symbol?: string;
                address?: string;
            }>;
            quoteToken: z.ZodObject<{
                address: z.ZodString;
                symbol: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                symbol?: string;
                address?: string;
            }, {
                symbol?: string;
                address?: string;
            }>;
            amount: z.ZodString;
            side: z.ZodEnum<["BUY", "SELL"]>;
            type: z.ZodOptional<z.ZodEnum<["EXACT_INPUT", "EXACT_OUTPUT"]>>;
        }, "strip", z.ZodTypeAny, {
            type?: "EXACT_INPUT" | "EXACT_OUTPUT";
            marketAddress?: string;
            baseToken?: {
                symbol?: string;
                address?: string;
            };
            quoteToken?: {
                symbol?: string;
                address?: string;
            };
            amount?: string;
            side?: "BUY" | "SELL";
        }, {
            type?: "EXACT_INPUT" | "EXACT_OUTPUT";
            marketAddress?: string;
            baseToken?: {
                symbol?: string;
                address?: string;
            };
            quoteToken?: {
                symbol?: string;
                address?: string;
            };
            amount?: string;
            side?: "BUY" | "SELL";
        }>;
    }, "strip", z.ZodTypeAny, {
        chain?: string;
        network?: string;
        connector?: "uniswap";
        quote?: {
            type?: "EXACT_INPUT" | "EXACT_OUTPUT";
            marketAddress?: string;
            baseToken?: {
                symbol?: string;
                address?: string;
            };
            quoteToken?: {
                symbol?: string;
                address?: string;
            };
            amount?: string;
            side?: "BUY" | "SELL";
        };
    }, {
        chain?: string;
        network?: string;
        connector?: "uniswap";
        quote?: {
            type?: "EXACT_INPUT" | "EXACT_OUTPUT";
            marketAddress?: string;
            baseToken?: {
                symbol?: string;
                address?: string;
            };
            quoteToken?: {
                symbol?: string;
                address?: string;
            };
            amount?: string;
            side?: "BUY" | "SELL";
        };
    }>;
    constructor(config: McpServerConfig);
    execute(params: z.infer<typeof parametersSchema>): Promise<QuoteResponse>;
}
export {};
