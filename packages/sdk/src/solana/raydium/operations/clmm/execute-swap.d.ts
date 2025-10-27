import { OperationBuilder, Transaction as SDKTransaction, ValidationResult, SimulationResult } from '../../../../../../core/src/types/protocol';
import { ExecuteSwapParams, ExecuteSwapResult } from '../../types/clmm';
export declare class ExecuteSwapOperation implements OperationBuilder<ExecuteSwapParams, ExecuteSwapResult> {
    private raydium;
    private solana;
    constructor(raydium: any, solana: any);
    validate(params: ExecuteSwapParams): Promise<ValidationResult>;
    simulate(params: ExecuteSwapParams): Promise<SimulationResult>;
    build(_params: ExecuteSwapParams): Promise<SDKTransaction>;
    execute(_params: ExecuteSwapParams): Promise<ExecuteSwapResult>;
}
