import { OperationBuilder, Transaction as SDKTransaction, ValidationResult, SimulationResult } from '../../../../../../core/src/types/protocol';
import { ExecuteSwapParams, ExecuteSwapResult } from '../../types';
export declare class ExecuteSwapOperation implements OperationBuilder<ExecuteSwapParams, ExecuteSwapResult> {
    private meteora;
    private solana;
    constructor(meteora: any, solana: any);
    validate(params: ExecuteSwapParams): Promise<ValidationResult>;
    simulate(params: ExecuteSwapParams): Promise<SimulationResult>;
    build(params: ExecuteSwapParams): Promise<SDKTransaction>;
    execute(params: ExecuteSwapParams): Promise<ExecuteSwapResult>;
}
