import { OperationBuilder, Transaction as SDKTransaction, ValidationResult, SimulationResult } from '../../../../../../core/src/types/protocol';
import { ClosePositionParams, ClosePositionResult } from '../../types/clmm';
export declare class ClosePositionOperation implements OperationBuilder<ClosePositionParams, ClosePositionResult> {
    private raydium;
    private solana;
    constructor(raydium: any, solana: any);
    validate(params: ClosePositionParams): Promise<ValidationResult>;
    simulate(params: ClosePositionParams): Promise<SimulationResult>;
    build(params: ClosePositionParams): Promise<SDKTransaction>;
    execute(params: ClosePositionParams): Promise<ClosePositionResult>;
    private executeWithLiquidity;
    private executeEmptyPosition;
}
