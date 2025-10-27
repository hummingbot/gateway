import { OperationBuilder, Transaction as SDKTransaction, ValidationResult, SimulationResult } from '../../../../../../core/src/types/protocol';
import { AddLiquidityParams, AddLiquidityResult } from '../../types/clmm';
export declare class AddLiquidityOperation implements OperationBuilder<AddLiquidityParams, AddLiquidityResult> {
    private raydium;
    private solana;
    constructor(raydium: any, solana: any);
    validate(params: AddLiquidityParams): Promise<ValidationResult>;
    simulate(params: AddLiquidityParams): Promise<SimulationResult>;
    build(params: AddLiquidityParams): Promise<SDKTransaction>;
    execute(params: AddLiquidityParams): Promise<AddLiquidityResult>;
}
