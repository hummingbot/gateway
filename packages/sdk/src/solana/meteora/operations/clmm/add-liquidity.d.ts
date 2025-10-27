import { OperationBuilder, Transaction as SDKTransaction, ValidationResult, SimulationResult } from '../../../../../../core/src/types/protocol';
import { AddLiquidityParams, AddLiquidityResult } from '../../types';
export declare class AddLiquidityOperation implements OperationBuilder<AddLiquidityParams, AddLiquidityResult> {
    private meteora;
    private solana;
    private config;
    constructor(meteora: any, solana: any, config: any);
    validate(params: AddLiquidityParams): Promise<ValidationResult>;
    simulate(params: AddLiquidityParams): Promise<SimulationResult>;
    build(params: AddLiquidityParams): Promise<SDKTransaction>;
    execute(params: AddLiquidityParams): Promise<AddLiquidityResult>;
}
