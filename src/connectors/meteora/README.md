# Meteora

The Meteora Connector provides a set of RESTful API endpoints for interacting with the Meteora platform, a Concentrated Liquidity Market Maker (CLMM) DEX on the Solana blockchain. These endpoints are designed to facilitate various operations such as adding liquidity, executing swaps, and managing positions.

## Maintainer

[mlguys](https://github.com/mlguys)

## Routes

All endpoints are prefixed with the base URL: `/meteora`

### Endpoints Summary

| Endpoint                               | Method | Parameters                                                                                                                             | Response                                                                                                           |
| -------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `/meteora/add-liquidity`               | POST   | `positionAddress` (string), `baseTokenAmount` (number), `quoteTokenAmount` (number), `slippagePct` (optional, number)                  | `signature` (string), `tokenXAddedAmount` (number), `tokenYAddedAmount` (number), `fee` (number)                   |
| `/meteora/close-position`              | POST   | `positionAddress` (string)                                                                                                             | `signature` (string), `returnedSOL` (number), `fee` (number)                                                       |
| `/meteora/collect-fees`                | POST   | `positionAddress` (string)                                                                                                             | `signature` (string), `collectedFeeX` (number), `collectedFeeY` (number), `fee` (number)                           |
| `/meteora/execute-swap`                | POST   | `inputTokenSymbol` (string), `outputTokenSymbol` (string), `amount` (number), `poolAddress` (string), `slippageBps` (optional, number) | `signature` (string), `totalInputSwapped` (number), `totalOutputSwapped` (number), `fee` (number)                  |
| `/meteora/quote-fees/:positionAddress` | GET    | `positionAddress` (string)                                                                                                             | `tokenX` (object: `address` (string), `amount` (string)), `tokenY` (object: `address` (string), `amount` (string)) |
| `/meteora/lb-pairs`                    | GET    | None                                                                                                                                   | Array of objects: `publicKey` (string), `account` (object)                                                         |
| `/meteora/quote-swap`                  | GET    | `inputTokenSymbol` (string), `outputTokenSymbol` (string), `amount` (number), `poolAddress` (string), `slippageBps` (optional, number) | `estimatedAmountIn` (string), `estimatedAmountOut` (string), `minOutAmount` (string)                               |
| `/meteora/open-position`               | POST   | `baseSymbol` (string), `quoteSymbol` (string), `lowerPrice` (number), `upperPrice` (number), `poolAddress` (string)                    | `signature` (string), `positionAddress` (string), `sentSOL` (number), `fee` (number)                               |
| `/meteora/remove-liquidity`            | POST   | `positionAddress` (string), `percentageToRemove` (number)                                                                              | `signature` (string), `tokenXRemovedAmount` (number), `tokenYRemovedAmount` (number), `fee` (number)               |
| `/meteora/positions-owned`             | GET    | `poolAddress` (string), `address` (optional, string)                                                                                   | `activeBin` (object), `userPositions` (array)                                                                      |

### 1. Add Liquidity

- **Endpoint**: `/meteora/add-liquidity`
- **Method**: POST
- **Description**: Adds liquidity to a specified Meteora position.
- **Request Body**:
  - `positionAddress` (string): The address of the position to add liquidity to.
  - `baseTokenAmount` (number): The amount of base token to add.
  - `quoteTokenAmount` (number): The amount of quote token to add.
  - `slippagePct` (optional, number): The slippage percentage allowed.
- **Response**:

  - `signature` (string): The transaction signature.
  - `tokenXAddedAmount` (number): The amount of token X added.
  - `tokenYAddedAmount` (number): The amount of token Y added.
  - `fee` (number): The transaction fee.

### 2. Close Position

- **Endpoint**: `/meteora/close-position`
- **Method**: POST
- **Description**: Closes a specified Meteora position.
- **Request Body**:
  - `positionAddress` (string): The address of the position to close.
- **Response**:
  - `signature` (string): The transaction signature.
  - `returnedSOL` (number): The amount of SOL returned.
  - `fee` (number): The transaction fee.

### 3. Collect Fees

- **Endpoint**: `/meteora/collect-fees`
- **Method**: POST
- **Description**: Collects fees for a specified Meteora position.
- **Request Body**:
  - `positionAddress` (string): The address of the position to collect fees from.
- **Response**:
  - `signature` (string): The transaction signature.
  - `collectedFeeX` (number): The amount of token X fees collected.
  - `collectedFeeY` (number): The amount of token Y fees collected.
  - `fee` (number): The transaction fee.

### 4. Execute Swap

- **Endpoint**: `/meteora/execute-swap`
- **Method**: POST
- **Description**: Executes a token swap on the Meteora platform.
- **Request Body**:
  - `inputTokenSymbol` (string): The symbol of the input token.
  - `outputTokenSymbol` (string): The symbol of the output token.
  - `amount` (number): The amount of input token to swap.
  - `poolAddress` (string): The address of the pool to execute the swap in.
  - `slippageBps` (optional, number): The slippage in basis points.
- **Response**:
  - `signature` (string): The transaction signature.
  - `totalInputSwapped` (number): The total amount of input token swapped.
  - `totalOutputSwapped` (number): The total amount of output token received.
  - `fee` (number): The transaction fee.

### 5. Get Fees Quote

- **Endpoint**: `/meteora/quote-fees/:positionAddress`
- **Method**: GET
- **Description**: Retrieves a fees quote for a specified Meteora position.
- **Parameters**:
  - `positionAddress` (string): The address of the position to get a fees quote for.
- **Response**:
  - `tokenX` (object): Contains `address` (string) and `amount` (string) for token X.
  - `tokenY` (object): Contains `address` (string) and `amount` (string) for token Y.

### 6. Get LB Pairs

- **Endpoint**: `/meteora/lb-pairs`
- **Method**: GET
- **Description**: Retrieves all Meteora LB pairs.
- **Response**:
  - An array of objects, each containing:
    - `publicKey` (string): The public key of the LB pair.
    - `account` (object): Detailed account information.

### 7. Get Positions Owned By

- **Endpoint**: `/meteora/positions-owned`
- **Method**: GET
- **Description**: Retrieves a list of Meteora positions owned by a user's wallet.
- **Query Parameters**:
  - `poolAddress` (string): The address of the pool.
  - `address` (optional, string): The user's wallet address.
- **Response**:
  - `activeBin` (object): The active bin information.
  - `userPositions` (array): An array of user positions.

### 8. Get Swap Quote

- **Endpoint**: `/meteora/quote-swap`
- **Method**: GET
- **Description**: Retrieves a swap quote for a specified token pair.
- **Query Parameters**:
  - `inputTokenSymbol` (string): The symbol of the input token.
  - `outputTokenSymbol` (string): The symbol of the output token.
  - `amount` (number): The amount of input token.
  - `poolAddress` (string): The address of the pool.
  - `slippageBps` (optional, number): The slippage in basis points.
- **Response**:
  - `estimatedAmountIn` (string): The estimated amount of input token.
  - `estimatedAmountOut` (string): The estimated amount of output token.
  - `minOutAmount` (string): The minimum output amount.

### 9. Open Position

- **Endpoint**: `/meteora/open-position`
- **Method**: POST
- **Description**: Opens a new Meteora position.
- **Request Body**:
  - `baseSymbol` (string): The base token symbol.
  - `quoteSymbol` (string): The quote token symbol.
  - `lowerPrice` (number): The lower price boundary.
  - `upperPrice` (number): The upper price boundary.
  - `poolAddress` (string): The address of the pool.
- **Response**:
  - `signature` (string): The transaction signature.
  - `positionAddress` (string): The address of the new position.
  - `sentSOL` (number): The amount of SOL sent.
  - `fee` (number): The transaction fee.

### 10. Remove Liquidity

- **Endpoint**: `/meteora/remove-liquidity`
- **Method**: POST
- **Description**: Removes liquidity from a specified Meteora position.
- **Request Body**:
  - `positionAddress` (string): The address of the position to remove liquidity from.
  - `percentageToRemove` (number): The percentage of liquidity to remove.
- **Response**:
  - `signature` (string): The transaction signature.
  - `tokenXRemovedAmount` (number): The amount of token X removed.
  - `tokenYRemovedAmount` (number): The amount of token Y removed.
  - `fee` (number): The transaction fee.

## Notes

- All endpoints are designed to interact with the Solana blockchain and require a valid connection to a Solana RPC node.
- Ensure that the necessary authentication and authorization mechanisms are in place when deploying these endpoints in a production environment.
- The response objects are structured to provide detailed information about each transaction, including the transaction signature and any fees incurred.

This documentation provides a comprehensive overview of the available endpoints for the Meteora Connector, detailing the required parameters and expected responses for each operation.
