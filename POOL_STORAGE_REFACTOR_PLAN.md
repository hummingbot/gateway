# Pool Storage Refactor Plan

## Executive Summary

This plan outlines changes to the pool storage structure to incorporate authoritative token address information from pool-info endpoints, ensuring correct base/quote token identification and reducing potential mismatches between stored pool data and actual on-chain pool state.

## Current State

### Current Pool Storage Format
```typescript
interface Pool {
  type: 'amm' | 'clmm';
  network: string;
  baseSymbol: string;
  quoteSymbol: string;
  address: string;
}
```

**Example:**
```json
{
  "type": "amm",
  "network": "mainnet-beta",
  "baseSymbol": "SOL",
  "quoteSymbol": "USDC",
  "address": "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2"
}
```

**Missing Information:**
- Token addresses (baseTokenAddress, quoteTokenAddress)
- Fee percentage (feePct)

### Current pool-info Response Format

**CLMM (Raydium, Meteora, Uniswap):**
```json
{
  "address": "3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv",
  "baseTokenAddress": "So11111111111111111111111111111111111111112",
  "quoteTokenAddress": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "binStep": 1,
  "feePct": 0.04,
  "price": 208.52267413598855,
  "baseTokenAmount": 44686.816338809,
  "quoteTokenAmount": 7655774.118943,
  "activeBinId": -15678
}
```

**AMM (Raydium, Uniswap):**
```json
{
  "address": "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2",
  "baseTokenAddress": "So11111111111111111111111111111111111111112",
  "quoteTokenAddress": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "feePct": 0.3,
  "price": 208.5,
  "baseTokenAmount": 45000.5,
  "quoteTokenAmount": 7680000.2
}
```

## Problems with Current Approach

1. **Token Ordering Mismatch**: Stored pool data hardcodes base/quote symbols without reference to the actual pool's token ordering (token0/token1). This can lead to:
   - Incorrect price calculations
   - Swapped token amounts
   - Failed transactions due to incorrect token identification

2. **Missing Token Addresses**: Only token symbols are stored, not addresses. This requires:
   - Runtime lookups to resolve symbols to addresses
   - Potential ambiguity when multiple tokens share the same symbol
   - Extra round trips to fetch token information

3. **Missing Fee Information**: Fee percentages are not stored, requiring:
   - Runtime lookups to determine pool fees
   - Inability to display fee information without fetching pool-info
   - Extra API calls when fee info is needed

4. **No Validation Against On-Chain State**: When users add pools manually, there's no verification that the provided base/quote tokens match the actual pool configuration.

5. **Inconsistent Data Source**: Operations like `openPosition` and `addLiquidity` fetch pool-info at runtime but don't validate against stored pool data, leading to potential discrepancies.

## Proposed Solution

### Enhanced Pool Storage Format

```typescript
interface Pool {
  type: 'amm' | 'clmm';
  network: string;
  baseSymbol: string;
  quoteSymbol: string;
  baseTokenAddress: string;
  quoteTokenAddress: string;
  feePct: number;
  address: string;
}
```

**Example:**
```json
{
  "type": "clmm",
  "network": "mainnet-beta",
  "baseSymbol": "SOL",
  "quoteSymbol": "USDC",
  "baseTokenAddress": "So11111111111111111111111111111111111111112",
  "quoteTokenAddress": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "feePct": 0.04,
  "address": "3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv"
}
```

### Benefits

1. **Single Source of Truth**: Token addresses and fee info from pool-info become the authoritative source
2. **Reduced Lookups**: Token addresses and fees are immediately available without runtime queries
3. **Validation**: Operations can validate that user-provided amounts match the correct base/quote tokens
4. **Consistency**: Stored pool data accurately reflects on-chain pool state
5. **Fee Transparency**: Fee information is immediately available for display and calculations

## Implementation Plan

### Phase 1: Update Core Types and Schemas

**Files to Modify:**
- `src/pools/types.ts` - Add token address fields to Pool interface
- `src/pools/schemas.ts` - Update schemas to include baseTokenAddress and quoteTokenAddress
- `src/services/pool-service.ts` - Update validation logic to handle new fields

**Changes:**

1. **src/pools/types.ts**
```typescript
export interface Pool {
  type: 'amm' | 'clmm';
  network: string;
  baseSymbol: string;
  quoteSymbol: string;
  baseTokenAddress: string;    // NEW
  quoteTokenAddress: string;   // NEW
  feePct: number;              // NEW
  address: string;
}

export interface PoolAddRequest {
  connector: string;
  type: 'amm' | 'clmm';
  network: string;
  poolAddress: string;          // Make this the primary input
  baseSymbol?: string;          // Optional - will be fetched from pool-info
  quoteSymbol?: string;         // Optional - will be fetched from pool-info
}
```

2. **src/pools/schemas.ts**
```typescript
// Enhanced response schema
export const PoolListResponseSchema = Type.Array(
  Type.Object({
    type: Type.Union([Type.Literal('amm'), Type.Literal('clmm')]),
    network: Type.String(),
    baseSymbol: Type.String(),
    quoteSymbol: Type.String(),
    baseTokenAddress: Type.String(),    // NEW
    quoteTokenAddress: Type.String(),   // NEW
    feePct: Type.Number(),              // NEW
    address: Type.String(),
  }),
);

// Simplified add pool request - let pool-info determine base/quote
export const PoolAddRequestSchema = Type.Object({
  connector: Type.String({
    description: 'Connector (raydium, meteora, uniswap)',
    examples: ['raydium', 'meteora', 'uniswap'],
  }),
  type: Type.Union([Type.Literal('amm'), Type.Literal('clmm')], {
    description: 'Pool type',
  }),
  network: Type.String({
    description: 'Network name (mainnet, mainnet-beta, etc)',
    examples: ['mainnet', 'mainnet-beta'],
  }),
  poolAddress: Type.String({
    description: 'Pool contract address',
  }),
  // Optional overrides if user wants to specify base/quote ordering
  baseSymbol: Type.Optional(Type.String({
    description: 'Base token symbol (optional - fetched from pool-info if not provided)',
  })),
  quoteSymbol: Type.Optional(Type.String({
    description: 'Quote token symbol (optional - fetched from pool-info if not provided)',
  })),
});
```

### Phase 2: Update POST /pools Route

**Files to Modify:**
- `src/pools/routes/addPool.ts`

**Implementation Strategy:**

```typescript
async (request) => {
  const { connector, type, network, poolAddress, baseSymbol, quoteSymbol } = request.body;
  const poolService = PoolService.getInstance();

  try {
    // Step 1: Fetch pool-info to get authoritative token addresses
    const poolInfo = await fetchPoolInfo(connector, type, network, poolAddress);

    if (!poolInfo) {
      throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
    }

    // Step 2: Resolve token symbols from addresses
    const { baseSymbol: resolvedBase, quoteSymbol: resolvedQuote } =
      await resolveTokenSymbols(
        connector,
        network,
        poolInfo.baseTokenAddress,
        poolInfo.quoteTokenAddress
      );

    // Step 3: Use provided symbols or resolved ones
    const finalBaseSymbol = baseSymbol || resolvedBase;
    const finalQuoteSymbol = quoteSymbol || resolvedQuote;

    // Step 4: Create enhanced pool object
    const pool: Pool = {
      type,
      network,
      baseSymbol: finalBaseSymbol,
      quoteSymbol: finalQuoteSymbol,
      baseTokenAddress: poolInfo.baseTokenAddress,
      quoteTokenAddress: poolInfo.quoteTokenAddress,
      feePct: poolInfo.feePct,
      address: poolAddress,
    };

    // Step 5: Add or update pool
    const existingPool = await poolService.getPoolByAddress(connector, poolAddress);

    if (existingPool) {
      await poolService.updatePool(connector, pool);
      return {
        message: `Pool ${finalBaseSymbol}-${finalQuoteSymbol} updated successfully`,
      };
    } else {
      await poolService.addPool(connector, pool);
      return {
        message: `Pool ${finalBaseSymbol}-${finalQuoteSymbol} added successfully`,
      };
    }
  } catch (error) {
    throw fastify.httpErrors.badRequest(error.message);
  }
}
```

**Helper Functions to Add:**

```typescript
// Fetch pool-info from the appropriate connector endpoint
async function fetchPoolInfo(
  connector: string,
  type: 'amm' | 'clmm',
  network: string,
  poolAddress: string
): Promise<PoolInfo | null> {
  // Route to appropriate connector's pool-info endpoint
  // Examples:
  // - /connectors/raydium/clmm/pool-info
  // - /connectors/raydium/amm/pool-info
  // - /connectors/meteora/clmm/pool-info
  // - /connectors/uniswap/clmm/pool-info
  // - /connectors/uniswap/amm/pool-info

  // This should make internal HTTP call or directly invoke the route handler
}

// Resolve token addresses to symbols using chain's token registry
async function resolveTokenSymbols(
  connector: string,
  network: string,
  baseTokenAddress: string,
  quoteTokenAddress: string
): Promise<{ baseSymbol: string; quoteSymbol: string }> {
  // Get chain instance for the connector
  // Call getToken() or similar to resolve addresses to token info
  // Return symbols
}
```

### Phase 3: Update Pool Validation

**Files to Modify:**
- `src/services/pool-service.ts`

**Changes:**

```typescript
public async validatePool(connector: string, pool: Pool): Promise<void> {
  // Existing validations...

  // NEW: Validate token addresses
  if (!pool.baseTokenAddress || pool.baseTokenAddress.trim() === '') {
    throw new Error('Base token address is required');
  }

  if (!pool.quoteTokenAddress || pool.quoteTokenAddress.trim() === '') {
    throw new Error('Quote token address is required');
  }

  // NEW: Validate fee percentage
  if (pool.feePct === undefined || pool.feePct === null) {
    throw new Error('Fee percentage is required');
  }

  if (pool.feePct < 0 || pool.feePct > 100) {
    throw new Error('Fee percentage must be between 0 and 100');
  }

  // Validate token address formats based on chain
  const chain = this.getChainForConnector(connector);

  if (chain === SupportedChain.SOLANA) {
    try {
      new PublicKey(pool.baseTokenAddress);
      new PublicKey(pool.quoteTokenAddress);
    } catch {
      throw new Error('Invalid Solana token address');
    }
  } else if (chain === SupportedChain.ETHEREUM) {
    if (!ethers.utils.isAddress(pool.baseTokenAddress)) {
      throw new Error('Invalid Ethereum base token address');
    }
    if (!ethers.utils.isAddress(pool.quoteTokenAddress)) {
      throw new Error('Invalid Ethereum quote token address');
    }
  }

  // NEW: Validate that base and quote tokens are different
  if (pool.baseTokenAddress.toLowerCase() === pool.quoteTokenAddress.toLowerCase()) {
    throw new Error('Base and quote tokens must be different');
  }
}
```

### Phase 4: Update Connector Operations

**Impact Analysis by Connector:**

#### 4.1 Raydium CLMM (openPosition, addLiquidity)

**Files:**
- `src/connectors/raydium/clmm-routes/openPosition.ts`
- `src/connectors/raydium/clmm-routes/addLiquidity.ts`

**Current Flow:**
1. User provides poolAddress
2. Fetch pool from API: `raydium.getClmmPoolfromAPI(poolAddress)`
3. Use mintA/mintB from pool info
4. No validation against stored pool data

**Proposed Changes:**
```typescript
// In openPosition handler
async function openPosition(...) {
  // ... existing code ...

  // NEW: Fetch stored pool data if available
  const storedPool = await PoolService.getInstance().getPoolByAddress('raydium', poolAddress);

  // Fetch pool info from API
  const poolInfo = await raydium.getClmmPoolInfo(poolAddress);

  // NEW: Validate token addresses match stored pool (if it exists)
  if (storedPool) {
    if (poolInfo.baseTokenAddress !== storedPool.baseTokenAddress ||
        poolInfo.quoteTokenAddress !== storedPool.quoteTokenAddress) {
      throw new Error(
        `Pool token mismatch: stored pool has ${storedPool.baseSymbol}/${storedPool.quoteSymbol} ` +
        `but on-chain pool has different tokens`
      );
    }
  }

  // Continue with existing logic using poolInfo's token addresses
  // ...
}
```

**Benefits:**
- Validates user is interacting with expected pool
- Catches configuration errors early
- Provides better error messages

#### 4.2 Raydium AMM (addLiquidity)

**Files:**
- `src/connectors/raydium/amm-routes/addLiquidity.ts`

**Current Flow:**
1. User provides poolAddress
2. Fetch pool info: `raydium.getAmmPoolInfo(poolAddress)`
3. Use mintA/mintB from pool info

**Proposed Changes:**
Same validation pattern as CLMM - fetch stored pool, validate token addresses match.

#### 4.3 Meteora CLMM (openPosition, addLiquidity)

**Files:**
- `src/connectors/meteora/clmm-routes/openPosition.ts`
- `src/connectors/meteora/clmm-routes/addLiquidity.ts`

**Current Flow:**
1. User provides poolAddress
2. Fetch pool info from Meteora API
3. Use returned token addresses

**Proposed Changes:**
Add validation against stored pool data similar to Raydium.

#### 4.4 Uniswap CLMM (openPosition, addLiquidity)

**Files:**
- `src/connectors/uniswap/clmm-routes/openPosition.ts`
- `src/connectors/uniswap/clmm-routes/addLiquidity.ts`

**Current Flow:**
1. User provides poolAddress (or baseToken/quoteToken)
2. Fetch pool info from Uniswap
3. Use token0/token1 from pool

**Proposed Changes:**
Add validation against stored pool data. Note: Uniswap uses token0/token1 ordering which may not match baseToken/quoteToken ordering in stored data.

**Special Consideration:**
```typescript
// Uniswap pools have canonical token0/token1 ordering
// Need to map stored base/quote to token0/token1 correctly
const isBaseToken0 = storedPool.baseTokenAddress.toLowerCase() <
                     storedPool.quoteTokenAddress.toLowerCase();
```

#### 4.5 Uniswap AMM (addLiquidity)

**Files:**
- `src/connectors/uniswap/amm-routes/addLiquidity.ts`

Same considerations as Uniswap CLMM.

### Phase 5: Template Migration Strategy

#### 5.1 Migration Script

**Approach:**
- Create one-time migration script to update template pools
- Script fetches pool-info for each pool in templates
- Updates template files with new fields (baseTokenAddress, quoteTokenAddress, feePct)
- No backward compatibility needed - breaking change for old format

**Files to Create:**
- `scripts/migrate-pool-templates.ts` - Migration script

**Implementation:**

```typescript
// scripts/migrate-pool-templates.ts
import fs from 'fs/promises';
import path from 'path';
import { Raydium } from '../src/connectors/raydium/raydium';
import { Meteora } from '../src/connectors/meteora/meteora';
import { Uniswap } from '../src/connectors/uniswap/uniswap';
import { Solana } from '../src/chains/solana/solana';
import { Ethereum } from '../src/chains/ethereum/ethereum';
import { logger } from '../src/services/logger';

interface OldPool {
  type: 'amm' | 'clmm';
  network: string;
  baseSymbol: string;
  quoteSymbol: string;
  address: string;
}

interface NewPool {
  type: 'amm' | 'clmm';
  network: string;
  baseSymbol: string;
  quoteSymbol: string;
  baseTokenAddress: string;
  quoteTokenAddress: string;
  feePct: number;
  address: string;
}

async function fetchPoolInfo(
  connector: string,
  type: 'amm' | 'clmm',
  network: string,
  poolAddress: string
): Promise<{ baseTokenAddress: string; quoteTokenAddress: string; feePct: number } | null> {
  try {
    if (connector === 'raydium') {
      const raydium = await Raydium.getInstance(network);
      if (type === 'clmm') {
        const poolInfo = await raydium.getClmmPoolInfo(poolAddress);
        return {
          baseTokenAddress: poolInfo.baseTokenAddress,
          quoteTokenAddress: poolInfo.quoteTokenAddress,
          feePct: poolInfo.feePct,
        };
      } else {
        const poolInfo = await raydium.getAmmPoolInfo(poolAddress);
        return {
          baseTokenAddress: poolInfo.baseTokenAddress,
          quoteTokenAddress: poolInfo.quoteTokenAddress,
          feePct: poolInfo.feePct,
        };
      }
    } else if (connector === 'meteora') {
      const meteora = await Meteora.getInstance(network);
      const poolInfo = await meteora.getPoolInfo(poolAddress);
      return {
        baseTokenAddress: poolInfo.baseTokenAddress,
        quoteTokenAddress: poolInfo.quoteTokenAddress,
        feePct: poolInfo.feePct,
      };
    } else if (connector === 'uniswap') {
      const uniswap = await Uniswap.getInstance(network);
      // Call appropriate pool-info method based on type
      // Note: You'll need to implement this based on how Uniswap connector works
      if (type === 'clmm') {
        // Fetch CLMM pool info
        const poolInfo = await uniswap.getV3PoolInfo(poolAddress);
        return {
          baseTokenAddress: poolInfo.baseTokenAddress,
          quoteTokenAddress: poolInfo.quoteTokenAddress,
          feePct: poolInfo.feePct,
        };
      } else {
        // Fetch AMM pool info
        const poolInfo = await uniswap.getV2PoolInfo(poolAddress);
        return {
          baseTokenAddress: poolInfo.baseTokenAddress,
          quoteTokenAddress: poolInfo.quoteTokenAddress,
          feePct: poolInfo.feePct,
        };
      }
    }
    return null;
  } catch (error) {
    logger.error(`Error fetching pool info for ${poolAddress}: ${error.message}`);
    return null;
  }
}

async function migrateTemplateFile(
  connector: string,
  templatePath: string
): Promise<void> {
  logger.info(`Migrating template file: ${templatePath}`);

  // Read existing template
  const fileContent = await fs.readFile(templatePath, 'utf-8');
  const oldPools: OldPool[] = JSON.parse(fileContent);

  const newPools: NewPool[] = [];
  let successCount = 0;
  let failCount = 0;

  for (const oldPool of oldPools) {
    logger.info(`Processing pool: ${oldPool.address} (${oldPool.baseSymbol}-${oldPool.quoteSymbol})`);

    const poolInfo = await fetchPoolInfo(
      connector,
      oldPool.type,
      oldPool.network,
      oldPool.address
    );

    if (poolInfo) {
      newPools.push({
        ...oldPool,
        baseTokenAddress: poolInfo.baseTokenAddress,
        quoteTokenAddress: poolInfo.quoteTokenAddress,
        feePct: poolInfo.feePct,
      });
      logger.info(`✓ Migrated ${oldPool.address}`);
      successCount++;
    } else {
      logger.error(`✗ Failed to migrate ${oldPool.address}`);
      failCount++;
      // Optionally: add placeholder or skip
      // For now, we'll skip failed pools
    }
  }

  // Write updated template
  await fs.writeFile(
    templatePath,
    JSON.stringify(newPools, null, 2) + '\n',
    'utf-8'
  );

  logger.info(`Completed ${templatePath}: ${successCount} succeeded, ${failCount} failed`);
}

async function main() {
  const templatesDir = path.join(__dirname, '..', 'src', 'templates', 'pools');

  const connectors = [
    { name: 'raydium', file: 'raydium.json' },
    { name: 'meteora', file: 'meteora.json' },
    { name: 'uniswap', file: 'uniswap.json' },
  ];

  for (const connector of connectors) {
    const templatePath = path.join(templatesDir, connector.file);

    // Check if file exists
    try {
      await fs.access(templatePath);
      await migrateTemplateFile(connector.name, templatePath);
    } catch (error) {
      logger.warn(`Template file not found: ${templatePath}`);
    }
  }

  logger.info('Migration complete!');
}

main().catch((error) => {
  logger.error(`Migration failed: ${error.message}`);
  process.exit(1);
});
```

**Usage:**
```bash
# Run migration script
ts-node scripts/migrate-pool-templates.ts

# Or with compiled version
node dist/scripts/migrate-pool-templates.js
```

#### 5.2 Template Files to Migrate

**Files:**
- `src/templates/pools/raydium.json`
- `src/templates/pools/meteora.json`
- `src/templates/pools/uniswap.json`
- `src/templates/pools/pancakeswap.json` (if exists)

**Migration Steps:**
1. Run migration script before deployment
2. Review migrated templates
3. Commit updated template files
4. No runtime migration needed - new format is required

### Phase 6: Testing Strategy

#### 6.1 Unit Tests

**New Test Files:**
- `test/pools/pool-validation.test.ts` - Test enhanced validation with new fields

**Updated Test Files:**
- `test/pools/pool-service.test.ts` - Update for new fields (baseTokenAddress, quoteTokenAddress, feePct)
- `test/pools/pools.routes.test.ts` - Update POST /pools tests to verify pool-info integration

#### 6.2 Integration Tests

**Test Cases:**
1. **Add new pool via POST /pools**
   - Verify pool-info is called
   - Verify token addresses are stored correctly
   - Verify feePct is stored correctly
   - Verify symbols are resolved correctly

2. **GET /pools returns new fields**
   - Verify baseTokenAddress is included in response
   - Verify quoteTokenAddress is included in response
   - Verify feePct is included in response

3. **Open position with stored pool**
   - Verify token address validation against stored pool
   - Verify operation succeeds with matching tokens
   - Verify operation fails with mismatched tokens

4. **Add liquidity with stored pool**
   - Same validations as open position

#### 6.3 Manual Testing Checklist

**Template Migration:**
- [ ] Run migration script on pool templates
- [ ] Verify all template pools have baseTokenAddress, quoteTokenAddress, feePct
- [ ] Verify migrated pool data matches pool-info responses
- [ ] Commit updated template files

**API Testing:**
- [ ] Add new Raydium CLMM pool via POST /pools
- [ ] Add new Raydium AMM pool via POST /pools
- [ ] Add new Meteora CLMM pool via POST /pools
- [ ] Add new Uniswap CLMM pool via POST /pools
- [ ] Add new Uniswap AMM pool via POST /pools
- [ ] Verify pool-info is called for each
- [ ] Verify token addresses are correctly stored
- [ ] Verify feePct is correctly stored
- [ ] Verify GET /pools returns new fields (baseTokenAddress, quoteTokenAddress, feePct)

**Connector Operations:**
- [ ] Open position on Raydium CLMM pool
- [ ] Add liquidity to Raydium AMM pool
- [ ] Verify token address validation works

**Error Handling:**
- [ ] Test error handling for invalid pool addresses
- [ ] Test error handling for pool-info failures
- [ ] Test validation with old format pools (should fail)

### Phase 7: Documentation Updates

**Files to Update:**
1. **README.md** - Update API examples
2. **CLAUDE.md** - Update architecture notes
3. **API Documentation (Swagger)** - Auto-updated via schemas

**Key Documentation Points:**
- Explain new pool storage format
- Update API examples to show new fields
- Document migration behavior
- Explain validation logic
- Add troubleshooting section for common errors

## Risk Assessment

### High Risk Areas

1. **Template Migration Failures**
   - **Risk**: Pool-info endpoint fails during template migration
   - **Mitigation**: Manual review of migration results, skip failed pools and migrate manually

2. **Token Address Mismatch**
   - **Risk**: Stored token addresses don't match on-chain pool
   - **Mitigation**: Always validate against fresh pool-info during operations

3. **Breaking Changes**
   - **Risk**: Existing deployments with old format pools will break
   - **Mitigation**: This is intentional - old format is not supported. Migration script handles templates only. Users with custom pools in conf/ will need to re-add them via POST /pools

### Medium Risk Areas

1. **Performance**
   - **Risk**: Calling pool-info for every POST /pools adds latency
   - **Mitigation**: Acceptable for manual pool addition; consider caching for bulk operations

2. **Symbol Resolution Errors**
   - **Risk**: Token address doesn't exist in token registry
   - **Mitigation**: Allow manual symbol override in POST /pools

### Low Risk Areas

1. **Storage Size**
   - **Risk**: Pool files grow due to additional fields
   - **Mitigation**: Negligible - only 2 address fields added per pool

## Success Criteria

1. ✅ All pools stored with token addresses (baseTokenAddress, quoteTokenAddress) and feePct
2. ✅ POST /pools validates against pool-info and stores complete data
3. ✅ GET /pools returns new fields
4. ✅ Operations validate token addresses before execution
5. ✅ Template migration script successfully migrates all template pools
6. ✅ All tests pass
7. ✅ Documentation is complete and accurate
8. ✅ Old format pools are rejected with clear error messages

## Timeline Estimate

- **Phase 1**: Update types and schemas (add feePct) - 2 hours
- **Phase 2**: Update POST /pools route - 4 hours
- **Phase 3**: Update validation (including feePct) - 2 hours
- **Phase 4**: Update connector operations - 6 hours
- **Phase 5**: Create and run migration script - 3 hours
- **Phase 6**: Testing - 6 hours
- **Phase 7**: Documentation - 2 hours

**Total**: ~25 hours (~3 days)

## Follow-up Tasks

After implementation:
1. Monitor error logs for migration issues
2. Gather feedback from Hummingbot integration
3. Consider adding pool metadata (creation date, last validated, etc.)
4. Consider adding cache/TTL for pool-info to reduce API calls
5. Add analytics to track pool usage patterns

## Open Questions

1. **Should we validate pool-info on every operation or cache it?**
   - Tradeoff: Freshness vs. performance
   - Recommendation: Always fetch fresh for now, add caching later if needed

2. **What happens if pool-info endpoint is down during POST /pools?**
   - Recommendation: Return error, don't allow pool addition without validation

3. **Should we support manually specifying token addresses without pool-info?**
   - Recommendation: No - always require pool-info validation for data integrity

4. **How do we handle pools that are deprecated/removed on-chain?**
   - Recommendation: Keep in storage but mark with error during validation; add "status" field in future iteration

## Conclusion

This refactor significantly improves pool data integrity by:
1. Storing authoritative token addresses and fee percentages from on-chain state
2. Validating operations against stored pool data
3. Reducing runtime lookups and potential errors
4. Providing better error messages and debugging capability
5. Making fee information immediately available without additional API calls

The implementation is straightforward with manageable risks. The migration script handles template pool updates, and the new format is enforced going forward (no backward compatibility for old format). Users will need to re-add any custom pools via the POST /pools API, which will automatically fetch and validate pool data.
