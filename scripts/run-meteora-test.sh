#!/bin/bash

# Meteora Live Integration Test Runner
#
# This script runs the comprehensive Meteora integration tests
# Usage: ./scripts/run-meteora-test.sh

set -e

echo "🧪 Meteora Live Integration Test Runner"
echo "========================================"
echo ""

# Check if private key is provided
if [ -z "$WALLET_PRIVATE_KEY" ]; then
    echo "❌ ERROR: WALLET_PRIVATE_KEY environment variable not set"
    echo ""
    echo "Usage:"
    echo "  WALLET_PRIVATE_KEY=<your-base58-private-key> ./scripts/run-meteora-test.sh"
    echo ""
    echo "Or set it in your environment:"
    echo "  export WALLET_PRIVATE_KEY=<your-base58-private-key>"
    echo "  ./scripts/run-meteora-test.sh"
    echo ""
    echo "Note: Use the provided wallet key:"
    echo "  3U4vsNki2wjP9pcAe8smu7eox54hUTyanK7uxm3jH8Eo7BFUmzSXy22yNytfYjjT7tcJULySpgrUY39i7QKqeTxo"
    echo ""
    exit 1
fi

echo "✅ Wallet key found"
echo ""

# Check if build is up to date
echo "📦 Checking build..."
if [ ! -d "dist" ]; then
    echo "⚠️  No dist folder found, building..."
    pnpm build
else
    echo "✅ Build exists"
fi
echo ""

# Run the test
echo "🚀 Starting live integration tests..."
echo "⚠️  WARNING: Tests will execute real transactions on Solana devnet"
echo ""

npx ts-node scripts/test-meteora-live.ts

echo ""
echo "✅ Test run completed"
