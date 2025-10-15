# Ethereum Gas Configuration Guide

This guide explains how to configure gas settings for Ethereum and EVM-compatible networks in Gateway.

## Overview

Gateway supports two types of gas pricing models:

1. **EIP-1559** (Type 2 transactions) - Used by modern networks like Ethereum Mainnet, Base, Polygon, Arbitrum, Optimism
2. **Legacy** (Type 0 transactions) - Used by older networks like BSC, Avalanche, Celo

## Configuration Files

### Network Configuration
Gas settings are configured per network in `conf/chains/ethereum/{network}.yml`:

```yaml
chainID: 8453
nodeURL: https://mainnet.base.org
nativeCurrencySymbol: ETH
minGasPrice: 0.01

# EIP-1559 gas parameters (in GWEI)
# If not set, will fetch from Etherscan API (if etherscanAPIKey is set in ethereum.yml) or network RPC
# maxFeePerGas: 0.01
# maxPriorityFeePerGas: 0.01
```

### Chain Configuration
Etherscan API key is configured once for all networks in `conf/chains/ethereum/ethereum.yml`:

```yaml
defaultNetwork: mainnet
defaultWallet: default_wallet
rpcProvider: standard

# Etherscan API key for gas price estimates across all supported networks
# Get your free API key from https://etherscan.io/myapikey
# Works for Ethereum, Polygon, BSC (not available for Base, Arbitrum, Optimism)
etherscanAPIKey: 'YOUR_ETHERSCAN_API_KEY_HERE'
```

## Gas Parameters Explained

### Common Parameters (All Networks)

#### `minGasPrice` (GWEI)
- **Purpose**: Sets a minimum floor for gas prices
- **Applies to**: Both EIP-1559 and legacy networks
- **Default**: Value stored in network-specific template (e.g., `src/templates/chains/ethereum/mainnet.yml`)
- **Behavior**:
  - For EIP-1559: Ensures `maxFeePerGas` doesn't go below this value
  - For legacy: Ensures `gasPrice` doesn't go below this value
- **Use case**: Prevent transactions from using extremely low gas prices that may not confirm

### Chain Parameters (ethereum.yml)

#### `etherscanAPIKey` (String)
- **Purpose**: API key for Etherscan V2 API gas price estimates (gastracker module)
- **Location**: Set once in `conf/chains/ethereum/ethereum.yml` (not in individual network configs)
- **Optional**: If not set, uses standard RPC provider for gas estimates
- **Applies to**: Networks with Etherscan gastracker support:
  - ✅ **Ethereum Mainnet** (chainID: 1)
  - ✅ **Polygon** (chainID: 137)
  - ✅ **BSC** (chainID: 56)
  - ❌ Base (chainID: 8453) - gastracker not available, automatically falls back to RPC
  - ❌ Arbitrum (chainID: 42161) - gastracker not available, automatically falls back to RPC
  - ❌ Optimism (chainID: 10) - gastracker not available, automatically falls back to RPC
- **Benefit**: More accurate priority fee estimates compared to RPC providers
- **Where to get key**: [Etherscan API Keys](https://etherscan.io/myapikey) (free tier: 5 calls/second)
- **Note**: Single API key works across all supported chains via Etherscan V2 API

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
**Config** (example for Base):
```yaml
minGasPrice: 0.01
# maxFeePerGas: 0.01         # Commented out
# maxPriorityFeePerGas: 0.01 # Commented out
```

**Behavior**:
- Fetches current gas prices from the network
- Adapts to real-time network conditions
- May pay higher fees during congestion
- Respects `minGasPrice` as a floor

**Best for**: Production environments where reliability is critical

### Strategy 2: Fixed Low Fees
**Config** (example for Base):
```yaml
minGasPrice: 0.01
maxFeePerGas: 0.01
maxPriorityFeePerGas: 0.01
```

**Behavior**:
- Always uses your configured values
- Predictable, low-cost transactions
- May be slower during high congestion
- Risk: Transactions may not confirm if fees too low

**Best for**: Development, testing, or low-priority operations

### Strategy 3: Use Etherscan API (Recommended for Supported Networks)
**Config in ethereum.yml**:
```yaml
etherscanAPIKey: 'YOUR_ETHERSCAN_API_KEY'
```

**Config in network.yml** (example for Ethereum Mainnet):
```yaml
minGasPrice: 1.0
# maxFeePerGas: 10           # Commented out - fetch from Etherscan
# maxPriorityFeePerGas: 2    # Commented out - fetch from Etherscan
```

**Behavior**:
- Fetches accurate gas prices from Etherscan V2 API (gastracker module)
- More reliable priority fee estimates than RPC providers
- Works for Ethereum Mainnet, Polygon, and BSC
- Automatically falls back to RPC for unsupported chains or on API failure
- Respects `minGasPrice` as a floor

**Best for**: Production environments on supported networks (Ethereum, Polygon, BSC)

**Why use this**:
- RPC providers sometimes return inaccurate priority fees
- Single API key works across all supported chains
- Etherscan gastracker provides real-time data from block explorers
- Free tier sufficient for most use cases (5 calls/second)

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

### Ethereum Mainnet (With Etherscan API - Recommended)
**ethereum.yml**:
```yaml
etherscanAPIKey: 'YOUR_ETHERSCAN_API_KEY'
```

**mainnet.yml**:
```yaml
chainID: 1
nodeURL: https://eth.llamarpc.com
nativeCurrencySymbol: ETH
minGasPrice: 1.0
# maxFeePerGas: 10           # Commented out - fetch from Etherscan
# maxPriorityFeePerGas: 2    # Commented out - fetch from Etherscan
```
- ✅ Mainnet fees vary significantly
- ✅ Etherscan gastracker provides accurate real-time gas oracle data
- ✅ Set higher `minGasPrice` to ensure confirmation
- ✅ Single API key works across all supported chains

### Polygon (With Etherscan API - Recommended)
**ethereum.yml**:
```yaml
etherscanAPIKey: 'YOUR_ETHERSCAN_API_KEY'
```

**polygon.yml**:
```yaml
chainID: 137
nodeURL: https://rpc.ankr.com/polygon
nativeCurrencySymbol: POL
minGasPrice: 10
# maxFeePerGas: 10           # Commented out - fetch from Etherscan
# maxPriorityFeePerGas: 10   # Commented out - fetch from Etherscan
```
- ✅ Polygon has higher gas prices than Ethereum in GWEI terms
- ✅ Etherscan gastracker provides accurate priority fee estimates
- ✅ Same API key used for Ethereum Mainnet works here

### Base Network (No Etherscan API Support)
**base.yml**:
```yaml
chainID: 8453
nodeURL: https://mainnet.base.org
nativeCurrencySymbol: ETH
minGasPrice: 0.01
# maxFeePerGas: 0.01         # Commented out - fetch from RPC
# maxPriorityFeePerGas: 0.01 # Commented out - fetch from RPC
```
- ❌ Base does not support Etherscan gastracker module
- ✅ Automatically falls back to RPC provider for gas estimates
- ⚠️ Base RPC may report inaccurate priority fees (e.g., 1.5 GWEI when actual is <0.001)
- ✅ Base typically has very low fees (0.01 GWEI minimum)

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

### EIP-1559 Transaction Logs (With Etherscan API - Supported Networks)
```
2025-10-15 11:16:22 | info | ✅ Etherscan V2 API configured for mainnet (chainId: 1, key length: 34 chars)
2025-10-15 11:16:22 | info | Etherscan mainnet: baseFee=1.2500 GWEI, priority (safe/propose/fast)=0.5/1.0/2.0 GWEI
2025-10-15 11:16:22 | info | Etherscan API EIP-1559 fees: baseFee≈1.2500 GWEI, maxFee=3.5000 GWEI, priority=1.0000 GWEI
2025-10-15 11:16:22 | info | Using network EIP-1559 fees: maxFee=3.5000 GWEI, priority=1.0000 GWEI
2025-10-15 11:16:22 | info | Estimated: 3.5 GWEI for network mainnet
```

### EIP-1559 Transaction Logs (RPC Fallback - Unsupported Networks)
```
2025-10-15 10:34:01 | info | Network RPC EIP-1559 fees: baseFee=0.0004 GWEI, maxFee=0.0104 GWEI, priority=0.0100 GWEI
2025-10-15 10:34:01 | info | Using network EIP-1559 fees: maxFee=0.0104 GWEI, priority=0.0100 GWEI
2025-10-15 10:34:01 | info | Estimated: 0.01 GWEI for network base
```
Note: Base does not support Etherscan gastracker and automatically uses RPC. The minGasPrice floor (0.01 GWEI) is applied to ensure minimum confirmation.

### Legacy Transaction Logs
```
2025-10-15 10:45:49 | info | Network legacy gas price: 1.5000 GWEI
2025-10-15 10:45:49 | info | Using configured minimum gas price: 3.0 GWEI (network: 1.5000 GWEI)
2025-10-15 10:45:49 | info | Estimated: 3.0 GWEI for network bsc
```
Note: BSC uses legacy gas pricing. The minGasPrice (3.0 GWEI) ensures transactions meet BSC's recommended minimum.

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

**EIP-1559 Response** (Base network):
```json
{
  "feePerComputeUnit": 0.01,
  "denomination": "gwei",
  "computeUnits": 300000,
  "feeAsset": "ETH",
  "fee": 0.000003,
  "timestamp": 1760553074872,
  "gasType": "eip1559",
  "maxFeePerGas": 0.01,
  "maxPriorityFeePerGas": 0.01
}
```

**Legacy Response** (BSC network):
```json
{
  "feePerComputeUnit": 3.0,
  "denomination": "gwei",
  "computeUnits": 300000,
  "feeAsset": "BNB",
  "fee": 0.0009,
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
4. **Recommended**: Add `etherscanAPIKey` to ethereum.yml for more accurate gas estimates (if using Ethereum, Polygon, or BSC)

### Paying Too Much for Gas
**Problem**: Transaction fees higher than expected

**Solutions**:
1. Set explicit `maxFeePerGas` and `maxPriorityFeePerGas` values
2. Use lower values during off-peak hours
3. Check if `minGasPrice` is set too high
4. **Recommended**: Use `etherscanAPIKey` - RPC providers may overestimate fees

### Inaccurate Priority Fees from RPC
**Problem**: RPC returns inflated priority fees (e.g., 1.5 GWEI when actual is 0.001 GWEI)

**Solutions**:
1. Add `etherscanAPIKey` to `conf/chains/ethereum/ethereum.yml`
2. Check logs for "✅ Etherscan V2 API configured" message
3. Verify API key is valid (get free key from https://etherscan.io/myapikey)
4. Check logs show "Etherscan API EIP-1559 fees" instead of "Network RPC EIP-1559 fees"
5. **Note**: Only Ethereum, Polygon, and BSC support Etherscan gastracker; other chains automatically fall back to RPC

### Configuration Not Taking Effect
**Problem**: Changes to config file not reflected in transactions

**Solutions**:
1. Restart Gateway after changing config files
2. Check that values are **not commented out** (no `#` at start of line)
3. Verify config file locations:
   - Network settings: `conf/chains/ethereum/{network}.yml`
   - Etherscan API key: `conf/chains/ethereum/ethereum.yml`
4. For `etherscanAPIKey`: Check logs for "✅ Etherscan V2 API configured" message

### Etherscan API Not Working
**Problem**: Logs show "Failed to fetch from Etherscan API"

**Solutions**:
1. Verify API key is correct and not expired
2. Check rate limits (free tier: 5 calls/second)
3. Ensure network is supported (only Ethereum, Polygon, BSC support gastracker)
4. For unsupported networks (Base, Arbitrum, Optimism), Gateway automatically falls back to RPC

## Best Practices

1. **Always test with small amounts first** when changing gas configurations
2. **Use `etherscanAPIKey` for production** - More accurate than RPC for supported networks (Ethereum, Polygon, BSC)
3. **Get free API key** from Etherscan (works across all supported chains with single key)
4. **Monitor network conditions** before setting fixed gas prices
5. **Use block explorers** to verify actual gas prices paid
6. **Set appropriate minimums** to balance cost and reliability
7. **Document your strategy** in config file comments
8. **Review periodically** as network conditions change
9. **Check logs** to confirm which gas source is being used (API vs RPC)
10. **Understand chain support** - Only Ethereum, Polygon, and BSC support Etherscan gastracker; other chains use RPC

## API Key Setup Guide

### Step 1: Get Etherscan API Key
Get a free API key from Etherscan (works for all supported chains):

- **Get key**: [Etherscan API Keys](https://etherscan.io/myapikey)
- **Free tier**: 5 calls/second
- **Works for**: Ethereum Mainnet, Polygon, BSC (via Etherscan V2 API)
- **Not needed for**: Base, Arbitrum, Optimism (these chains don't support Etherscan gastracker and automatically fall back to RPC)

### Step 2: Add to Chain Config
Edit `conf/chains/ethereum/ethereum.yml` (NOT individual network configs):

```yaml
# Add or uncomment this line
etherscanAPIKey: 'YOUR_ETHERSCAN_API_KEY_HERE'
```

**Note**: Single API key works across all supported chains (Ethereum, Polygon, BSC) via Etherscan V2 API.

### Step 3: Restart Gateway
```bash
pnpm start --passphrase=<PASSPHRASE>
```

### Step 4: Verify in Logs
When using a supported network (Ethereum, Polygon, BSC), look for:
```
✅ Etherscan V2 API configured for {network} (chainId: X, key length: XX chars)
```

When using an unsupported network (Base, Arbitrum, Optimism), you'll see:
```
Etherscan API not supported for chainId: XXXX
```
(This is normal - these chains automatically fall back to RPC)

## References

- [EIP-1559 Specification](https://eips.ethereum.org/EIPS/eip-1559)
- [Etherscan Gas Tracker](https://etherscan.io/gastracker) - Ethereum Mainnet
- [Polygon Gas Tracker](https://polygonscan.com/gastracker)
- [BSC Gas Tracker](https://bscscan.com/gastracker)
- [Etherscan V2 API Migration Guide](https://docs.etherscan.io/v2-migration)
- [Etherscan Gas Tracker API Documentation](https://docs.etherscan.io/api-endpoints/gas-tracker)
- [Etherscan Supported Chains](https://docs.etherscan.io/supported-chains)
- Gateway API Docs: `http://localhost:15888/docs`
