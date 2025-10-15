# Ethereum Gas Configuration Guide

This guide explains how to configure gas settings for Ethereum and EVM-compatible networks in Gateway.

## Overview

Gateway supports two types of gas pricing models:

1. **EIP-1559** (Type 2 transactions) - Used by modern networks like Ethereum Mainnet, Base, Polygon, Arbitrum, Optimism
2. **Legacy** (Type 0 transactions) - Used by older networks like BSC, Avalanche, Celo

## Configuration Files

Gas settings are configured per network in `conf/chains/ethereum/{network}.yml`:

```yaml
chainID: 8453
nodeURL: https://mainnet.base.org
nativeCurrencySymbol: ETH
minGasPrice: 0.1
# EIP-1559 gas parameters (in GWEI)
# If not set, will fetch from network
maxFeePerGas: 0.1
maxPriorityFeePerGas: 0.01
```

## Gas Parameters Explained

### Common Parameters (All Networks)

#### `minGasPrice` (GWEI)
- **Purpose**: Sets a minimum floor for gas prices
- **Applies to**: Both EIP-1559 and legacy networks
- **Default**: 0.1 GWEI if not specified
- **Behavior**:
  - For EIP-1559: Ensures `maxFeePerGas` doesn't go below this value
  - For legacy: Ensures `gasPrice` doesn't go below this value
- **Use case**: Prevent transactions from using extremely low gas prices that may not confirm

### EIP-1559 Parameters (Type 2 Transactions)

#### `maxFeePerGas` (GWEI)
- **Purpose**: The maximum total fee you're willing to pay per unit of gas
- **Optional**: If not set, fetches from network
- **Formula**: `maxFeePerGas = baseFee + maxPriorityFeePerGas`
- **Actual cost**: You typically pay less than this amount
- **Use case**: Set a ceiling to control maximum transaction costs

#### `maxPriorityFeePerGas` (GWEI)
- **Purpose**: The tip paid to validators/miners for prioritizing your transaction
- **Optional**: If not set, fetches from network
- **Also called**: "Priority fee" or "tip"
- **Behavior**: Higher values = faster inclusion in blocks
- **Use case**: Control transaction speed and validator incentives

### Legacy Parameters (Type 0 Transactions)

#### `gasPrice` (GWEI)
- **Purpose**: Fixed price per unit of gas
- **Behavior**: Simple single-price model (no base fee + priority fee split)
- **Use case**: For networks that don't support EIP-1559

## How EIP-1559 Works

When you submit an EIP-1559 transaction:

1. **You specify**:
   - `maxFeePerGas`: Maximum willing to pay (e.g., 0.1 GWEI)
   - `maxPriorityFeePerGas`: Tip for validator (e.g., 0.01 GWEI)

2. **Network determines**:
   - `baseFee`: Current network congestion price (e.g., 0.004 GWEI)

3. **You actually pay**:
   ```
   effectiveGasPrice = baseFee + min(maxPriorityFeePerGas, maxFeePerGas - baseFee)
   ```

4. **Example**:
   - `maxFeePerGas = 0.1 GWEI`
   - `maxPriorityFeePerGas = 0.01 GWEI`
   - `baseFee = 0.004 GWEI` (from network)
   - **Actual price paid** = `0.004 + 0.01 = 0.014 GWEI` ✓

The `baseFee` is burned (removed from circulation), and the `maxPriorityFeePerGas` goes to the validator.

## Network Types

### EIP-1559 Networks
These networks support Type 2 (EIP-1559) transactions:
- **Ethereum Mainnet** (chainID: 1)
- **Base** (chainID: 8453)
- **Polygon** (chainID: 137)
- **Arbitrum** (chainID: 42161)
- **Optimism** (chainID: 10)

### Legacy Networks
These networks use Type 0 (legacy) transactions:
- **BSC** (Binance Smart Chain, chainID: 56)
- **Avalanche** (chainID: 43114)
- **Celo** (chainID: 42220)
- **Sepolia Testnet** (chainID: 11155111)

## Configuration Strategies

### Strategy 1: Use Network Values (Default)
**Config**:
```yaml
minGasPrice: 0.1
# maxFeePerGas: 0.1          # Commented out
# maxPriorityFeePerGas: 0.01 # Commented out
```

**Behavior**:
- Fetches current gas prices from the network
- Adapts to real-time network conditions
- May pay higher fees during congestion
- Respects `minGasPrice` as a floor

**Best for**: Production environments where reliability is critical

### Strategy 2: Fixed Low Fees
**Config**:
```yaml
minGasPrice: 0.1
maxFeePerGas: 0.1
maxPriorityFeePerGas: 0.01
```

**Behavior**:
- Always uses your configured values
- Predictable, low-cost transactions
- May be slower during high congestion
- Risk: Transactions may not confirm if fees too low

**Best for**: Development, testing, or low-priority operations

### Strategy 3: Hybrid Approach
**Config**:
```yaml
minGasPrice: 0.5
# maxFeePerGas: 1.0          # Commented out
# maxPriorityFeePerGas: 0.1  # Commented out
```

**Behavior**:
- Fetches from network but enforces higher minimum
- Balances cost control with reliability
- Ensures minimum confirmation speed

**Best for**: Production with cost constraints

## Example Configurations

### Base Network (Low Fees)
```yaml
chainID: 8453
nodeURL: https://mainnet.base.org
nativeCurrencySymbol: ETH
minGasPrice: 0.1
maxFeePerGas: 0.1
maxPriorityFeePerGas: 0.01
```
- Base typically has very low fees
- 0.1 GWEI max fee is usually sufficient
- Transactions confirm quickly even with low priority fee

### Ethereum Mainnet (Use Network Prices)
```yaml
chainID: 1
nodeURL: https://eth.llamarpc.com
nativeCurrencySymbol: ETH
minGasPrice: 1.0
# maxFeePerGas: 10
# maxPriorityFeePerGas: 2
```
- Mainnet fees vary significantly
- Better to use network prices
- Set higher `minGasPrice` to ensure confirmation

### BSC (Legacy Network)
```yaml
chainID: 56
nodeURL: https://bsc-dataseed.binance.org
nativeCurrencySymbol: BNB
minGasPrice: 3.0
```
- Uses legacy gas pricing (single `gasPrice`)
- No EIP-1559 parameters needed
- BSC recommends minimum 3 GWEI

## Monitoring Gas Usage

Gateway logs provide visibility into gas pricing:

### EIP-1559 Transaction Logs
```
2025-10-15 10:34:01 | info | Network EIP-1559 fees: baseFee=0.0012 GWEI, maxFee=1.5043 GWEI, priority=0.0001 GWEI
2025-10-15 10:34:01 | info | Using configured EIP-1559 fees: maxFee=0.1 GWEI, priority=0.01 GWEI
2025-10-15 10:34:01 | info | Estimated: 0.1 GWEI for network base
```

### Legacy Transaction Logs
```
2025-10-15 10:45:49 | info | Network legacy gas price: 0.0500 GWEI
2025-10-15 10:45:49 | info | Using configured minimum gas price: 0.1 GWEI (network: 0.0500 GWEI)
2025-10-15 10:45:49 | info | Estimated: 0.1 GWEI for network bsc
```

The logs show:
1. **Network values**: What the network currently reports
2. **Configured values**: What you've set in config
3. **Used values**: What will actually be used for transactions

## Estimating Gas Costs

To see current gas estimates without sending a transaction:

```bash
curl -X 'GET' \
  'http://localhost:15888/chains/ethereum/estimate-gas?network=base' \
  -H 'accept: application/json'
```

**EIP-1559 Response**:
```json
{
  "feePerComputeUnit": 0.1,
  "denomination": "gwei",
  "computeUnits": 300000,
  "feeAsset": "ETH",
  "fee": 0.00003,
  "timestamp": 1760553074872,
  "gasType": "eip1559",
  "maxFeePerGas": 0.1,
  "maxPriorityFeePerGas": 0.01
}
```

**Legacy Response**:
```json
{
  "feePerComputeUnit": 0.1,
  "denomination": "gwei",
  "computeUnits": 300000,
  "feeAsset": "BNB",
  "fee": 0.00003,
  "timestamp": 1760553074872,
  "gasType": "legacy"
}
```

## Troubleshooting

### Transactions Not Confirming
**Problem**: Transactions stuck in pending state

**Solutions**:
1. Increase `maxFeePerGas` (EIP-1559) or `minGasPrice` (legacy)
2. Increase `maxPriorityFeePerGas` for faster inclusion
3. Comment out fixed values to use network prices

### Paying Too Much for Gas
**Problem**: Transaction fees higher than expected

**Solutions**:
1. Set explicit `maxFeePerGas` and `maxPriorityFeePerGas` values
2. Use lower values during off-peak hours
3. Check if `minGasPrice` is set too high

### Configuration Not Taking Effect
**Problem**: Changes to config file not reflected in transactions

**Solutions**:
1. Restart Gateway after changing config files
2. Check that values are **not commented out** (no `#` at start of line)
3. Verify config file location: `conf/chains/ethereum/{network}.yml`

## Best Practices

1. **Always test with small amounts first** when changing gas configurations
2. **Monitor network conditions** before setting fixed gas prices
3. **Use block explorers** to verify actual gas prices paid
4. **Set appropriate minimums** to balance cost and reliability
5. **Document your strategy** in config file comments
6. **Review periodically** as network conditions change

## References

- [EIP-1559 Specification](https://eips.ethereum.org/EIPS/eip-1559)
- [Ethereum Gas Tracker](https://etherscan.io/gastracker)
- [Base Gas Tracker](https://basescan.org/gastracker)
- Gateway API Docs: `http://localhost:15888/docs`
