import { OperationBuilder, Transaction as SDKTransaction, ValidationResult, SimulationResult } from '../../../../../../core/src/types/protocol';
import { CollectFeesParams, CollectFeesResult } from '../../types';
export declare class CollectFeesOperation implements OperationBuilder<CollectFeesParams, CollectFeesResult> {
    private meteora;
    private solana;
    constructor(meteora: any, solana: any);
    validate(params: CollectFeesParams): Promise<ValidationResult>;
    simulate(params: CollectFeesParams): Promise<SimulationResult>;
    build(params: CollectFeesParams): Promise<SDKTransaction>;
    execute(params: CollectFeesParams): Promise<CollectFeesResult>;
}
