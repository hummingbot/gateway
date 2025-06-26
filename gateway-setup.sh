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

copy_configs () {
  echo
  # Make destination folder if needed
  mkdir -p $HOST_CONF_PATH
  # Copy all files in the source folder to the destination folder
  cp $TEMPLATE_DIR/*.yml $HOST_CONF_PATH
  cp -r $TEMPLATE_DIR/networks $HOST_CONF_PATH/
  cp -r $TEMPLATE_DIR/connectors $HOST_CONF_PATH/
  cp -r $TEMPLATE_DIR/tokens $HOST_CONF_PATH/
  # Confirm that the files were copied
  if [ $? -eq 0 ]; then
    echo "Files successfully copied from $TEMPLATE_DIR to $HOST_CONF_PATH"
  else
    echo "Error copying files from $TEMPLATE_DIR to $HOST_CONF_PATH"
    exit
  fi
}


link_certs () {
  # Default to Hummingbot certs path, but allow user to override
  echo "Default Hummingbot certs path detected: $HUMMINGBOT_CERTS_PATH"
  read -p "Enter path to the Hummingbot certs folder (press Enter for default) >>> " CERTS_FROM_PATH
  
  # Use default if no input provided
  if [ -z "$CERTS_FROM_PATH" ]; then
    CERTS_FROM_PATH="$HUMMINGBOT_CERTS_PATH"
  fi
  
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

  # Remove existing certs folder/symlink if it exists
  if [ -L "$CERTS_TO_PATH" ] || [ -d "$CERTS_TO_PATH" ]; then
    echo "Removing existing certs folder/symlink..."
    rm -rf "$CERTS_TO_PATH"
  fi
  
  # Create symlink to Hummingbot certs folder
  ln -s "$CERTS_FROM_PATH" "$CERTS_TO_PATH"
  
  # Confirm that the symlink was created
  if [ $? -eq 0 ]; then
    echo "Symlink successfully created from $CERTS_TO_PATH to $CERTS_FROM_PATH"
    echo "Gateway will now use the same certificates as Hummingbot"
  else
    echo "Error creating symlink from $CERTS_TO_PATH to $CERTS_FROM_PATH"
    exit 1
  fi
}

replace_lists_source () {
  # Loop over chain .yml files
  for file in $(find "conf" -type f -name "*.yml"); do
    # Check for references to Docker lists folder
    if grep -q "/home/gateway/conf/lists/" $file; then
      # Replace with local lists folder
      perl -pi -e 's|/home/gateway/conf/lists/|conf/tokens/|g' $file
      echo "Replaced list locations in: $file"
    fi
  done
}

echo
echo
echo "===============  SETUP GATEWAY (Submodule Mode) ==============="
echo
echo "Gateway directory: $GATEWAY_DIR"
echo "Hummingbot root: $HUMMINGBOT_ROOT"
echo

read -p "Do you want to link to Hummingbot client certificates (Y/N) >>> " LINK_CERTS
if [[ "$LINK_CERTS" == "Y" ||  "$LINK_CERTS" == "y" ]]
then
  link_certs
else
  echo "Skipping linking client certificates"
fi

# Ask user to confirm and proceed
echo
echo "ℹ️ Confirm if this is correct:"
echo
printf "%30s %5s\n" "Copy configs FROM:" "$TEMPLATE_DIR"
printf "%30s %5s\n" "Copy configs TO:" "$HOST_CONF_PATH"
if [[ "$LINK_CERTS" == "Y" ||  "$LINK_CERTS" == "y" ]]
then
  echo
  printf "%30s %5s\n" "Link certs FROM:" "$CERTS_FROM_PATH"
  printf "%30s %5s\n" "Link certs TO:" "$CERTS_TO_PATH"
  echo "  (Symlink will be created)"
fi
echo

prompt_proceed
if [[ "$PROCEED" == "Y" || "$PROCEED" == "y" ]]
then
  copy_configs
  replace_lists_source
else
  echo "Exiting..."
  exit
fi

echo
echo "===============  SETUP COMPLETE ==============="
echo
