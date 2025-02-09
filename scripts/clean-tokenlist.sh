#!/bin/bash
# init

SCRIPT_DIR="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"
TEMPLATE_DIR="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )/src/templates"

prompt_proceed () {
  read -p "Do you want to proceed? [Y/N] >>> " PROCEED
  if [ "$PROCEED" == "" ]
  then
    prompt_proceed
  else
    if [[ "$PROCEED" != "Y" && "$PROCEED" != "y" ]]
    then
      PROCEED="N"
    fi
  fi
}

clean_token_list () {
  INPUT_PATH=$1
  CHAIN_ID=$2
  
  # Create output path with _CLEANED suffix and chainId
  OUTPUT_PATH="${INPUT_PATH%.*}_CLEANED${CHAIN_ID:+_$CHAIN_ID}.json"

  # Check if input file exists
  if [ ! -f "$INPUT_PATH" ]; then
    echo "Error: Input file $INPUT_PATH does not exist"
    exit 1
  fi

  # Create output directory if it doesn't exist
  OUTPUT_DIR=$(dirname "$OUTPUT_PATH")
  mkdir -p "$OUTPUT_DIR"

  # Use jq to clean the token list and remove duplicates
  jq --arg chainid "$CHAIN_ID" '
    (if type == "object" then .tokens else . end) |
    map({
      chainId: .chainId,
      name: .name,
      symbol: .symbol,
      address: .address,
      decimals: .decimals
    } | select(
      .chainId != null and
      ($chainid == "" or .chainId == ($chainid|tonumber)) and
      .name != null and
      .symbol != null and
      .address != null and
      .decimals != null
    )) as $all |
    
    # Group by symbol and process duplicates
    ($all | group_by(.symbol) | map(select(length > 1)) | map({
      symbol: .[0].symbol,
      kept: .[0],
      removed: .[1:]
    })) as $duplicates |
    
    # Output cleaned list and duplicate info
    {
      "tokens": ($all | unique_by(.symbol)),
      "duplicates": $duplicates
    }
  ' "$INPUT_PATH" > "${OUTPUT_PATH}.tmp"

  # Extract the cleaned token list
  jq '.tokens' "${OUTPUT_PATH}.tmp" > "$OUTPUT_PATH"

  # Report duplicates if any exist
  echo "Checking for duplicate symbols..."
  DUPLICATES=$(jq -r '.duplicates[] | "Symbol: \(.symbol)\n  Kept: \(.kept.address)\n  Removed: \(.removed | map(.address) | join(", "))"' "${OUTPUT_PATH}.tmp")
  if [ ! -z "$DUPLICATES" ]; then
    echo "Found tokens with duplicate symbols:"
    echo "$DUPLICATES"
  else
    echo "No duplicate symbols found"
  fi

  # Remove temporary file
  rm "${OUTPUT_PATH}.tmp"

  # Check if the operation was successful
  if [ $? -eq 0 ]; then
    echo "Token list successfully cleaned and saved to $OUTPUT_PATH"
  else
    echo "Error cleaning token list"
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
echo "===============  CLEAN TOKEN LIST ==============="
echo
echo

# Get input path and chainId
read -p "Enter path to the raw token list file >>> " INPUT_PATH
read -p "Enter chainId to filter (leave blank for all chains) >>> " CHAIN_ID

# Set output path using TEMPLATE_DIR
OUTPUT_PATH="$TEMPLATE_DIR/lists/token_list.json"

# Ask user to confirm and proceed
echo
echo "ℹ️ Confirm if this is correct:"
echo
printf "%30s %5s\n" "Clean token list FROM:" "$INPUT_PATH"
printf "%30s %5s\n" "Filter for chainId:" "$CHAIN_ID"
printf "%30s %5s\n" "Save cleaned list TO:" "${INPUT_PATH%.*}_CLEANED.json"
echo

prompt_proceed
if [[ "$PROCEED" == "Y" || "$PROCEED" == "y" ]]
then
  clean_token_list "$INPUT_PATH" "$CHAIN_ID"
else
  echo "Exiting..."
  exit
fi 