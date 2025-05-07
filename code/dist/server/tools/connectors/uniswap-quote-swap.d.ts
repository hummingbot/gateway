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
            address: string;
            symbol?: string | undefined;
        }, {
            address: string;
            symbol?: string | undefined;
        }>;
        quoteToken: z.ZodObject<{
            address: z.ZodString;
            symbol: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            address: string;
            symbol?: string | undefined;
        }, {
            address: string;
            symbol?: string | undefined;
        }>;
        amount: z.ZodString;
        side: z.ZodEnum<["BUY", "SELL"]>;
        type: z.ZodOptional<z.ZodEnum<["EXACT_INPUT", "EXACT_OUTPUT"]>>;
    }, "strip", z.ZodTypeAny, {
        baseToken: {
            address: string;
            symbol?: string | undefined;
        };
        quoteToken: {
            address: string;
            symbol?: string | undefined;
        };
        amount: string;
        side: "BUY" | "SELL";
        type?: "EXACT_INPUT" | "EXACT_OUTPUT" | undefined;
        marketAddress?: string | undefined;
    }, {
        baseToken: {
            address: string;
            symbol?: string | undefined;
        };
        quoteToken: {
            address: string;
            symbol?: string | undefined;
        };
        amount: string;
        side: "BUY" | "SELL";
        type?: "EXACT_INPUT" | "EXACT_OUTPUT" | undefined;
        marketAddress?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    chain: string;
    network: string;
    connector: "uniswap";
    quote: {
        baseToken: {
            address: string;
            symbol?: string | undefined;
        };
        quoteToken: {
            address: string;
            symbol?: string | undefined;
        };
        amount: string;
        side: "BUY" | "SELL";
        type?: "EXACT_INPUT" | "EXACT_OUTPUT" | undefined;
        marketAddress?: string | undefined;
    };
}, {
    chain: string;
    network: string;
    connector: "uniswap";
    quote: {
        baseToken: {
            address: string;
            symbol?: string | undefined;
        };
        quoteToken: {
            address: string;
            symbol?: string | undefined;
        };
        amount: string;
        side: "BUY" | "SELL";
        type?: "EXACT_INPUT" | "EXACT_OUTPUT" | undefined;
        marketAddress?: string | undefined;
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
                address: string;
                symbol?: string | undefined;
            }, {
                address: string;
                symbol?: string | undefined;
            }>;
            quoteToken: z.ZodObject<{
                address: z.ZodString;
                symbol: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                address: string;
                symbol?: string | undefined;
            }, {
                address: string;
                symbol?: string | undefined;
            }>;
            amount: z.ZodString;
            side: z.ZodEnum<["BUY", "SELL"]>;
            type: z.ZodOptional<z.ZodEnum<["EXACT_INPUT", "EXACT_OUTPUT"]>>;
        }, "strip", z.ZodTypeAny, {
            baseToken: {
                address: string;
                symbol?: string | undefined;
            };
            quoteToken: {
                address: string;
                symbol?: string | undefined;
            };
            amount: string;
            side: "BUY" | "SELL";
            type?: "EXACT_INPUT" | "EXACT_OUTPUT" | undefined;
            marketAddress?: string | undefined;
        }, {
            baseToken: {
                address: string;
                symbol?: string | undefined;
            };
            quoteToken: {
                address: string;
                symbol?: string | undefined;
            };
            amount: string;
            side: "BUY" | "SELL";
            type?: "EXACT_INPUT" | "EXACT_OUTPUT" | undefined;
            marketAddress?: string | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        chain: string;
        network: string;
        connector: "uniswap";
        quote: {
            baseToken: {
                address: string;
                symbol?: string | undefined;
            };
            quoteToken: {
                address: string;
                symbol?: string | undefined;
            };
            amount: string;
            side: "BUY" | "SELL";
            type?: "EXACT_INPUT" | "EXACT_OUTPUT" | undefined;
            marketAddress?: string | undefined;
        };
    }, {
        chain: string;
        network: string;
        connector: "uniswap";
        quote: {
            baseToken: {
                address: string;
                symbol?: string | undefined;
            };
            quoteToken: {
                address: string;
                symbol?: string | undefined;
            };
            amount: string;
            side: "BUY" | "SELL";
            type?: "EXACT_INPUT" | "EXACT_OUTPUT" | undefined;
            marketAddress?: string | undefined;
        };
    }>;
    constructor(config: McpServerConfig);
    execute(params: z.infer<typeof parametersSchema>): Promise<QuoteResponse>;
}
export {};
