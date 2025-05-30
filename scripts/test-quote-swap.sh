#!/bin/bash

# General script to test quote-swap endpoints for different connectors
# Usage: ./test-quote-swap.sh <connector> <network> [base_url]
# Example: ./test-quote-swap.sh jupiter mainnet-beta
#          ./test-quote-swap.sh uniswap/amm base
#          ./test-quote-swap.sh raydium/amm mainnet-beta http://localhost:15888

# Check if connector and network are provided
if [ $# -lt 2 ]; then
  echo "Usage: $0 <connector> <network> [base_url]"
  echo "Examples:"
  echo "  $0 jupiter mainnet-beta"
  echo "  $0 uniswap/amm base"
  echo "  $0 raydium/amm mainnet-beta"
  exit 1
fi

CONNECTOR=$1
NETWORK=$2
BASE_URL=${3:-"http://localhost:15888"}

echo "Testing $CONNECTOR quote-swap endpoint on $NETWORK..."
echo "======================================="

# Endpoint URL
ENDPOINT="$BASE_URL/connectors/$CONNECTOR/quote-swap"

# Define test cases based on connector type
declare -a test_cases

# Check if it's a Solana-based connector
if [[ "$CONNECTOR" == "jupiter" || "$CONNECTOR" == "raydium"* || "$CONNECTOR" == "meteora"* ]]; then
  # Solana test cases
  test_cases=(
    # SOL trades
    "SOL USDC 1 SELL 0.5"
    "SOL USDC 0.1 SELL 1.0"
    "SOL USDC 10 BUY 0.5"
    "SOL USDC 100 BUY 2.0"
    
    # USDC trades
    "USDC SOL 100 SELL 0.5"
    "USDC SOL 50 BUY 1.0"
    
    # RAY trades
    "RAY USDC 10 SELL 0.5"
    "RAY USDC 5 BUY 1.5"
    
    # BONK trades (meme token with many decimals)
    "BONK USDC 1000000 SELL 0.5"
    "BONK USDC 500000 BUY 1.0"
    
    # JUP trades
    "JUP USDC 50 SELL 0.5"
    "JUP USDC 25 BUY 2.0"
    
    # Edge cases
    "SOL USDC 0.001 SELL 0.5"
    "USDC SOL 0.1 SELL 0.5"
    
    # High slippage test
    "SOL USDC 1 SELL 5.0"
  )
  
  # Add pool address for AMM/CLMM connectors if needed
  if [[ "$CONNECTOR" == *"/amm" || "$CONNECTOR" == *"/clmm" ]]; then
    POOL_PARAM=""
  else
    POOL_PARAM=""
  fi
  
elif [[ "$CONNECTOR" == "uniswap"* ]]; then
  # Ethereum/EVM test cases based on network
  case "$NETWORK" in
    "base")
      test_cases=(
        # WETH trades
        "WETH USDC 0.01 SELL 0.5"
        "WETH USDC 0.001 SELL 1.0"
        "WETH USDC 10 BUY 0.5"
        "WETH USDC 100 BUY 2.0"
        
        # USDC trades
        "USDC WETH 100 SELL 0.5"
        "USDC WETH 50 BUY 1.0"
        
        # VIRTUAL trades (if available)
        "VIRTUAL WETH 10 SELL 0.5"
        "VIRTUAL WETH 5 BUY 1.5"
        
        # Edge cases
        "WETH USDC 0.0001 SELL 0.5"
        "USDC WETH 1 SELL 0.5"
        
        # High slippage test
        "WETH USDC 0.01 SELL 5.0"
      )
      ;;
    "mainnet")
      test_cases=(
        # ETH trades
        "ETH USDC 0.1 SELL 0.5"
        "ETH USDC 0.01 SELL 1.0"
        "ETH USDC 1000 BUY 0.5"
        "ETH USDC 5000 BUY 2.0"
        
        # USDC trades
        "USDC ETH 1000 SELL 0.5"
        "USDC ETH 500 BUY 1.0"
        
        # WBTC trades
        "WBTC ETH 0.01 SELL 0.5"
        "WBTC ETH 0.005 BUY 1.5"
        
        # DAI trades
        "ETH DAI 0.1 SELL 0.5"
        "DAI ETH 1000 SELL 1.0"
        
        # Edge cases
        "ETH USDC 0.001 SELL 0.5"
        "USDC ETH 10 SELL 0.5"
        
        # High slippage test
        "ETH USDC 0.1 SELL 5.0"
      )
      ;;
    "worldchain")
      test_cases=(
        # WLD trades
        "WLD USDC.e 10 SELL 0.5"
        "WLD USDC.e 5 BUY 1.0"
        "USDC.e WLD 50 SELL 0.5"
        "USDC.e WLD 25 BUY 1.5"
      )
      ;;
    *)
      echo "No predefined test cases for network: $NETWORK"
      echo "You can add custom test cases for this network"
      exit 1
      ;;
  esac
else
  echo "Unknown connector type: $CONNECTOR"
  echo "Please add test cases for this connector"
  exit 1
fi

# Function to make request and format output
test_quote() {
  local base=$1
  local quote=$2
  local amount=$3
  local side=$4
  local slippage=$5
  
  echo ""
  echo "Testing: $side $amount $base for $quote (slippage: $slippage%)"
  echo "----------------------------------------------------------------"
  
  # Build URL with parameters
  url="$ENDPOINT?network=$NETWORK&baseToken=$base&quoteToken=$quote&amount=$amount&side=$side&slippagePct=$slippage"
  
  # Add pool address parameter if provided (for AMM/CLMM connectors)
  if [ -n "$6" ]; then
    url="$url&poolAddress=$6"
  fi
  
  response=$(curl -s -X 'GET' "$url" -H 'accept: application/json')
  
  # Check if response contains error
  if echo "$response" | jq -e '.error' > /dev/null 2>&1; then
    echo "ERROR: $(echo "$response" | jq -r '.message // .error')"
    echo "Status Code: $(echo "$response" | jq -r '.statusCode // "N/A"')"
  else
    # Extract key fields - handle different response formats
    echo "$response" | jq '{
      estimatedAmountIn,
      estimatedAmountOut,
      price,
      "priceImpact": (if .priceImpact then .priceImpact else "N/A" end),
      "minAmountOut": .minAmountOut,
      "maxAmountIn": .maxAmountIn,
      gasPrice,
      gasCost,
      "poolAddress": (if .poolAddress then .poolAddress else "N/A" end)
    }'
  fi
}

# Function to test with optional pool address
test_quote_with_pool() {
  local test_case=($1)
  test_quote "${test_case[@]}"
}

# Run all test cases
echo "Running ${#test_cases[@]} test cases..."
for test_case in "${test_cases[@]}"; do
  test_quote_with_pool "$test_case"
done

echo ""
echo "======================================="
echo "Summary:"
echo "- Connector: $CONNECTOR"
echo "- Network: $NETWORK"
echo "- Endpoint: $ENDPOINT"
echo "- Test cases run: ${#test_cases[@]}"
echo ""
echo "Test completed!"