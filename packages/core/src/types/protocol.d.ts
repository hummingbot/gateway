export declare enum ProtocolType {
    DEX_AMM = "dex-amm",
    DEX_CLMM = "dex-clmm",
    DEX_ROUTER = "dex-router",
    DEX_ORDERBOOK = "dex-orderbook",
    PREDICTION_MARKET = "prediction-market",
    LENDING = "lending",
    TOKEN_LAUNCH = "token-launch",
    DERIVATIVES = "derivatives",
    STAKING = "staking",
    GOVERNANCE = "governance"
}
export declare enum ChainType {
    SOLANA = "solana",
    ETHEREUM = "ethereum",
    POLYGON = "polygon",
    ARBITRUM = "arbitrum",
    BASE = "base",
    OPTIMISM = "optimism",
    BSC = "bsc",
    AVALANCHE = "avalanche"
}
export interface Transaction {
    raw: any;
    description?: string;
    estimatedFee?: {
        amount: string;
        token: string;
    };
    simulation?: SimulationResult;
}
export interface SimulationResult {
    success: boolean;
    error?: string;
    changes?: {
        balanceChanges?: Array<{
            token: string;
            amount: string;
            direction: 'in' | 'out';
            note?: string;
        }>;
        positionChanges?: Array<{
            type: string;
            description: string;
        }>;
    };
    estimatedFee?: {
        amount: string;
        token: string;
    };
    metadata?: Record<string, any>;
}
export interface ValidationResult {
    valid: boolean;
    errors?: string[];
    warnings?: string[];
}
export interface Protocol<TConfig = any> {
    readonly name: string;
    readonly chain: ChainType;
    readonly network: string;
    readonly protocolType: ProtocolType;
    readonly version?: string;
    readonly operations: Record<string, OperationBuilder<any, any>>;
    readonly queries: Record<string, QueryFunction<any, any>>;
    initialize(config: TConfig): Promise<void>;
    healthCheck(): Promise<boolean>;
    getMetadata(): ProtocolMetadata;
}
export interface ProtocolMetadata {
    name: string;
    displayName: string;
    description: string;
    chain: ChainType;
    network: string;
    protocolType: ProtocolType;
    version?: string;
    website?: string;
    documentation?: string;
    supportedOperations: string[];
    availableQueries: string[];
}
export interface OperationBuilder<TParams, TResult = any> {
    validate(params: TParams): Promise<ValidationResult>;
    simulate(params: TParams): Promise<SimulationResult>;
    build(params: TParams): Promise<Transaction>;
    execute?(params: TParams): Promise<TResult>;
}
export type QueryFunction<TParams, TResult> = (params: TParams) => Promise<TResult>;
export interface ProtocolFactory {
    create(config: {
        protocol: string;
        chain: ChainType;
        network: string;
        options?: any;
    }): Promise<Protocol>;
    listProtocols(): Array<{
        name: string;
        chains: ChainType[];
        protocolType: ProtocolType;
    }>;
}
