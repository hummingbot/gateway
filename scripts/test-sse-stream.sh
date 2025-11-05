#!/bin/bash

# Test Server-Sent Events streaming for WebSocket monitoring
# This script demonstrates how to consume real-time pool updates

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Testing Phase 3: Pool Monitoring via SSE                 ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if server is running
if ! curl -s http://localhost:15888/chains 2>&1 | grep -q "solana"; then
    echo "❌ Gateway server is not running on port 15888"
    echo "   Start it with: GATEWAY_PASSPHRASE=a START_SERVER=true DEV=true pnpm start"
    exit 1
fi

echo "✅ Gateway server detected"
echo ""

# Pool address - SOL-USDC Meteora DLMM pool
POOL_ADDRESS="5E4sYT75xoHs41wWv7cUKzbe8kUE6wZVB3QjhKBp3jAH"

echo "Connecting to pool monitoring stream..."
echo "Pool: $POOL_ADDRESS"
echo ""
echo "Stream will show real-time pool updates as they occur."
echo "Press Ctrl+C to stop."
echo ""
echo "─────────────────────────────────────────────────────────────"
echo ""

# Stream pool updates
curl -N "http://localhost:15888/connectors/meteora/clmm/pool-info-stream?network=mainnet-beta&poolAddress=$POOL_ADDRESS" 2>/dev/null | while IFS= read -r line; do
    # Skip empty lines and keepalive comments
    if [[ "$line" =~ ^data:\ (.*)$ ]]; then
        data="${BASH_REMATCH[1]}"

        # Pretty print JSON with color if jq is available
        if command -v jq &> /dev/null; then
            echo "$data" | jq -C '.'
        else
            echo "$data" | python3 -m json.tool
        fi

        echo "─────────────────────────────────────────────────────────────"
        echo ""
    fi
done
