import { OperationBuilder, Transaction as SDKTransaction, ValidationResult, SimulationResult } from '../../../../../../core/src/types/protocol';
import { ClosePositionParams, ClosePositionResult } from '../../types';
export declare class ClosePositionOperation implements OperationBuilder<ClosePositionParams, ClosePositionResult> {
    private meteora;
    private solana;
    private removeLiquidityOp;
    private collectFeesOp;
    constructor(meteora: any, solana: any);
    validate(params: ClosePositionParams): Promise<ValidationResult>;
    simulate(params: ClosePositionParams): Promise<SimulationResult>;
    build(params: ClosePositionParams): Promise<SDKTransaction>;
    execute(params: ClosePositionParams): Promise<ClosePositionResult>;
}
