# Helius RPC Provider Live Testing Scripts

This directory contains comprehensive testing scripts for the Helius RPC provider integration. These scripts use real API keys and endpoints for thorough QA testing.

## Prerequisites

1. **Gateway Server Running**
   ```bash
   pnpm start --passphrase=test123 --dev
   ```

2. **Valid Helius API Key**
   - Ensure `conf/rpc/helius.yml` contains a valid API key
   - Get your API key from [helius.dev](https://helius.dev)

3. **Required Dependencies**
   ```bash
   npm install axios ws js-yaml chalk @solana/web3.js
   ```

## Testing Scripts

### 1. Helius Integration Test (`test-helius-live.js`)

Comprehensive test of all Helius features with real API endpoints.

```bash
node scripts/test-helius-live.js
```

**Tests:**
- ✅ Helius RPC Connection
- ✅ WebSocket Real-time Monitoring 
- ✅ Balance Fetching via Helius
- ✅ Token List Loading
- ✅ Priority Fee Estimation
- ✅ Direct Helius RPC Methods
- ✅ Transaction Monitoring Setup
- ✅ Performance vs Standard RPC

**Expected Output:**
```
🚀 Helius Live Integration Tests

[INFO] Running: Helius RPC Connection
[✓] Helius RPC Connection - PASSED (245ms)
[INFO] Running: Helius WebSocket Connection
[✓] WebSocket connected successfully
[✓] Helius WebSocket Connection - PASSED (1.2s)
...

📊 Test Summary
✓ Passed: 8
✗ Failed: 0
Total: 8
```

### 2. Provider Switching Test (`test-provider-switching.js`)

Tests dynamic switching between URL and Helius providers.

```bash
node scripts/test-provider-switching.js
```

**Tests:**
- ✅ Current Provider Configuration
- ✅ Switch Devnet to Helius
- ✅ Switch Mainnet to URL
- ✅ Invalid Provider Configuration
- ✅ Missing Helius Configuration
- ✅ Provider Performance Comparison
- ✅ Configuration Schema Validation

**Key Features:**
- Temporarily modifies configs (auto-restores)
- Tests error handling for invalid configs
- Validates schema compliance
- Measures performance differences

### 3. Performance Benchmark (`test-helius-performance.js`)

Detailed performance analysis comparing Helius vs standard RPC.

```bash
# Basic benchmark
node scripts/test-helius-performance.js

# Custom parameters
node scripts/test-helius-performance.js --iterations=20 --concurrent=5
```

**Benchmarks:**
- 🏁 Balance Fetching Performance
- 🏁 Token List Loading
- 🏁 Concurrent Request Handling
- 🏁 Direct RPC Call Performance  
- 🏁 Priority Fee Estimation

**Sample Output:**
```
🏁 Helius Performance Benchmark Suite

[PERF] Helius Balance Fetching Performance Stats:
  Average: 189.3ms
  Median:  185.0ms
  Min:     156.0ms
  Max:     245.0ms
  95th:    238.0ms
  99th:    245.0ms

[✓] Performance improvement: 34.2%

💡 Recommendations
✓ Helius shows better performance for balance fetching
✓ Helius RPC endpoints are faster than standard
✓ Helius provider shows good reliability
```

## Testing Scenarios

### Scenario 1: Fresh Setup Validation
```bash
# 1. Clean install
rm -rf conf/
pnpm run setup

# 2. Verify RPC provider options are presented
# 3. Test both providers
node scripts/test-provider-switching.js
```

### Scenario 2: Performance Validation
```bash
# 1. Run comprehensive performance tests
node scripts/test-helius-performance.js --iterations=15

# 2. Verify improvements
# - Expect 30-50% faster response times
# - Lower error rates
# - Better concurrent handling
```

### Scenario 3: Live Integration Testing
```bash
# 1. Test all Helius features
node scripts/test-helius-live.js

# 2. Check server logs for:
#    - "Connecting to Helius WebSocket (mainnet) endpoint"
#    - "Connected to Helius WebSocket for transaction monitoring"
#    - "Starting Helius Sender connection warming"

# 3. Verify no API key exposure in logs
```

### Scenario 4: Error Handling Validation
```bash
# 1. Test with invalid API key
echo "apiKey: 'invalid-key'" > conf/rpc/helius.yml
node scripts/test-helius-live.js
# Should gracefully fallback to standard RPC

# 2. Test missing config
rm conf/rpc/helius.yml
# Server should handle missing config gracefully
```

## Expected Performance Improvements

When using Helius provider, expect:

| Metric | Improvement | Notes |
|--------|-------------|-------|
| **Balance Fetching** | 30-50% faster | Optimized RPC endpoints |
| **Token List Loading** | 15-25% faster | Cached responses |
| **Concurrent Requests** | 40-60% better | Higher rate limits |
| **Priority Fees** | Real-time data | More accurate estimation |
| **WebSocket Monitoring** | Real-time | vs polling-based |

## Troubleshooting

### Common Issues

1. **WebSocket 401 Errors**
   ```
   Error: Unexpected server response: 401
   ```
   - Check API key in `conf/rpc/helius.yml`
   - Ensure key has WebSocket permissions

2. **Config Not Loading**
   ```
   Error: Configuration paths must have at least two components
   ```
   - Restart Gateway server after config changes
   - Verify `conf/rpc/helius.yml` exists

3. **Performance Not Improving**
   - Verify mainnet is using Helius (`rpcProvider: 'helius'`)
   - Check API key is valid and has rate limit headroom
   - Compare same operations (mainnet vs mainnet, not mainnet vs devnet)

### Debug Mode

Enable debug logging:
```bash
# Set log level to debug in server config
# Check logs for detailed Helius service initialization
tail -f logs/logs_gateway_app.log | grep -i helius
```

## QA Checklist

- [ ] All integration tests pass (`test-helius-live.js`)
- [ ] Provider switching works (`test-provider-switching.js`) 
- [ ] Performance improvements confirmed (`test-helius-performance.js`)
- [ ] WebSocket connections establish successfully
- [ ] No API keys logged in clear text
- [ ] Error handling works for invalid configs
- [ ] Backward compatibility maintained
- [ ] Server restarts cleanly with new configs
- [ ] Schema validation prevents invalid configurations
- [ ] Both devnet (URL) and mainnet (Helius) work simultaneously

## Security Notes

⚠️ **Important**: These scripts use real API keys and make actual network requests.

- Scripts automatically mask API keys in output
- Test data uses read-only operations
- No private keys or transactions are involved
- API keys are loaded from config files, not hardcoded

## Support

For issues with these testing scripts:
1. Check Gateway server is running and accessible
2. Verify Helius API key is valid and has sufficient quota
3. Ensure all dependencies are installed
4. Review server logs for detailed error messages