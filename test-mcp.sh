#!/bin/bash
# MCP Test Harness for Gateway

MCP_SERVER="node dist/mcp/index.js"
TEST_OUTPUT_DIR="./mcp-test-results"
mkdir -p $TEST_OUTPUT_DIR

# Function to send JSON-RPC request and save response
test_tool() {
    local test_name=$1
    local json_request=$2
    local output_file="$TEST_OUTPUT_DIR/${test_name}.json"
    
    echo "Testing: $test_name"
    echo "$json_request" | $MCP_SERVER 2>/dev/null | jq '.' > "$output_file"
    echo "Result saved to: $output_file"
    echo "---"
}

echo "Starting MCP Gateway Tests..."
echo "=============================="

# Test 1.1: Get available chains
test_tool "get_chains" '{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "get_chains",
    "arguments": {}
  },
  "id": 1
}'

# Test 1.2: Get all connectors
test_tool "get_connectors_all" '{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "get_connectors",
    "arguments": {}
  },
  "id": 2
}'

# Test 1.3: Get connectors for specific chain
test_tool "get_connectors_solana" '{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "get_connectors",
    "arguments": {"chain": "solana"}
  },
  "id": 3
}'

# Test 2.1: List all wallets
test_tool "wallet_list_all" '{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "wallet_list",
    "arguments": {}
  },
  "id": 4
}'

# Test 2.2: List wallets for specific chain
test_tool "wallet_list_ethereum" '{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "wallet_list",
    "arguments": {"chain": "ethereum"}
  },
  "id": 5
}'

# Test 3.1: Get balance stub
test_tool "get_balance_stub" '{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "get_balance_stub",
    "arguments": {
      "chain": "ethereum",
      "network": "mainnet",
      "address": "0x1234567890abcdef"
    }
  },
  "id": 6
}'

# Test 4: List available tools
test_tool "list_tools" '{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "params": {},
  "id": 7
}'

echo ""
echo "Test run complete!"
echo "Results saved in: $TEST_OUTPUT_DIR"
echo ""
echo "To view results:"
echo "  cat $TEST_OUTPUT_DIR/*.json | jq '.'"