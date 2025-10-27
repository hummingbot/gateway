import { OperationBuilder, Transaction as SDKTransaction, ValidationResult, SimulationResult } from '../../../../../../core/src/types/protocol';
import { CollectFeesParams, CollectFeesResult } from '../../types/clmm';
export declare class CollectFeesOperation implements OperationBuilder<CollectFeesParams, CollectFeesResult> {
    private raydium;
    private solana;
    constructor(raydium: any, solana: any);
    validate(params: CollectFeesParams): Promise<ValidationResult>;
    simulate(_params: CollectFeesParams): Promise<SimulationResult>;
    build(params: CollectFeesParams): Promise<SDKTransaction>;
    execute(params: CollectFeesParams): Promise<CollectFeesResult>;
}
