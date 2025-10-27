import { OperationBuilder, Transaction as SDKTransaction, ValidationResult, SimulationResult } from '../../../../../../core/src/types/protocol';
import { RemoveLiquidityParams, RemoveLiquidityResult } from '../../types/clmm';
export declare class RemoveLiquidityOperation implements OperationBuilder<RemoveLiquidityParams, RemoveLiquidityResult> {
    private raydium;
    private solana;
    constructor(raydium: any, solana: any);
    validate(params: RemoveLiquidityParams): Promise<ValidationResult>;
    simulate(params: RemoveLiquidityParams): Promise<SimulationResult>;
    build(params: RemoveLiquidityParams): Promise<SDKTransaction>;
    execute(params: RemoveLiquidityParams): Promise<RemoveLiquidityResult>;
}
