#!/bin/bash

SCRIPT_DIR="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"

prompt_proceed() {
  read -p "Do you want to proceed? [Y/N] >>> " PROCEED
  if [ "$PROCEED" == "" ]; then
    prompt_proceed
  else
    if [[ "$PROCEED" != "Y" && "$PROCEED" != "y" ]]; then
      PROCEED="N"
    fi
  fi
}

validate_address() {
  if [[ ! "$1" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
    return 1
  fi
  return 0
}

validate_decimals() {
  if [[ ! "$1" =~ ^[0-9]+$ ]] || [ "$1" -lt 1 ] || [ "$1" -gt 18 ]; then
    return 1
  fi
  return 0
}

add_token() {
  INPUT_PATH=$1
  
  # Check if input file exists
  if [ ! -f "$INPUT_PATH" ]; then
    echo "Error: Input file $INPUT_PATH does not exist"
    exit 1
  fi

  # Get chainId from existing tokens
  CHAIN_ID=$(jq -r '.[0].chainId' "$INPUT_PATH")
  if [ -z "$CHAIN_ID" ] || [ "$CHAIN_ID" = "null" ]; then
    echo "Error: Could not determine chainId from existing tokens"
    exit 1
  fi

  # Prompt for token details
  while true; do
    read -p "Enter token address (0x...) >>> " ADDRESS
    if validate_address "$ADDRESS"; then
      # Check for duplicate address
      if jq -e --arg addr "$ADDRESS" '.[] | select(.address == $addr)' "$INPUT_PATH" > /dev/null; then
        echo "Error: Token with this address already exists"
        continue
      fi
      break
    else
      echo "Error: Invalid address format. Must be 0x followed by 40 hex characters"
    fi
  done

  while true; do
    read -p "Enter token symbol >>> " SYMBOL
    if [ -z "$SYMBOL" ]; then
      echo "Error: Symbol is required"
      continue
    fi
    # Check for duplicate symbol
    if jq -e --arg sym "$SYMBOL" '.[] | select(.symbol == $sym)' "$INPUT_PATH" > /dev/null; then
      echo "Error: Token with this symbol already exists"
      continue
    fi
    break
  done

  read -p "Enter token name (press Enter to use symbol) >>> " NAME
  NAME=${NAME:-$SYMBOL}

  while true; do
    read -p "Enter token decimals (1-18) >>> " DECIMALS
    if validate_decimals "$DECIMALS"; then
      break
    else
      echo "Error: Decimals must be a number between 1 and 18"
    fi
  done

  # Create new token JSON
  NEW_TOKEN=$(cat <<EOF
{
  "chainId": $CHAIN_ID,
  "address": "$ADDRESS",
  "symbol": "$SYMBOL",
  "name": "$NAME",
  "decimals": $DECIMALS
}
EOF
)

  # Show confirmation
  echo
  echo "Review new token entry:"
  echo "$NEW_TOKEN" | jq .
  echo

  prompt_proceed
  if [[ "$PROCEED" == "Y" || "$PROCEED" == "y" ]]; then
    # Add new token to list
    jq --argjson newToken "$NEW_TOKEN" '. + [$newToken]' "$INPUT_PATH" > "${INPUT_PATH}.tmp"
    mv "${INPUT_PATH}.tmp" "$INPUT_PATH"
    echo "Token successfully added to $INPUT_PATH"
  else
    echo "Operation cancelled"
    exit 1
  fi
}

# Check if jq is installed
if ! command -v jq &> /dev/null; then
  echo "Error: jq is required but not installed."
  echo "Please install jq first:"
  echo "  Ubuntu/Debian: sudo apt-get install jq"
  echo "  MacOS: brew install jq"
  exit 1
fi

echo
echo
echo "===============  ADD TOKEN TO LIST ==============="
echo
echo

# Get input path
read -p "Enter path to the token list file >>> " INPUT_PATH

add_token "$INPUT_PATH" 