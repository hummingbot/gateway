# Uniswap Connector Refactoring

This connector has been refactored to follow the design pattern of the Raydium connector, supporting both AMM (Uniswap V2) and CLMM (Uniswap V3) operations.

## Structure Overview

- `uniswap.ts`: The main Uniswap class that provides the core functionality for both V2 and V3
- `uniswap.config.ts`: Configuration for both AMM and CLMM operations
- `uniswap.utils.ts`: Common utility functions for pool management and token operations
- `uniswap.routes.ts`: Route definitions for both AMM and CLMM endpoints

### AMM Routes (Uniswap V2)

Located in `amm-routes/`:
- `poolInfo.ts`: Get information about a V2 pool
- `quoteSwap.ts`: Get a quote for swapping tokens
- `executeSwap.ts`: Execute a token swap
- `addLiquidity.ts`: Add liquidity to a V2 pool
- `removeLiquidity.ts`: Remove liquidity from a V2 pool
- `positionInfo.ts`: Get information about a user's position in a V2 pool
- `quoteLiquidity.ts`: Get a quote for adding liquidity

### CLMM Routes (Uniswap V3)

Located in `clmm-routes/` (to be implemented):
- Will include routes for V3 operations similar to Raydium's CLMM routes

## API Endpoints

### AMM (Uniswap V2)

- `GET /uniswap/amm/pool-info`: Get pool information
- `GET /uniswap/amm/quote-swap`: Get swap quote
- `POST /uniswap/amm/execute-swap`: Execute swap
- `POST /uniswap/amm/add-liquidity`: Add liquidity
- `POST /uniswap/amm/remove-liquidity`: Remove liquidity
- `GET /uniswap/amm/position-info`: Get position information
- `GET /uniswap/amm/quote-liquidity`: Get liquidity quote

### CLMM (Uniswap V3)

To be implemented following a similar pattern to Raydium's CLMM routes.

## Configuration

Template configuration has been updated to support both AMM and CLMM operations:

```yaml
# settings for AMM routes (Uniswap V2)
amm:
  # how much the execution price is allowed to move unfavorably
  allowedSlippage: '2/100'
  
  # predefined pools (Uniswap V2 pairs)
  pools:
    ETH-USDC: '0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc'
    ETH-USDT: '0x0d4a11d5eeaac28ec3f61d100daf4d40471f1852'

# settings for CLMM routes (Uniswap V3)
clmm:
  # predefined pools (Uniswap V3 pools)
  pools:
    ETH-USDC-0.05: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640'
    ETH-USDC-0.3: '0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8'
```

## Next Steps

1. Implement CLMM (Uniswap V3) routes
2. Update tests to support the new structure
3. Implement examples for common operations
4. Add OpenAPI documentation for the endpoints