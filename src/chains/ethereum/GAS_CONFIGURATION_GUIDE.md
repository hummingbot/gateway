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
# If not set, will fetch from network (or from scanAPIKey if provided)
# maxFeePerGas: 0.1
# maxPriorityFeePerGas: 0.01

# BaseScan API key for more accurate gas estimates (optional)
# Get your key from https://basescan.org/myapikey
# scanAPIKey: 'YOUR_BASESCAN_API_KEY_HERE'
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

#### `scanAPIKey` (String)
- **Purpose**: API key for Etherscan-compatible block explorer gas price APIs
- **Optional**: If not set, uses standard RPC provider for gas estimates
- **Applies to**: EIP-1559 networks only (mainnet, base, polygon, arbitrum, optimism)
- **Benefit**: More accurate priority fee estimates compared to RPC providers
- **Where to get keys**:
  - Mainnet: https://etherscan.io/myapikey
  - Base: https://basescan.org/myapikey
  - Polygon: https://polygonscan.com/myapikey
  - Arbitrum: https://arbiscan.io/myapikey
  - Optimism: https://optimistic.etherscan.io/myapikey
- **Note**: API keys are free, but rate-limited. Consider paid plans for high-volume usage

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

### Strategy 3: Use Etherscan API (Recommended for EIP-1559)
**Config**:
```yaml
minGasPrice: 0.1
# maxFeePerGas: 0.1          # Commented out
# maxPriorityFeePerGas: 0.01 # Commented out
scanAPIKey: 'YOUR_API_KEY_HERE'
```

**Behavior**:
- Fetches accurate gas prices from block explorer APIs
- More reliable priority fee estimates than RPC
- Automatically falls back to RPC if API fails
- Respects `minGasPrice` as a floor

**Best for**: Production environments on EIP-1559 networks (mainnet, base, polygon, arbitrum, optimism)

**Why use this**:
- RPC providers sometimes return inaccurate priority fees
- Example: Base RPC may report 1.5 GWEI when actual is <0.001 GWEI
- Etherscan APIs provide real-time data from block explorers

### Strategy 4: Hybrid Approach
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

### Base Network (Recommended)
```yaml
chainID: 8453
nodeURL: https://mainnet.base.org
nativeCurrencySymbol: ETH
minGasPrice: 0.1
# maxFeePerGas: 0.1          # Commented out - fetch from API
# maxPriorityFeePerGas: 0.01 # Commented out - fetch from API
scanAPIKey: 'YOUR_BASESCAN_API_KEY'
```
- Base typically has very low fees
- BaseScan API provides accurate priority fees (often <0.001 GWEI)
- Transactions confirm quickly with API-sourced estimates
- **Why API**: RPC may report incorrect 1.5 GWEI priority fee

### Ethereum Mainnet (With Etherscan API)
```yaml
chainID: 1
nodeURL: https://eth.llamarpc.com
nativeCurrencySymbol: ETH
minGasPrice: 1.0
# maxFeePerGas: 10
# maxPriorityFeePerGas: 2
scanAPIKey: 'YOUR_ETHERSCAN_API_KEY'
```
- Mainnet fees vary significantly
- Etherscan API provides real-time gas oracle data
- Set higher `minGasPrice` to ensure confirmation
- Falls back to RPC if API unavailable

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

### EIP-1559 Transaction Logs (With Etherscan API)
```
2025-10-15 11:16:22 | info | ✅ Etherscan API configured for base (key length: 34 chars)
2025-10-15 11:16:22 | info | Etherscan base: baseFee=0.0050 GWEI, priority (safe/propose/fast)=0.001/0.001/0.002 GWEI
2025-10-15 11:16:22 | info | Etherscan API EIP-1559 fees: baseFee≈0.0495 GWEI, maxFee=0.1000 GWEI, priority=0.0010 GWEI
2025-10-15 11:16:22 | info | Using network EIP-1559 fees: maxFee=0.1000 GWEI, priority=0.0010 GWEI
2025-10-15 11:16:22 | info | Estimated: 0.1 GWEI for network base
```

### EIP-1559 Transaction Logs (RPC Fallback)
```
2025-10-15 10:34:01 | info | Failed to fetch from Etherscan API: timeout, falling back to RPC
2025-10-15 10:34:01 | info | Network RPC EIP-1559 fees: baseFee=0.0049 GWEI, maxFee=1.5097 GWEI, priority=1.5000 GWEI
2025-10-15 10:34:01 | info | Using network EIP-1559 fees: maxFee=1.5097 GWEI, priority=1.5000 GWEI
2025-10-15 10:34:01 | info | Estimated: 1.5097 GWEI for network base
```

### Legacy Transaction Logs
```
2025-10-15 10:45:49 | info | Network legacy gas price: 0.0500 GWEI
2025-10-15 10:45:49 | info | Using configured minimum gas price: 0.1 GWEI (network: 0.0500 GWEI)
2025-10-15 10:45:49 | info | Estimated: 0.1 GWEI for network bsc
```

The logs show:
1. **Source**: Whether using Etherscan API or RPC provider
2. **Network values**: What the network/API currently reports
3. **Configured values**: What you've set in config (if any)
4. **Used values**: What will actually be used for transactions

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
4. **Recommended**: Add `scanAPIKey` for more accurate gas estimates

### Paying Too Much for Gas
**Problem**: Transaction fees higher than expected

**Solutions**:
1. Set explicit `maxFeePerGas` and `maxPriorityFeePerGas` values
2. Use lower values during off-peak hours
3. Check if `minGasPrice` is set too high
4. **Recommended**: Use `scanAPIKey` - RPC providers may overestimate fees

### Inaccurate Priority Fees from RPC
**Problem**: RPC returns inflated priority fees (e.g., 1.5 GWEI when actual is 0.001 GWEI)

**Solutions**:
1. Add `scanAPIKey` to your network config
2. Check logs for "Etherscan API configured" message
3. Verify API key is valid (get free key from block explorer)
4. Check logs show "Etherscan API EIP-1559 fees" instead of "Network RPC EIP-1559 fees"

### Configuration Not Taking Effect
**Problem**: Changes to config file not reflected in transactions

**Solutions**:
1. Restart Gateway after changing config files
2. Check that values are **not commented out** (no `#` at start of line)
3. Verify config file location: `conf/chains/ethereum/{network}.yml`
4. For `scanAPIKey`: Check logs for "✅ Etherscan API configured" message

### Etherscan API Not Working
**Problem**: Logs show "Failed to fetch from Etherscan API"

**Solutions**:
1. Verify API key is correct and not expired
2. Check rate limits (free tier: 5 calls/second)
3. Ensure network is supported (mainnet, base, polygon, arbitrum, optimism)
4. Gateway automatically falls back to RPC if API fails

## Best Practices

1. **Always test with small amounts first** when changing gas configurations
2. **Use `scanAPIKey` for production** - More accurate than RPC for EIP-1559 networks
3. **Get free API keys** from block explorers (Etherscan, BaseScan, etc.)
4. **Monitor network conditions** before setting fixed gas prices
5. **Use block explorers** to verify actual gas prices paid
6. **Set appropriate minimums** to balance cost and reliability
7. **Document your strategy** in config file comments
8. **Review periodically** as network conditions change
9. **Check logs** to confirm which gas source is being used (API vs RPC)

## API Key Setup Guide

### Step 1: Get API Keys
Get free API keys from these block explorers:

- **Mainnet**: [Etherscan](https://etherscan.io/myapikey)
- **Base**: [BaseScan](https://basescan.org/myapikey)
- **Polygon**: [PolygonScan](https://polygonscan.com/myapikey)
- **Arbitrum**: [Arbiscan](https://arbiscan.io/myapikey)
- **Optimism**: [Optimistic Etherscan](https://optimistic.etherscan.io/myapikey)

### Step 2: Add to Network Config
Edit `conf/chains/ethereum/{network}.yml`:

```yaml
scanAPIKey: 'YOUR_API_KEY_HERE'
```

### Step 3: Restart Gateway
```bash
pnpm start --passphrase=<PASSPHRASE>
```

### Step 4: Verify in Logs
Look for:
```
✅ Etherscan API configured for {network} (key length: XX chars)
```

## References

- [EIP-1559 Specification](https://eips.ethereum.org/EIPS/eip-1559)
- [Ethereum Gas Tracker](https://etherscan.io/gastracker)
- [Base Gas Tracker](https://basescan.org/gastracker)
- [Polygon Gas Tracker](https://polygonscan.com/gastracker)
- [Arbitrum Gas Tracker](https://arbiscan.io/gastracker)
- [Optimism Gas Tracker](https://optimistic.etherscan.io/gastracker)
- [Etherscan API Documentation](https://docs.etherscan.io/api-endpoints/gas-tracker)
- Gateway API Docs: `http://localhost:15888/docs`
