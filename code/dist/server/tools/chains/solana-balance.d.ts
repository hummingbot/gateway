/**
 * Solana Balance Tool
 * Gets token balances for a Solana wallet.
 */
import { z } from 'zod';
import { BaseTool } from '../base-tool';
import { McpServerConfig } from '../../mcp/config';
declare const parametersSchema: z.ZodObject<{
    network: z.ZodString;
    tokenSymbols: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    address: z.ZodString;
}, "strip", z.ZodTypeAny, {
    address?: string;
    network?: string;
    tokenSymbols?: string[];
}, {
    address?: string;
    network?: string;
    tokenSymbols?: string[];
}>;
interface BalanceResponse {
    network: string;
    timestamp: number;
    latency: number;
    balances: Array<{
        symbol: string;
        name: string;
        decimals: number;
        address: string;
        balance: string;
    }>;
}
export declare class SolanaBalanceTool extends BaseTool<z.infer<typeof parametersSchema>, BalanceResponse> {
    name: string;
    description: string;
    category: string;
    parameters: z.ZodObject<{
        network: z.ZodString;
        tokenSymbols: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        address: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        address?: string;
        network?: string;
        tokenSymbols?: string[];
    }, {
        address?: string;
        network?: string;
        tokenSymbols?: string[];
    }>;
    constructor(config: McpServerConfig);
    execute(params: z.infer<typeof parametersSchema>): Promise<BalanceResponse>;
}
export {};
