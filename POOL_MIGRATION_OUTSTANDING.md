# Outstanding Question: Template Pool Migration

## Issue
The migration script (`scripts/migrate-pool-templates.ts`) has been created and the project builds successfully, but the actual execution of the migration has not been performed.

## Why Not Executed
Running the migration script requires:
1. Live RPC connections to Solana (for Raydium and Meteora pools)
2. Live RPC connections to Ethereum networks (for Uniswap pools)
3. Configured API keys in `conf/rpc/*.yml` files
4. Time to process ~80+ pools across multiple connectors

This may fail if:
- RPC endpoints are not configured
- Network connectivity issues
- Rate limiting from RPC providers
- Pools have been deprecated/removed

## How to Run Migration

```bash
# Ensure RPC endpoints are configured
# Edit conf/rpc/helius.yml for Solana
# Edit conf/rpc/infura.yml for Ethereum

# Run the migration script
npx ts-node scripts/migrate-pool-templates.ts

# Or run compiled version
node dist/scripts/migrate-pool-templates.js
```

## Expected Output
The script will:
1. Process each pool template file (raydium.json, meteora.json, uniswap.json)
2. Fetch pool-info for each pool address
3. Extract baseTokenAddress, quoteTokenAddress, and feePct
4. Write updated template files with new format

## Review Checklist After Migration
- [ ] Check that all pools have baseTokenAddress, quoteTokenAddress, feePct fields
- [ ] Verify token addresses match expected values
- [ ] Verify fee percentages are reasonable (AMM: 0.25-0.3%, CLMM: variable)
- [ ] Check success/failure counts in migration output
- [ ] Manually fix any failed pool migrations
- [ ] Commit updated template files to repository

## Alternative: Manual Migration
If automated migration fails for some pools:
1. Use POST /pools API to add each pool
2. API will automatically fetch pool-info and populate fields
3. Export pools to create new template file

## Status
- [x] Migration script created
- [x] Build successful
- [ ] Migration executed
- [ ] Results reviewed
- [ ] Updated templates committed
