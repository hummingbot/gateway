#!/bin/bash

# Test auto-subscription to Solana wallets on Gateway startup
# This script verifies that wallets in conf/wallets/solana are automatically monitored

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Testing Auto-Subscription to Solana Wallets              ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if conf/wallets/solana exists and has wallets
if [ ! -d "conf/wallets/solana" ]; then
    echo "❌ Directory conf/wallets/solana does not exist"
    echo "   No wallets to auto-subscribe"
    exit 1
fi

WALLET_COUNT=$(find conf/wallets/solana -name "*.json" -not -name "hardware-wallets.json" 2>/dev/null | wc -l | tr -d ' ')

if [ "$WALLET_COUNT" -eq 0 ]; then
    echo "⚠️  No Solana wallets found in conf/wallets/solana"
    echo "   Auto-subscription will be skipped on startup"
    echo ""
    echo "To add a wallet, use:"
    echo "  curl -X POST http://localhost:15888/wallet/add \\"
    echo "    -H \"Content-Type: application/json\" \\"
    echo "    -d '{\"chain\":\"solana\",\"privateKey\":\"YOUR_PRIVATE_KEY\"}'"
    exit 0
fi

echo "✅ Found $WALLET_COUNT Solana wallet(s):"
echo ""

# List wallet addresses
for wallet_file in conf/wallets/solana/*.json; do
    if [[ "$wallet_file" != *"hardware-wallets.json" ]]; then
        wallet_address=$(basename "$wallet_file" .json)
        echo "  📔 $wallet_address"
    fi
done

echo ""
echo "─────────────────────────────────────────────────────────────"
echo ""
echo "Starting Gateway with auto-subscription enabled..."
echo ""
echo "Expected log output:"
echo "  1. ✅ Helius WebSocket monitor successfully initialized"
echo "  2. Auto-subscribing to N Solana wallet(s)..."
echo "  3. [ADDRESS...] Initial balance: X.XXXX SOL, Y token(s)"
echo "  4. Subscribed to wallet balance updates for ADDRESS..."
echo "  5. ✅ Auto-subscribed to N/N Solana wallet(s)"
echo ""
echo "When a transaction occurs on any wallet, you'll see:"
echo "  [ADDRESS...] Balance update at slot XXXXXX:"
echo "    SOL: X.XXXX, Tokens: Y"
echo ""
echo "─────────────────────────────────────────────────────────────"
echo ""
echo "Press Ctrl+C to stop Gateway when ready..."
echo ""

# Start Gateway in dev mode
GATEWAY_PASSPHRASE=a START_SERVER=true DEV=true pnpm start
