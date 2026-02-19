# Adding New Tokens and Pools to Gateway

This cheatsheet guide explains how to enable the Hummingbot Gateway to interact with new tokens and liquidity pools on PancakeSwap BSC. Follow these steps when adding support for a new token or pool to the `pancakeswap_manage_lp_position.py` script.

## Prerequisites

- Hummingbot Gateway running on `http://localhost:15888`
- Web3-enabled browser with MetaMask or similar wallet connected to BSC
- Wallet with sufficient BNB for gas fees (~0.01 BNB per approval transaction)
- Token contract address and pool address for the new assets

## Quick Overview

Three key steps are required:

1. **Register Token with Gateway** (if new token not yet registered)
2. **Grant ERC-20 Token Approval** (allow gateway to spend tokens)
3. **Grant Router Approval** (allow swaps via PancakeSwap V3)

---

## Step 1: Register Token with Gateway

### When This Is Needed

Gateway returns `HTTP 400: Token information not found` error when fetching pool info.

### Via Gateway Endpoint (Recommended)

```bash
# Register new token via gateway endpoint
curl -X POST "http://localhost:15888/tokens/save/[TOKEN_ADDRESS]" \
  -H "Content-Type: application/json" \
  -d '{
    "network": "ethereum-bsc",
    "address": "[TOKEN_ADDRESS]",
    "symbol": "CAKE",
    "name": "CAKE Token",
    "decimals": 6
  }'
```

### Via Manual Configuration (Alternative)

1. Stop Hummingbot Gateway
2. Edit `~/.hummingbot/gateway/config.yml`
3. Add token to the `bsc` chain configuration:

```yaml
chains:
  bsc:
    tokens:
      - address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82"
        symbol: "CAKE"
        name: "CAKE Token"
        decimals: 6
```

1. Save and restart Gateway

### Verify Token Registration

```bash
# Check if token was registered successfully
curl "http://localhost:15888/chains/bsc/tokens?search=CAKE"

# Or get pool info (should no longer return HTTP 400)
curl "http://localhost:15888/connectors/pancakeswap/clmm/pool-info?network=bsc&poolAddress=0x7f51c8aaa6b0599abd16674e2b17fec7a9f674a1"
```

---

## Step 2: Grant ERC-20 Token Approval

Gateway needs permission to spend tokens on your behalf. This is a standard ERC-20 approval transaction.

### Steps to Approve Token Spending

**For Each Token in the Pool:**

1. Navigate to the token contract on BSCScan:
   - Go to `https://bscscan.com/address/[TOKEN_ADDRESS]`
   - Example: `https://bscscan.com/address/0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c`

2. Click the **Contract** tab, then find **Write Contract**

3. Click **Connect to Web3** button
   - Select MetaMask (or your Web3 wallet)
   - Approve the wallet connection
   - **Important**: Use the same wallet address configured in the script

4. Find the `approve` function (usually function #1 in the list)

5. Enter the approval parameters:
   - **spender**: Gateway contract address
     - Default for BSC: `0xEfF92A263d31888d860bD50809A8D171709b7b1c` (PancakeSwap Router)
     - Or ask Hummingbot team for the correct address
   - **amount**: Approval amount
     - Unlimited (recommended): `115792089237316195423570985008687907853269984665640564039457584007913129639935` (max uint256)
     - Or specific amount: `(desired_amount) × 10^(decimals)`
     - Example for 1,000,000 CAKE with 6 decimals: `1000000000000`

6. Click **Write** button

7. MetaMask will prompt to confirm the transaction
   - Review gas fee
   - Click **Confirm** to execute approval

8. Wait for transaction confirmation (~10-30 seconds)
   - Look for checkmark in MetaMask: "Approval confirmed"

### Verify Approval Was Granted

```bash
# Check the approval amount in the contract
curl "http://localhost:15888/chains/bsc/tokens/[TOKEN_ADDRESS]/allowance"

# Should return a number > 0 (approval granted)
```

---

## Step 3: Grant Pancakeswap V3 Swap Router Approval (For Token Swaps)

**CRITICAL**: The swap router is DIFFERENT from the liquidity router. This approval is required only if the script performs token rebalancing swaps.

### When This Is Needed

If you see gateway error: `"Insufficient allowance for [TOKEN]. To swap with PancakeSwap CLMM, you need to approve the spender 'pancakeswap/clmm/swap'"`

### Steps for Swap Router Approval

1. Navigate to each token contract on BSCScan:
   - Example: `https://bscscan.com/address/0xdA7AD9dea9397cffdDAE2F8a052B82f1484252B3` (CAKE)

2. Click **Contract** tab → **Write Contract** → **Connect to Web3**

3. Find the `approve` function

4. Enter the swap router parameters:
   - **spender**: Pancakeswap SwapRouter02
     - BSC Mainnet: `0x1b81D678ffb9C0263b24A97847620C99d213eB14`
   - **amount**: Max uint256 (unlimited): `115792089237316195423570985008687907853269984665640564039457584007913129639935`

5. Click **Write** and confirm transaction in MetaMask

**Do this for BOTH tokens** in the pool:

- Base token (e.g., CAKE)
- Quote token (e.g., USDT)

### Summary of Approvals Needed

| Operation | Spender | Address | Required |
|-----------|---------|---------|----------|
| **Add Liquidity** | PancakeSwap V3 Router | `0xEfF92A263d31888d860bD50809A8D171709b7b1c` | ✅ YES |
| **Swap Tokens** | PancakeSwap SwapRouter02 | `0x1b81D678ffb9C0263b24A97847620C99d213eB14` | ✅ YES (if rebalancing) |
| **Stake LP NFT** | MasterChef V3 | `0x556B9306565093C855AEA9AE92A594704c2Cd59e` | ❌ OPTIONAL |

**Important**: Approve BOTH spenders for each token to ensure all operations work:

- One approval for router address ending in `3d7b1c` (liquidity)
- One approval for SwapRouter02 address ending in `3eB14` (swaps)

---

## Step 4: Grant LP NFT Approval for Staking (Optional)

If the script stakes LP positions in MasterChef for rewards (optional feature):

1. Navigate to PancakeSwap V3 NonfungiblePositionManager:
   - `https://bscscan.com/address/0x46A15B0b27311cedF172AB29E4f4766fbE7F4364`

2. Click **Contract** → **Write Contract** → **Connect to Web3**

3. Find the `setApprovalForAll` function

4. Enter parameters:
   - **operator**: PancakeSwap MasterChef V3
     - BSC Mainnet: `0x556B9306565093C855AEA9AE92A594704c2Cd59e`
   - **approved**: `true`

5. Click **Write** and confirm transaction in MetaMask

**Note**: This is optional. If staking fails, the script continues without staking (non-blocking).

---

## Complete Workflow Example: CAKE-USDT Pool

### Scenario

Adding new token CAKE (`0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82`) and enabling CAKE-USDT LP pool.

### Checklist

- [ ] **Token Registration**
  - Register CAKE with gateway using Step 1
  - Restart gateway
  - Verify pool-info returns data (no HTTP 400)

- [ ] **Liquidity Token Approvals**
  - Approve CAKE for liquidity router `0xEfF92A263d31888d860bD50809A8D171709b7b1c` (Step 2)
  - Approve USDT for liquidity router `0x55d398326f99059fF775485246999027B3197955` (Step 2)

- [ ] **Swap Router Approval (CRITICAL for rebalancing)**
  - Approve CAKE for swap router `0x1b81D678ffb9C0263b24A97847620C99d213eB14` (Step 3)
  - Approve USDT for swap router `0x55d398326f99059fF775485246999027B3197955` (Step 3)

- [ ] **Staking Approval (Optional)**
  - Approve MasterChef V3 via NonfungiblePositionManager (Step 4)

- [ ] **Verify Configuration**
  - Update script config with:
    - `lp_pool_address`: `0x7f51c8aaa6b0599abd16674e2b17fec7a9f674a1`
    - `wallet_address`: Your wallet address
  - Check gateway is running: `curl http://localhost:15888/health`

- [ ] **Test Script**
  - Run: `hummingbot -s pancakeswap_manage_lp_position`
  - Monitor logs for successful:
    - Pool info fetch
    - Wallet balance fetch
    - Token rebalancing swap (if portfolio imbalanced)
    - Position opening

---

## Troubleshooting

### Error: "Insufficient allowance for [TOKEN]... approve the spender 'pancakeswap/clmm/swap'"

- **Cause**: Missing approval for swap router (SwapRouter02) - this is different from liquidity router
- **Solution**: Complete Step 3 (grant swap router approval for `0x1b81D678ffb9C0263b24A97847620C99d213eB14`)
- **Note**: You need BOTH approvals:
  1. Liquidity router (`0xEfF92A263d31888d860bD50809A8D171709b7b1c`) for adding liquidity
  2. Swap router (`0x1b81D678ffb9C0263b24A97847620C99d213eB14`) for rebalancing swaps

### Error: "HTTP 400: Token information not found"

- **Cause**: Token not registered with gateway
- **Solution**: Complete Step 1 (register token) and restart gateway

### Error: "Insufficient allowance" during swap

- **Cause**: Gateway doesn't have permission to spend token
- **Solution**: Complete Step 2 (grant token approval) and verify allowance

### Error: "Unapproved for transfer" in position opening

- **Cause**: Missing token approval
- **Solution**: Approve token spending via BSCScan (Step 2)

### Error: "Router approval missing" for swaps

- **Cause**: Missing Pancakeswap V3 router approval
- **Solution**: Complete Step 3 (grant router approval)

### Error: "Cannot stake" position

- **Cause**: Missing MasterChef approval (optional)
- **Solution**: Complete Step 4, or script will continue without staking

### Error: "Transaction failed - out of gas"

- **Cause**: Insufficient BNB for gas fees
- **Solution**: Add more BNB to wallet (minimum 0.05 BNB recommended)

### Error: "Gateway connection refused"

- **Cause**: Gateway not running or wrong port
- **Solution**:
  
  ```bash
  # Check gateway status
  curl http://localhost:15888/health
  
  # If no response, start gateway:
  # (depends on how you installed it)
  ```

---

## Important Security Notes

- **Only approve what you need**: Approve specific amounts or only what you plan to use
- **Verify addresses carefully**: Double-check token and router addresses before approving
- **Use trusted wallets**: Connect from secure devices only
- **Monitor approvals**: Consider revoking old approvals via revoke.cash
- **Never share private keys**: Never paste your seed phrase or private keys anywhere
- **Network verification**: Always confirm you're on BSC Mainnet (Chain ID 56), not testnet

---

## Testing Approvals Before Running Script

Test that approvals are working without running the full script:

```bash
# 1. Check pool info endpoint (confirms token registration)
curl "http://localhost:15888/connectors/pancakeswap/clmm/pool-info?network=bsc&poolAddress=0x7f51c8aaa6b0599abd16674e2b17fec7a9f674a1"

# 2. Check token allowance (confirms approval granted)
curl "http://localhost:15888/chains/bsc/tokens/0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82/allowance"

# 3. Check wallet balances (confirms gateway access)
curl "http://localhost:15888/chains/bsc/balances"

# All three should return data without errors (HTTP 200)
```

---

## Contract Addresses Reference (BSC Mainnet)

| Component | Address | Purpose |
|-----------|---------|---------|
| **PancakeSwap V3 Router** | `0xEfF92A263d31888d860bD50809A8D171709b7b1c` | Adding liquidity to pools |
| **PancakeSwap SwapRouter02** | `0x1b81D678ffb9C0263b24A97847620C99d213eB14` | Token swaps for rebalancing |
| **NonfungiblePositionManager** | `0x46A15B0b27311cedF172AB29E4f4766fbE7F4364` | Managing LP NFTs |
| **MasterChef V3** | `0x556B9306565093C855AEA9AE92A594704c2Cd59e` | Staking LP NFTs for rewards |
| **USDT Token** | `0x55d398326f99059fF775485246999027B3197955` | Test token |
| **CAKE Token** | `0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82` | CAKE token |

---

## Additional Resources

- **PancakeSwap V3 Docs**: https://docs.pancakeswap.finance/
- **BSCScan Explorer**: https://bscscan.com/
- **Hummingbot Gateway Docs**: https://docs.hummingbot.org/gateway/
- **View Approvals**: https://revoke.cash/ (manage and revoke approvals)
- **Test Your Pool**: https://pancakeswap.finance/ (swap interface for testing)
