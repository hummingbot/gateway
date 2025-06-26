# Token Management System Plan

## Overview
Implement a comprehensive token management system that allows users to list, view, add, and remove tokens from token lists. This will completely replace the existing chain-specific token routes with a unified token management API and include MCP tool integration.

## Current State
- Token lists are stored in `src/templates/lists/<chain>/<network>.json`
- Existing routes: `/chains/ethereum/tokens` and `/chains/solana/tokens`
- Token lists are loaded at chain initialization using `TokenListResolutionStrategy`
- Tokens have structure: `name`, `symbol`, `address`, `decimals` (chainId is derived from network)
- Token lookup supports both symbol AND address
- No ability to modify token lists at runtime

## Proposed Architecture

### 1. Unified Token Routes (`/tokens`)
Create a new set of routes under `/tokens` that handle all token operations across chains and networks.

### 2. Token List Management
- Token lists remain file-based for persistence (NO URL loading support)
- Add runtime modification capabilities
- Validate token additions against chain-specific requirements
- NO backward compatibility - old routes will be removed completely
- NO fallbacks - all errors must be thrown immediately

### 3. MCP Integration
Add MCP tools for token management to enable AI-assisted token operations. Remove existing read-only `get_tokens` tool.

## Detailed To-Do List

### Phase 1: Create Token Management Infrastructure

#### 1.1 Create Token Schemas
- [ ] Create `src/tokens/schemas.ts` with TypeBox schemas
  - `TokenSchema` - Individual token structure (name, symbol, address, decimals)
  - `TokenListQuerySchema` - Query parameters for listing tokens
  - `TokenViewQuerySchema` - Query parameters for viewing a token (by symbol OR address)
  - `TokenAddRequestSchema` - Request body for adding a token
  - `TokenRemoveQuerySchema` - Query parameters for removing a token (by address only)
  - `TokenListResponseSchema` - Response format for token lists

#### 1.2 Create Token Service
- [ ] Create `src/services/token-service.ts`
  - `listTokens(chain: string, network: string, search?: string)` - List tokens with optional search
  - `getToken(chain: string, network: string, symbolOrAddress: string)` - Get specific token by symbol OR address
  - `addToken(chain: string, network: string, token: Token)` - Add new token (throw on duplicate address)
  - `removeToken(chain: string, network: string, address: string)` - Remove token by address only
  - `validateToken(chain: string, token: Token)` - Validate token data (throw on invalid)
  - `loadTokenList(chain: string, network: string)` - Load token list from file (throw if not found)
  - `saveTokenList(chain: string, network: string, tokens: Token[])` - Save token list to file (throw on failure)

#### 1.3 Create Token Types
- [ ] Create `src/tokens/types.ts`
  - Define common `Token` interface
  - Define chain-specific token interfaces (EthereumToken, SolanaToken)
  - Define token list format interfaces

### Phase 2: Implement Token Routes

#### 2.1 Create Token Routes Structure
- [ ] Create `src/tokens/tokens.routes.ts` - Main token routes registration
- [ ] Create `src/tokens/routes/` directory for individual route files

#### 2.2 Implement Individual Routes
- [ ] Create `src/tokens/routes/listTokens.ts`
  - GET `/tokens` - List all tokens across all chains/networks
  - GET `/tokens?chain=ethereum&network=mainnet` - List tokens for specific chain/network
  - GET `/tokens?chain=ethereum&network=mainnet&search=USDC` - Search tokens
  
- [ ] Create `src/tokens/routes/getToken.ts`
  - GET `/tokens/:symbolOrAddress?chain=ethereum&network=mainnet` - Get specific token
  
- [ ] Create `src/tokens/routes/addToken.ts`
  - POST `/tokens` - Add new token to a chain/network
  - Request body: token details including symbol, address, decimals, etc.
  
- [ ] Create `src/tokens/routes/removeToken.ts`
  - DELETE `/tokens/:address?chain=ethereum&network=mainnet` - Remove token by address

#### 2.3 Add Validation and Error Handling
- [ ] Validate chain/network combinations (throw if invalid)
- [ ] Validate token addresses based on chain requirements (throw if invalid)
- [ ] Check for duplicate addresses (throw if exists)
- [ ] No fallback values - throw on any missing required fields
- [ ] Clear error messages with no error masking

### Phase 3: Remove Existing Chain-Specific Routes

#### 3.1 Remove Ethereum Token Route
- [ ] DELETE `/chains/ethereum/tokens` route completely
- [ ] Remove token route from `ethereum.routes.ts`
- [ ] Update OpenAPI spec

#### 3.2 Remove Solana Token Route
- [ ] DELETE `/chains/solana/tokens` route completely
- [ ] Remove token route from `solana.routes.ts`
- [ ] Update OpenAPI spec

#### 3.3 Update Chain Implementations
- [ ] Update `ethereum.ts` to use token service for token loading
- [ ] Update `solana.ts` to use token service for token loading
- [ ] Remove `TokenListResolutionStrategy` URL loading support
- [ ] Token changes require gateway restart (same as config changes)

### Phase 4: MCP Tool Integration

#### 4.1 Create Token MCP Tools
- [ ] Create `src/mcp/tools/tokens.ts`
  - `list_tokens` - List tokens with filtering
  - `search_tokens` - Search for specific tokens
  - `get_token` - Get token details
  - `add_token` - Add new token to a list
  - `remove_token` - Remove token from a list
- [ ] Remove existing `get_tokens` tool from `discovery.ts`

#### 4.2 Update MCP Server
- [ ] Register new token tools in MCP server
- [ ] Add token management examples to MCP documentation
- [ ] Test token operations through MCP

### Phase 5: Testing and Documentation

#### 5.1 Create Tests
- [ ] Unit tests for token service
- [ ] Integration tests for token routes
- [ ] Tests for chain-specific validations
- [ ] Tests for file persistence

#### 5.2 Update Documentation
- [ ] Update API documentation with new token endpoints
- [ ] Add token management guide
- [ ] Document MCP token tools
- [ ] Update migration guide from old endpoints


## Implementation Considerations

### 1. File System Operations
- Use atomic writes to prevent corruption
- Throw error if file operations fail (no retry)
- Throw error if file lock fails (no queue)

### 2. Validation Rules
- **Ethereum**: Valid ERC-20 address, correct checksum
- **Solana**: Valid base58 address, correct token program
- Check for duplicate addresses across entire list
- No default values for missing fields
- chainId derived from network configuration

### 3. Security
- Validate all inputs (throw on invalid)
- Prevent path traversal attacks
- Limit token list size
- Rate limit modification endpoints

### 4. Performance
- Token changes require gateway restart
- Implement efficient search algorithms
- No lazy loading - load all tokens upfront

### 5. Error Handling
- NO fallbacks or graceful degradation
- Clear error messages for all failures
- Throw errors immediately on any issue

## Migration Strategy

1. **Hard Cutover**: Remove old endpoints immediately when new system is ready
2. **No Deprecation Period**: Users must switch to new endpoints immediately
3. **Clear Error Messages**: Old endpoints return 404 with message to use new /tokens endpoints

## Example API Usage

### List Tokens
```bash
# List all Ethereum mainnet tokens
GET /tokens?chain=ethereum&network=mainnet

# Search for USDC across all networks
GET /tokens?search=USDC

# List all tokens (paginated)
GET /tokens?limit=50&offset=0
```

### Get Token
```bash
# Get token by symbol
GET /tokens/USDC?chain=ethereum&network=mainnet

# Get token by address
GET /tokens/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48?chain=ethereum&network=mainnet
```

### Add Token
```bash
POST /tokens
{
  "chain": "ethereum",
  "network": "mainnet",
  "symbol": "TEST",
  "name": "Test Token",
  "address": "0x...",
  "decimals": 18
}
```

### Remove Token
```bash
# Remove by address only
DELETE /tokens/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48?chain=ethereum&network=mainnet
```

## Success Criteria

1. All token operations work through unified `/tokens` endpoints
2. Old chain-specific endpoints removed completely
3. Token modifications persist across restarts
4. MCP tools enable token management through AI
5. All errors thrown immediately with clear messages
6. Comprehensive test coverage
7. Complete documentation
8. Gateway restart required after token changes (same as config)

## Timeline Estimate

- Phase 1: 2-3 days (Infrastructure)
- Phase 2: 3-4 days (Routes implementation)
- Phase 3: 1-2 days (Remove existing routes)
- Phase 4: 2-3 days (MCP integration)
- Phase 5: 2-3 days (Testing & Documentation)

**Total: 10-15 days**

## Risks and Mitigation

1. **Risk**: File corruption during write operations
   - **Mitigation**: Atomic writes, throw error if write fails

2. **Risk**: Breaking existing integrations
   - **Mitigation**: Clear 404 errors directing to new endpoints

3. **Risk**: Performance impact with large token lists
   - **Mitigation**: Efficient search algorithms, upfront loading

4. **Risk**: Concurrent modification conflicts
   - **Mitigation**: File locking, throw error on lock failure

5. **Risk**: Invalid token data
   - **Mitigation**: Strict validation, throw errors immediately

6. **Risk**: Chain instances out of sync
   - **Mitigation**: Require gateway restart after token modifications