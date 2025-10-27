import { OperationBuilder, Transaction as SDKTransaction, ValidationResult, SimulationResult } from '../../../../../../core/src/types/protocol';
import { RemoveLiquidityParams, RemoveLiquidityResult } from '../../types';
export declare class RemoveLiquidityOperation implements OperationBuilder<RemoveLiquidityParams, RemoveLiquidityResult> {
    private meteora;
    private solana;
    constructor(meteora: any, solana: any);
    validate(params: RemoveLiquidityParams): Promise<ValidationResult>;
    simulate(params: RemoveLiquidityParams): Promise<SimulationResult>;
    build(params: RemoveLiquidityParams): Promise<SDKTransaction>;
    execute(params: RemoveLiquidityParams): Promise<RemoveLiquidityResult>;
}
