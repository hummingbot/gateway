import { OperationBuilder, Transaction as SDKTransaction, ValidationResult, SimulationResult } from '../../../../../../core/src/types/protocol';
import { OpenPositionParams, OpenPositionResult } from '../../types/clmm';
export declare class OpenPositionOperation implements OperationBuilder<OpenPositionParams, OpenPositionResult> {
    private raydium;
    private solana;
    constructor(raydium: any, solana: any);
    validate(params: OpenPositionParams): Promise<ValidationResult>;
    simulate(params: OpenPositionParams): Promise<SimulationResult>;
    build(params: OpenPositionParams): Promise<SDKTransaction>;
    execute(params: OpenPositionParams): Promise<OpenPositionResult>;
    private resolvePoolAddress;
}
