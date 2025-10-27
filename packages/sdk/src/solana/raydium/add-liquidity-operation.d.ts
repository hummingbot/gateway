import { OperationBuilder, Transaction as SDKTransaction, ValidationResult, SimulationResult } from '../../../../core/src/types/protocol';
export interface AddLiquidityParams {
    poolAddress: string;
    walletAddress: string;
    baseTokenAmount: number;
    quoteTokenAmount: number;
    slippagePct?: number;
}
export interface AddLiquidityResult {
    signature: string;
    status: number;
    data?: {
        fee: number;
        baseTokenAmountAdded: number;
        quoteTokenAmountAdded: number;
    };
}
export declare class AddLiquidityOperation implements OperationBuilder<AddLiquidityParams, AddLiquidityResult> {
    private raydium;
    private solana;
    constructor(raydium: any, solana: any);
    validate(params: AddLiquidityParams): Promise<ValidationResult>;
    simulate(params: AddLiquidityParams): Promise<SimulationResult>;
    build(params: AddLiquidityParams): Promise<SDKTransaction>;
    execute(params: AddLiquidityParams): Promise<AddLiquidityResult>;
    private createTransaction;
    private getQuote;
}
