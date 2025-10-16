#!/bin/bash
# init

# Get the gateway directory path (this script's location)
GATEWAY_DIR="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"

# Since gateway is a submodule in hummingbot, go up one level to get hummingbot root
HUMMINGBOT_ROOT="$(dirname "$GATEWAY_DIR")"

HOST_CONF_PATH="$GATEWAY_DIR/conf"

TEMPLATE_DIR="$GATEWAY_DIR/src/templates"

CERTS_TO_PATH="$GATEWAY_DIR/certs"

# Default Hummingbot certs path (one level up from gateway)
HUMMINGBOT_CERTS_PATH="$HUMMINGBOT_ROOT/certs"

# Check for --with-defaults flag
WITH_DEFAULTS=false
for arg in "$@"; do
  if [ "$arg" = "--with-defaults" ]; then
    WITH_DEFAULTS=true
    break
  fi
done


prompt_proceed () {
 if [ "$WITH_DEFAULTS" = true ]; then
   PROCEED="Y"
 else
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
 fi
}

ask_config_choices () {
  # Track what will be updated
  PLANNED_UPDATES=""
  
  # Function to prompt for yes/no with default
  prompt_yes_no () {
    local prompt_text="$1"
    local default_val="${2:-Y}"
    local user_input
    
    if [ "$WITH_DEFAULTS" = true ]; then
      # In with-defaults mode, use default value
      if [ "$default_val" = "Y" ]; then
        return 0
      else
        return 1
      fi
    fi
    
    if [ "$default_val" = "Y" ]; then
      read -p "$prompt_text [Y/n] >>> " user_input
      user_input=${user_input:-Y}
    else
      read -p "$prompt_text [y/N] >>> " user_input
      user_input=${user_input:-N}
    fi
    
    if [[ "$user_input" == "Y" || "$user_input" == "y" ]]; then
      return 0
    else
      return 1
    fi
  }
  
  # Always include root.yml (essential file)
  UPDATE_ROOT="Y"
  PLANNED_UPDATES="${PLANNED_UPDATES}root.yml, "
  
  # Always update namespace folder (required for config validation)
  UPDATE_NAMESPACE="Y"
  PLANNED_UPDATES="${PLANNED_UPDATES}namespace/, "

  # Ask about configurations to update
  echo "📦 Select configurations to update:"
  echo
  
  # Ask about server.yml
  if prompt_yes_no "  - server.yml (default Gateway server config)?" "Y"; then
    UPDATE_SERVER="Y"
    PLANNED_UPDATES="${PLANNED_UPDATES}server.yml, "
  else
    UPDATE_SERVER="N"
  fi
  
  # Ask about chains folder
  if prompt_yes_no "  - chains/ (default configs for each chain/network)?" "Y"; then
    UPDATE_CHAINS="Y"
    PLANNED_UPDATES="${PLANNED_UPDATES}chains/, "
  else
    UPDATE_CHAINS="N"
  fi
  
  # Ask about connectors folder
  if prompt_yes_no "  - connectors/ (default configs for each DEX connector)?" "Y"; then
    UPDATE_CONNECTORS="Y"
    PLANNED_UPDATES="${PLANNED_UPDATES}connectors/, "
  else
    UPDATE_CONNECTORS="N"
  fi
  
  # Ask about tokens folder
  if prompt_yes_no "  - tokens/ (default token lists for each chain/network)?" "Y"; then
    UPDATE_TOKENS="Y"
    PLANNED_UPDATES="${PLANNED_UPDATES}tokens/, "
  else
    UPDATE_TOKENS="N"
  fi
  
  # Ask about pools folder
  if prompt_yes_no "  - pools/ (default pool lists for each DEX connector)?" "Y"; then
    UPDATE_POOLS="Y"
    PLANNED_UPDATES="${PLANNED_UPDATES}pools/, "
  else
    UPDATE_POOLS="N"
  fi
  
  # Ask about rpc folder
  if prompt_yes_no "  - rpc/ (RPC provider configurations like Helius, Infura)?" "Y"; then
    UPDATE_RPC="Y"
    PLANNED_UPDATES="${PLANNED_UPDATES}rpc/, "
  else
    UPDATE_RPC="N"
  fi
  
  # Remove trailing comma and space
  PLANNED_UPDATES=${PLANNED_UPDATES%, }
}

copy_configs () {
  echo
  # Make destination folder if needed
  mkdir -p $HOST_CONF_PATH
  
  # Preserve wallets directory if it exists
  if [ -d "$HOST_CONF_PATH/wallets" ]; then
    cp -r "$HOST_CONF_PATH/wallets" "$HOST_CONF_PATH/wallets.backup"
  fi
  
  # Track what was updated for final summary
  UPDATED_ITEMS=""
  
  # Note: conf/wallets/ is never touched by this script to preserve user wallets
  
  # Copy based on user choices
  # Always copy root.yml (essential file)
  cp $TEMPLATE_DIR/root.yml $HOST_CONF_PATH/
  UPDATED_ITEMS="${UPDATED_ITEMS}root.yml, "
  
  # Copy server.yml if selected
  if [ "$UPDATE_SERVER" = "Y" ]; then
    cp $TEMPLATE_DIR/server.yml $HOST_CONF_PATH/
    UPDATED_ITEMS="${UPDATED_ITEMS}server.yml, "
  fi
  
  # Copy connectors folder if selected
  if [ "$UPDATE_CONNECTORS" = "Y" ]; then
    cp -r $TEMPLATE_DIR/connectors $HOST_CONF_PATH/
    UPDATED_ITEMS="${UPDATED_ITEMS}connectors/, "
  fi
  
  # Copy namespace folder if selected
  if [ "$UPDATE_NAMESPACE" = "Y" ]; then
    cp -r $TEMPLATE_DIR/namespace $HOST_CONF_PATH/
    UPDATED_ITEMS="${UPDATED_ITEMS}namespace/, "
  fi
  
  # Copy chains folder if selected
  if [ "$UPDATE_CHAINS" = "Y" ]; then
    # Store original defaultWallet values before copying
    ORIG_SOLANA_WALLET=""
    ORIG_ETH_WALLET=""
    
    if [ -f "$HOST_CONF_PATH/chains/solana.yml" ]; then
      ORIG_SOLANA_WALLET=$(grep "^defaultWallet:" "$HOST_CONF_PATH/chains/solana.yml" | cut -d' ' -f2- | tr -d "'\"")
    fi
    
    if [ -f "$HOST_CONF_PATH/chains/ethereum.yml" ]; then
      ORIG_ETH_WALLET=$(grep "^defaultWallet:" "$HOST_CONF_PATH/chains/ethereum.yml" | cut -d' ' -f2- | tr -d "'\"")
    fi
    
    # Copy the chains folder
    cp -r $TEMPLATE_DIR/chains $HOST_CONF_PATH/
    UPDATED_ITEMS="${UPDATED_ITEMS}chains/, "
    
    # Restore original defaultWallet values if they weren't placeholders
    if [ -n "$ORIG_SOLANA_WALLET" ] && [ "$ORIG_SOLANA_WALLET" != "<solana-wallet-address>" ]; then
      perl -pi -e "s|defaultWallet: '<solana-wallet-address>'|defaultWallet: $ORIG_SOLANA_WALLET|" "$HOST_CONF_PATH/chains/solana.yml"
      echo "   Kept original Solana defaultWallet: $ORIG_SOLANA_WALLET"
    fi
    
    if [ -n "$ORIG_ETH_WALLET" ] && [ "$ORIG_ETH_WALLET" != "<ethereum-wallet-address>" ]; then
      perl -pi -e "s|defaultWallet: '<ethereum-wallet-address>'|defaultWallet: $ORIG_ETH_WALLET|" "$HOST_CONF_PATH/chains/ethereum.yml"
      echo "   Kept original Ethereum defaultWallet: $ORIG_ETH_WALLET"
    fi
  fi
  
  # Copy tokens folder if selected
  if [ "$UPDATE_TOKENS" = "Y" ]; then
    cp -r $TEMPLATE_DIR/tokens $HOST_CONF_PATH/
    UPDATED_ITEMS="${UPDATED_ITEMS}tokens/, "
  fi
  
  # Copy pools folder if selected
  if [ "$UPDATE_POOLS" = "Y" ]; then
    cp -r $TEMPLATE_DIR/pools $HOST_CONF_PATH/
    UPDATED_ITEMS="${UPDATED_ITEMS}pools/, "
  fi
  
  # Copy rpc folder if selected
  if [ "$UPDATE_RPC" = "Y" ]; then
    cp -r $TEMPLATE_DIR/rpc $HOST_CONF_PATH/
    UPDATED_ITEMS="${UPDATED_ITEMS}rpc/, "
  fi
  
  # Note: wallets folder is preserved and never overwritten
  
  # Restore wallets directory if it was backed up
  if [ -d "$HOST_CONF_PATH/wallets.backup" ]; then
    rm -rf "$HOST_CONF_PATH/wallets"
    mv "$HOST_CONF_PATH/wallets.backup" "$HOST_CONF_PATH/wallets"
  fi
  
  # Remove trailing comma and space
  UPDATED_ITEMS=${UPDATED_ITEMS%, }
  
  echo
  if [ -n "$UPDATED_ITEMS" ]; then
    echo "✅ Successfully updated: $UPDATED_ITEMS"
  else
    echo "⚠️  No configurations were updated"
  fi
}


link_certs () {
  # Remove existing certs folder/symlink if it exists
  if [ -L "$CERTS_TO_PATH" ] || [ -d "$CERTS_TO_PATH" ]; then
    echo "Removing existing certs folder/symlink..."
    rm -rf "$CERTS_TO_PATH"
  fi
  
  # Create symlink to Hummingbot certs folder
  ln -s "$CERTS_FROM_PATH" "$CERTS_TO_PATH"
  
  # Confirm that the symlink was created
  if [ $? -eq 0 ]; then
    echo "✅ Certificate symlink created successfully"
    echo "   Gateway will now use the same certificates as Hummingbot"
  else
    echo "Error creating symlink from $CERTS_TO_PATH to $CERTS_FROM_PATH"
    exit 1
  fi
}

echo
echo
echo "===============  SETUP GATEWAY ==============="
echo
if [ "$WITH_DEFAULTS" = true ]; then
  echo "Running with --with-defaults: All configurations will be updated automatically."
else
  echo "This script helps you initialize a Gateway server."
  echo "It will copy default configuration files from the templates directory to your conf folder. You can choose which configurations to update."
  echo "Optionally, it will also link to the Hummingbot client certificates so you can run Gateway in HTTPS mode."
fi
echo

# Ask user which configurations to update
ask_config_choices

# Ask about certificates
if [ "$WITH_DEFAULTS" = true ]; then
  # Skip certificate linking in with-defaults mode
  LINK_CERTS="N"
else
  echo
  read -p "Do you want to link to Hummingbot client certificates [y/N] >>> " LINK_CERTS
  # Default to No if empty
  LINK_CERTS=${LINK_CERTS:-N}
    if [[ "$LINK_CERTS" == "Y" ||  "$LINK_CERTS" == "y" ]]
    then
      # Get the certificate path now, before showing summary
      echo
      read -p "Enter path to the Hummingbot certs folder [$HUMMINGBOT_CERTS_PATH] >>> " CERTS_FROM_PATH
    
      # Use default if no input provided
      if [ -z "$CERTS_FROM_PATH" ]; then
        CERTS_FROM_PATH="$HUMMINGBOT_CERTS_PATH"
      fi
      
      # Validate the path
      if [ ! -d "$CERTS_FROM_PATH" ]; then
        echo "Error: $CERTS_FROM_PATH does not exist or is not a directory"
        echo "Tip: Run 'gateway generate-certs' from Hummingbot to create certificates"
        exit 1
      fi
      
      # Check if there are any .pem files in the source directory
      PEM_COUNT=$(find "$CERTS_FROM_PATH" -maxdepth 1 -name "*.pem" | wc -l)
      if [ "$PEM_COUNT" -eq 0 ]; then
        echo "Error: No .pem files found in $CERTS_FROM_PATH"
        echo "Tip: Run 'gateway generate-certs' from Hummingbot to create certificates"
        exit 1
      fi
    fi
fi

# Show what will be updated and ask for final confirmation
echo
echo "📋 Summary of changes:"
echo

# Show configuration updates
echo "📦 Configuration updates:"
echo "   FROM: $TEMPLATE_DIR"
echo "   TO:   $HOST_CONF_PATH"
echo

# List specific items to be updated
echo "   Items to be updated:"
if [ "$UPDATE_SERVER" = "Y" ]; then
  echo "   - server.yml (default Gateway server configs)"
fi
if [ "$UPDATE_CHAINS" = "Y" ]; then
  echo "   - chains/ (default configs for each chain/network)"
fi
if [ "$UPDATE_CONNECTORS" = "Y" ]; then
  echo "   - connectors/ (default configs for each DEX connector)"
fi
if [ "$UPDATE_TOKENS" = "Y" ]; then
  echo "   - tokens/ (default token lists for each chain/network)"
fi
if [ "$UPDATE_POOLS" = "Y" ]; then
  echo "   - pools/ (default pool lists for each DEX connector)"
fi
if [ "$UPDATE_RPC" = "Y" ]; then
  echo "   - rpc/ (RPC provider configurations like Helius, Infura)"
fi
echo "   - root.yml (always updated - essential file)"
echo "   - namespaces/ (always updated - config schemas)"

# Show wallet preservation status
if [ -d "$HOST_CONF_PATH/wallets" ]; then
  echo
  echo "✅ Existing wallets/ directory will be preserved"
fi

# Check for existing defaultWallet values if chains will be updated
if [ "$UPDATE_CHAINS" = "Y" ]; then
  EXISTING_WALLETS=""
  
  if [ -f "$HOST_CONF_PATH/chains/solana.yml" ]; then
    SOLANA_WALLET=$(grep "^defaultWallet:" "$HOST_CONF_PATH/chains/solana.yml" | cut -d' ' -f2- | tr -d "'\"")
    if [ -n "$SOLANA_WALLET" ] && [ "$SOLANA_WALLET" != "<solana-wallet-address>" ]; then
      EXISTING_WALLETS="Solana"
    fi
  fi
  
  if [ -f "$HOST_CONF_PATH/chains/ethereum.yml" ]; then
    ETH_WALLET=$(grep "^defaultWallet:" "$HOST_CONF_PATH/chains/ethereum.yml" | cut -d' ' -f2- | tr -d "'\"")
    if [ -n "$ETH_WALLET" ] && [ "$ETH_WALLET" != "<ethereum-wallet-address>" ]; then
      if [ -n "$EXISTING_WALLETS" ]; then
        EXISTING_WALLETS="$EXISTING_WALLETS and Ethereum"
      else
        EXISTING_WALLETS="Ethereum"
      fi
    fi
  fi
  
  if [ -n "$EXISTING_WALLETS" ]; then
    echo "✅ Existing defaultWallet values will be preserved ($EXISTING_WALLETS)"
  fi
fi

# Show certificate linking if applicable
if [[ "$LINK_CERTS" == "Y" ||  "$LINK_CERTS" == "y" ]]
then
  echo
  echo "🔐 Certificates:"
  echo "   FROM: $CERTS_FROM_PATH"
  echo "   TO:   $CERTS_TO_PATH"
  echo "   (Symlink will be created)"
fi

echo

prompt_proceed
if [[ "$PROCEED" == "Y" || "$PROCEED" == "y" ]]
then
  copy_configs
  
  # Link certificates if requested
  if [[ "$LINK_CERTS" == "Y" ||  "$LINK_CERTS" == "y" ]]
  then
    echo
    link_certs
  fi
else
  echo "Exiting..."
  exit
fi

echo
echo "===============  SETUP COMPLETE ==============="
echo
