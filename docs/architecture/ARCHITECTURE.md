# Protocol SDK Architecture

**Version**: 1.0
**Last Updated**: 2025-01-23
**Status**: Design Complete, Implementation Pending

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Design Principles](#design-principles)
3. [Core Abstractions](#core-abstractions)
4. [Protocol Types](#protocol-types)
5. [Architecture Patterns](#architecture-patterns)
6. [Implementation Guide](#implementation-guide)
7. [Extension Points](#extension-points)
8. [Examples](#examples)

---

## Executive Summary

The Protocol SDK is a **protocol-agnostic** DeFi SDK that provides a unified interface for interacting with diverse blockchain protocols across multiple chains. The architecture is designed to work seamlessly with:

- **DEX Protocols**: AMM, CLMM, Router, Orderbook
- **Prediction Markets**: Polymarket, Augur
- **Lending Protocols**: Aave, Compound, Solend
- **Token Launch Platforms**: Pump.fun
- **And more**: Derivatives, Staking, Governance

### Key Innovation

Instead of creating separate APIs for each protocol type, we define a **universal `Protocol` interface** that works across all protocol categories. This is achieved through:

1. **Operation Builder Pattern**: All mutable actions (swap, addLiquidity, buyOutcome, supply) follow the same pattern
2. **Query Functions**: All read-only data fetching uses consistent interfaces
3. **Protocol-Specific Extensions**: Type-safe extensions for each protocol category

### Dual Mode Operation

```typescript
// Mode 1: Direct SDK Usage (Programmatic)
import { ProtocolSDK } from '@nfttools/protocol-sdk';
const sdk = new ProtocolSDK({ solana: { network: 'mainnet' } });
const tx = await sdk.solana.raydium.operations.addLiquidity.build(params);

// Mode 2: REST API (HTTP)
POST /connectors/raydium/amm/addLiquidity
{ "poolAddress": "...", "baseAmount": 100, "quoteAmount": 200 }

// Both use the same underlying SDK business logic!
```

---

## Design Principles

### 1. Protocol Agnostic

The SDK should work with **any protocol type** without architectural changes.

**Bad Example** (DEX-specific):
```typescript
// This doesn't work for prediction markets!
interface DEXProtocol {
  addLiquidity(): Transaction;
  swap(): Transaction;
}
```

**Good Example** (Protocol-agnostic):
```typescript
// This works for everything!
interface Protocol {
  operations: Record<string, OperationBuilder>;
  queries: Record<string, QueryFunction>;
}
```

### 2. Consistent Patterns

All operations, regardless of protocol type, follow the same pattern:

```typescript
// DEX operation
await sdk.solana.raydium.operations.addLiquidity.build(params);

// Prediction market operation
await sdk.ethereum.polymarket.operations.buyOutcome.build(params);

// Lending operation
await sdk.ethereum.aave.operations.supply.build(params);

// Same pattern everywhere!
```

### 3. Type Safety

TypeScript types provide compile-time safety for all operations:

```typescript
// Type error caught at compile time
sdk.solana.raydium.operations.addLiquidity.build({
  poolAddress: "...",
  baseAmount: 100,
  // Missing required field: quoteAmount
}); // ❌ TypeScript error

// Correct usage
sdk.solana.raydium.operations.addLiquidity.build({
  poolAddress: "...",
  baseAmount: 100,
  quoteAmount: 200,
}); // ✅ Compiles successfully
```

### 4. Progressive Enhancement

Start simple, add complexity as needed:

```typescript
// Minimal: Just build the transaction
const tx = await operation.build(params);

// With validation
const validation = await operation.validate(params);
if (validation.valid) {
  const tx = await operation.build(params);
}

// With simulation
const simulation = await operation.simulate(params);
console.log('Expected changes:', simulation.changes);
const tx = await operation.build(params);

// With execution (optional)
const result = await operation.execute(params);
```

### 5. Chain Abstraction

Abstract away chain-specific details where possible:

```typescript
// Same interface, different chains
const solanaTx = await sdk.solana.raydium.operations.swap.build(params);
const ethereumTx = await sdk.ethereum.uniswap.operations.swap.build(params);

// Both return Transaction interface
```

---

## Core Abstractions

### Protocol Interface

The foundation of the SDK. Every protocol implements this interface:

```typescript
interface Protocol<TConfig = any> {
  /** Protocol identifier */
  readonly name: string;

  /** Chain (solana, ethereum, polygon, etc.) */
  readonly chain: ChainType;

  /** Network (mainnet, devnet, testnet) */
  readonly network: string;

  /** Protocol type (DEX_AMM, PREDICTION_MARKET, LENDING, etc.) */
  readonly protocolType: ProtocolType;

  /** Mutable operations (build transactions) */
  readonly operations: Record<string, OperationBuilder>;

  /** Read-only queries (fetch data) */
  readonly queries: Record<string, QueryFunction>;

  /** Initialize with configuration */
  initialize(config: TConfig): Promise<void>;

  /** Health check */
  healthCheck(): Promise<boolean>;

  /** Get metadata */
  getMetadata(): ProtocolMetadata;
}
```

**Key Points:**
- ✅ Protocol-agnostic: No DEX-specific concepts
- ✅ Flexible: `operations` and `queries` are open-ended
- ✅ Typed: Can be extended with protocol-specific interfaces
- ✅ Consistent: Same pattern for all protocols

### OperationBuilder Interface

All mutable operations follow this pattern:

```typescript
interface OperationBuilder<TParams, TResult = any> {
  /**
   * Validate parameters before building
   * Returns validation errors if any
   */
  validate(params: TParams): Promise<ValidationResult>;

  /**
   * Simulate transaction execution
   * Returns expected outcome without submitting
   */
  simulate(params: TParams): Promise<SimulationResult>;

  /**
   * Build unsigned transaction
   * Core method - creates the transaction object
   */
  build(params: TParams): Promise<Transaction>;

  /**
   * Execute transaction (optional)
   * Some implementations provide this, others don't
   */
  execute?(params: TParams): Promise<TResult>;
}
```

**Lifecycle:**

```
User Params
    ↓
[validate] ← Check parameters are valid
    ↓
[simulate] ← Preview expected outcome (optional)
    ↓
[build]    ← Create unsigned transaction
    ↓
[execute]  ← Submit to blockchain (optional)
    ↓
Result
```

**Example Usage:**

```typescript
// Step 1: Validate
const validation = await operation.validate(params);
if (!validation.valid) {
  console.error('Invalid params:', validation.errors);
  return;
}

// Step 2: Simulate (optional)
const simulation = await operation.simulate(params);
console.log('Expected fee:', simulation.estimatedFee);
console.log('Balance changes:', simulation.changes);

// Step 3: Build transaction
const tx = await operation.build(params);

// Step 4: Sign and submit (user's responsibility)
const signed = await wallet.signTransaction(tx.raw);
const signature = await connection.sendTransaction(signed);
```

### Transaction Interface

Chain-agnostic transaction representation:

```typescript
interface Transaction {
  /** Chain-specific transaction object */
  raw: any;

  /** Human-readable description */
  description?: string;

  /** Estimated gas/fees */
  estimatedFee?: {
    amount: string;
    token: string;
  };

  /** Simulation result if available */
  simulation?: SimulationResult;
}
```

**Implementation Examples:**

```typescript
// Solana transaction
{
  raw: solanaTransaction, // Solana Transaction object
  description: "Add liquidity to SOL-USDC pool",
  estimatedFee: { amount: "0.001", token: "SOL" }
}

// Ethereum transaction
{
  raw: {
    to: "0x...",
    data: "0x...",
    value: "0",
    gasLimit: "300000"
  },
  description: "Buy YES outcome shares",
  estimatedFee: { amount: "0.05", token: "ETH" }
}
```

### Query Functions

Simple async functions for read-only data:

```typescript
type QueryFunction<TParams, TResult> = (params: TParams) => Promise<TResult>;
```

**Examples:**

```typescript
// DEX query
const pool = await sdk.solana.raydium.queries.getPool({ address: "..." });

// Prediction market query
const odds = await sdk.ethereum.polymarket.queries.getOdds({ marketId: "..." });

// Lending query
const health = await sdk.ethereum.aave.queries.getHealthFactor({ user: "..." });
```

---

## Protocol Types

### Enum Definition

```typescript
enum ProtocolType {
  // DEX protocols
  DEX_AMM = 'dex-amm',              // Uniswap V2, Raydium AMM
  DEX_CLMM = 'dex-clmm',            // Uniswap V3, Raydium CLMM, Meteora
  DEX_ROUTER = 'dex-router',        // Jupiter, 0x, Uniswap SOR
  DEX_ORDERBOOK = 'dex-orderbook',  // Serum, dYdX

  // Other protocol types
  PREDICTION_MARKET = 'prediction-market',  // Polymarket, Augur
  LENDING = 'lending',                      // Aave, Compound, Solend
  TOKEN_LAUNCH = 'token-launch',            // Pump.fun
  DERIVATIVES = 'derivatives',              // Hyperliquid
  STAKING = 'staking',                      // Staking protocols
  GOVERNANCE = 'governance',                // DAO governance
}
```

### Protocol-Specific Extensions

Each protocol type can extend the base `Protocol` interface with type-safe operations:

**DEX AMM Protocol:**
```typescript
interface DEXAMMProtocol extends Protocol {
  readonly operations: {
    addLiquidity: OperationBuilder<AddLiquidityParams>;
    removeLiquidity: OperationBuilder<RemoveLiquidityParams>;
    swap: OperationBuilder<SwapParams>;
    createPool: OperationBuilder<CreatePoolParams>;
  };

  readonly queries: {
    getPool: QueryFunction<{ address: string }, PoolInfo>;
    getPosition: QueryFunction<{ address: string }, PositionInfo>;
    getPrice: QueryFunction<{ base: string; quote: string }, number>;
  };
}
```

**Prediction Market Protocol:**
```typescript
interface PredictionMarketProtocol extends Protocol {
  readonly operations: {
    createMarket: OperationBuilder<CreateMarketParams>;
    buyOutcome: OperationBuilder<BuyOutcomeParams>;
    sellOutcome: OperationBuilder<SellOutcomeParams>;
    claimWinnings: OperationBuilder<ClaimWinningsParams>;
  };

  readonly queries: {
    getMarket: QueryFunction<{ marketId: string }, MarketInfo>;
    getOdds: QueryFunction<{ marketId: string }, Record<string, number>>;
    getPosition: QueryFunction<{ user: string; marketId: string }, Position>;
  };
}
```

**Lending Protocol:**
```typescript
interface LendingProtocol extends Protocol {
  readonly operations: {
    supply: OperationBuilder<SupplyParams>;
    withdraw: OperationBuilder<WithdrawParams>;
    borrow: OperationBuilder<BorrowParams>;
    repay: OperationBuilder<RepayParams>;
    liquidate: OperationBuilder<LiquidateParams>;
  };

  readonly queries: {
    getUserPosition: QueryFunction<{ address: string }, LendingPosition>;
    getHealthFactor: QueryFunction<{ address: string }, number>;
    getAPY: QueryFunction<{ asset: string }, APYInfo>;
  };
}
```

---

## Architecture Patterns

### 1. Connector Pattern

Each protocol has a "connector" class that implements the `Protocol` interface:

```typescript
// Raydium connector
export class RaydiumConnector implements DEXAMMProtocol {
  readonly name = 'raydium';
  readonly chain = ChainType.SOLANA;
  readonly protocolType = ProtocolType.DEX_AMM;

  readonly operations = {
    addLiquidity: new AddLiquidityOperation(this),
    removeLiquidity: new RemoveLiquidityOperation(this),
    swap: new SwapOperation(this),
    createPool: new CreatePoolOperation(this),
  };

  readonly queries = {
    getPool: async (params) => { /* ... */ },
    getPosition: async (params) => { /* ... */ },
    getPrice: async (params) => { /* ... */ },
  };

  async initialize(config: RaydiumConfig): Promise<void> {
    // Initialize SDK, load pools, etc.
  }

  async healthCheck(): Promise<boolean> {
    // Check RPC connectivity, SDK status
    return true;
  }
}
```

### 2. Operation Class Pattern

Each operation is a class implementing `OperationBuilder`:

```typescript
export class AddLiquidityOperation
  implements OperationBuilder<AddLiquidityParams, AddLiquidityResult>
{
  constructor(private connector: RaydiumConnector) {}

  async validate(params: AddLiquidityParams): Promise<ValidationResult> {
    const errors: string[] = [];

    if (params.baseAmount <= 0) {
      errors.push('Base amount must be positive');
    }

    if (params.quoteAmount <= 0) {
      errors.push('Quote amount must be positive');
    }

    // Check pool exists
    const pool = await this.connector.queries.getPool({
      address: params.poolAddress
    });
    if (!pool) {
      errors.push('Pool not found');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async simulate(params: AddLiquidityParams): Promise<SimulationResult> {
    // Call Raydium SDK simulation
    const result = await this.connector.sdk.simulateAddLiquidity(params);

    return {
      success: true,
      changes: {
        balanceChanges: [
          { token: 'SOL', amount: params.baseAmount.toString(), direction: 'out' },
          { token: 'USDC', amount: params.quoteAmount.toString(), direction: 'out' },
          { token: 'LP_TOKEN', amount: result.lpTokens.toString(), direction: 'in' },
        ],
      },
      estimatedFee: {
        amount: '0.001',
        token: 'SOL',
      },
    };
  }

  async build(params: AddLiquidityParams): Promise<Transaction> {
    // Build Solana transaction using Raydium SDK
    const tx = await this.connector.sdk.addLiquidity({
      pool: params.poolAddress,
      amountBase: params.baseAmount,
      amountQuote: params.quoteAmount,
      slippage: params.slippage || 1.0,
    });

    return {
      raw: tx,
      description: `Add liquidity: ${params.baseAmount} SOL + ${params.quoteAmount} USDC`,
      estimatedFee: {
        amount: '0.001',
        token: 'SOL',
      },
    };
  }

  async execute(params: AddLiquidityParams): Promise<AddLiquidityResult> {
    const tx = await this.build(params);

    // Sign and submit
    const signed = await this.connector.wallet.signTransaction(tx.raw);
    const signature = await this.connector.connection.sendTransaction(signed);
    await this.connector.connection.confirmTransaction(signature);

    return {
      signature,
      lpTokens: '100.5',
    };
  }
}
```

### 3. Chain Organization

Protocols are organized by chain:

```typescript
// SDK structure
export class ProtocolSDK {
  readonly solana: SolanaChain;
  readonly ethereum: EthereumChain;

  constructor(config: SDKConfig) {
    this.solana = new SolanaChain(config.solana);
    this.ethereum = new EthereumChain(config.ethereum);
  }
}

// Chain classes
export class SolanaChain {
  readonly raydium: RaydiumConnector;
  readonly meteora: MeteoraConnector;
  readonly orca: OrcaConnector;
  readonly jupiter: JupiterConnector;

  constructor(config: SolanaConfig) {
    this.raydium = new RaydiumConnector(config);
    this.meteora = new MeteoraConnector(config);
    this.orca = new OrcaConnector(config);
    this.jupiter = new JupiterConnector(config);
  }
}

export class EthereumChain {
  readonly uniswap: UniswapConnector;
  readonly curve: CurveConnector;
  readonly balancer: BalancerConnector;
  readonly polymarket: PolymarketConnector;
  readonly aave: AaveConnector;
  readonly zeroX: ZeroXConnector;

  constructor(config: EthereumConfig) {
    // Initialize all connectors
  }
}
```

### 4. API Wrapper Pattern

REST API routes are thin wrappers around SDK:

```typescript
// API route handler (Fastify)
export async function addLiquidityRoute(
  fastify: FastifyInstance,
  sdk: ProtocolSDK
) {
  fastify.post('/connectors/raydium/amm/addLiquidity', {
    schema: {
      body: AddLiquidityParamsSchema,
      response: {
        200: TransactionResponseSchema,
      },
    },
  }, async (request, reply) => {
    const params = request.body as AddLiquidityParams;

    try {
      // Call SDK directly
      const tx = await sdk.solana.raydium.operations.addLiquidity.build(params);

      return {
        success: true,
        transaction: tx,
      };
    } catch (error) {
      throw fastify.httpErrors.internalServerError(error.message);
    }
  });
}
```

---

## Implementation Guide

### Adding a New Protocol

**Step 1: Define Protocol-Specific Types**

```typescript
// packages/core/src/types/my-protocol.ts
export interface MyProtocolOperations {
  doSomething: OperationBuilder<DoSomethingParams>;
}

export interface MyProtocolQueries {
  getSomething: QueryFunction<GetSomethingParams, Something>;
}

export interface MyProtocol extends Protocol {
  readonly operations: MyProtocolOperations;
  readonly queries: MyProtocolQueries;
}
```

**Step 2: Create Connector Class**

```typescript
// packages/sdk/src/ethereum/my-protocol/connector.ts
export class MyProtocolConnector implements MyProtocol {
  readonly name = 'my-protocol';
  readonly chain = ChainType.ETHEREUM;
  readonly protocolType = ProtocolType.MY_TYPE;

  readonly operations = {
    doSomething: new DoSomethingOperation(this),
  };

  readonly queries = {
    getSomething: async (params) => { /* implementation */ },
  };

  async initialize(config: MyProtocolConfig): Promise<void> {
    // Initialize
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  getMetadata(): ProtocolMetadata {
    return {
      name: this.name,
      displayName: 'My Protocol',
      // ...
    };
  }
}
```

**Step 3: Implement Operations**

```typescript
// packages/sdk/src/ethereum/my-protocol/do-something.ts
export class DoSomethingOperation
  implements OperationBuilder<DoSomethingParams, DoSomethingResult>
{
  constructor(private connector: MyProtocolConnector) {}

  async validate(params: DoSomethingParams): Promise<ValidationResult> {
    // Validation logic
  }

  async simulate(params: DoSomethingParams): Promise<SimulationResult> {
    // Simulation logic
  }

  async build(params: DoSomethingParams): Promise<Transaction> {
    // Transaction building logic
  }
}
```

**Step 4: Add to Chain Class**

```typescript
// packages/sdk/src/ethereum/chain.ts
export class EthereumChain {
  readonly myProtocol: MyProtocolConnector;

  constructor(config: EthereumConfig) {
    this.myProtocol = new MyProtocolConnector(config);
    // Initialize
  }
}
```

**Step 5: Create API Routes (Optional)**

```typescript
// packages/api/src/routes/ethereum/my-protocol-routes.ts
export async function myProtocolRoutes(fastify: FastifyInstance, sdk: ProtocolSDK) {
  fastify.post('/connectors/my-protocol/doSomething', async (request, reply) => {
    const tx = await sdk.ethereum.myProtocol.operations.doSomething.build(
      request.body
    );
    return { transaction: tx };
  });
}
```

---

## Extension Points

### Custom Validation

Add custom validation logic to operations:

```typescript
class CustomOperation implements OperationBuilder<Params> {
  async validate(params: Params): Promise<ValidationResult> {
    const errors: string[] = [];

    // Business rules
    if (params.amount > MAX_AMOUNT) {
      errors.push(`Amount exceeds maximum: ${MAX_AMOUNT}`);
    }

    // External checks
    const balance = await this.checkBalance();
    if (balance < params.amount) {
      errors.push('Insufficient balance');
    }

    return { valid: errors.length === 0, errors };
  }
}
```

### Custom Simulation

Provide detailed simulation results:

```typescript
async simulate(params: Params): Promise<SimulationResult> {
  const result = await this.protocol.sdk.simulate(params);

  return {
    success: result.success,
    changes: {
      balanceChanges: result.balances.map(b => ({
        token: b.mint,
        amount: b.amount.toString(),
        direction: b.delta > 0 ? 'in' : 'out',
      })),
      positionChanges: [
        {
          type: 'liquidity-position',
          description: `LP position worth $${result.estimatedValue}`,
        },
      ],
    },
    estimatedFee: {
      amount: result.fee.toString(),
      token: result.feeToken,
    },
  };
}
```

### Multi-Step Workflows

Compose multiple operations:

```typescript
// Future feature: Transaction builder
const workflow = sdk.transaction
  .add(sdk.ethereum.aave.operations.supply, { asset: 'USDC', amount: 10000 })
  .add(sdk.ethereum.aave.operations.borrow, { asset: 'WETH', amount: 2 })
  .add(sdk.ethereum.uniswap.operations.swap, {
    tokenIn: 'WETH',
    tokenOut: 'USDC',
    amountIn: 2
  });

// Simulate entire workflow
const simulation = await workflow.simulate();

// Execute atomically or sequentially
const results = await workflow.execute({ mode: 'sequential' });
```

---

## Examples

See the [examples/validation/polymarket-mock.ts](../../examples/validation/polymarket-mock.ts) for a complete implementation of a prediction market protocol using these architecture patterns.

**Quick Example:**

```typescript
import { ProtocolSDK } from '@nfttools/protocol-sdk';

// Initialize SDK
const sdk = new ProtocolSDK({
  solana: { network: 'mainnet-beta' },
  ethereum: { network: 'mainnet' },
});

// DEX operation
const dexTx = await sdk.solana.raydium.operations.addLiquidity.build({
  poolAddress: 'abc...',
  baseAmount: 100,
  quoteAmount: 200,
  slippage: 1.0,
});

// Prediction market operation (same pattern!)
const pmTx = await sdk.ethereum.polymarket.operations.buyOutcome.build({
  marketId: 'btc-100k',
  outcome: 'YES',
  amount: '1000',
  maxPrice: 0.65,
});

// Lending operation (same pattern!)
const lendingTx = await sdk.ethereum.aave.operations.supply.build({
  asset: 'USDC',
  amount: '10000',
});

// All use the same OperationBuilder pattern!
```

---

## Next Steps

1. **Validate Architecture**: Run the Polymarket mock to ensure patterns work
2. **Implement Phase 1**: Extract Raydium SDK using these patterns
3. **Extend to All Protocols**: Apply patterns to all existing Gateway connectors
4. **Add New Protocols**: Use this architecture to add Orca, Curve, Balancer
5. **Document Patterns**: Keep this document updated as implementation progresses

---

## Appendix: Key Files

**Core Types:**
- `packages/core/src/types/protocol.ts` - Base Protocol interface
- `packages/core/src/types/prediction-market.ts` - Prediction market extension
- `packages/core/src/types/lending.ts` - Lending protocol extension (TBD)
- `packages/core/src/types/token-launch.ts` - Token launch extension (TBD)

**Validation:**
- `examples/validation/polymarket-mock.ts` - Mock Polymarket implementation

**Implementation:**
- `packages/sdk/src/solana/raydium/` - Raydium implementation (TBD)
- `packages/sdk/src/ethereum/uniswap/` - Uniswap implementation (TBD)

**API:**
- `packages/api/src/routes/` - REST API route handlers (TBD)

---

**Document Maintainer**: Protocol SDK Team
**Review Schedule**: After each phase completion
**Feedback**: Open an issue on GitHub
