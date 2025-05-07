#!/bin/bash
# init

HOST_CONF_PATH="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )/conf"

TEMPLATE_DIR="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )/src/templates"

CERTS_TO_PATH="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )/certs"

GATEWAY_CODE_DIR="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )/code"


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
  mkdir $HOST_CONF_PATH
  # Copy all files in the source folder to the destination folder
  cp $TEMPLATE_DIR/**.yml $HOST_CONF_PATH
  # Confirm that the files were copied
  if [ $? -eq 0 ]; then
    echo "Files successfully copied from $TEMPLATE_DIR to $HOST_CONF_PATH"
  else
    echo "Error copying files from $TEMPLATE_DIR to $HOST_CONF_PATH"
    exit
  fi
}

copy_lists () {
  echo
  # Make destination folder if needed
  mkdir $HOST_CONF_PATH/lists
  # Copy all files in the source folder to the destination folder
  cp $TEMPLATE_DIR/lists/*.json $HOST_CONF_PATH/lists
  # Confirm that the files were copied
  if [ $? -eq 0 ]; then
    echo "Files successfully copied from $TEMPLATE_DIR/lists to $HOST_CONF_PATH"
  else
    echo "Error copying files from $TEMPLATE_DIR/lists to $HOST_CONF_PATH"
    exit
  fi
}

copy_certs () {
  # Ask for path to Hummingbot certs folder
  read -p "Enter path to the Hummingbot certs folder >>> " CERTS_FROM_PATH
  if [ ! -d "$CERTS_FROM_PATH" ]; then
    echo "Error: $CERTS_FROM_PATH does not exist or is not a directory"
    exit 1
  fi

  # Check if there are any .pem files in the source directory
  PEM_COUNT=$(find "$CERTS_FROM_PATH" -maxdepth 1 -name "*.pem" | wc -l)
  if [ "$PEM_COUNT" -eq 0 ]; then
    echo "Error: No .pem files found in $CERTS_FROM_PATH"
    exit 1
  fi

  # Make destination folder if needed
  mkdir -p $CERTS_TO_PATH
  
  # Copy all files in the source folder to the destination folder
  cp -r $CERTS_FROM_PATH/* $CERTS_TO_PATH/
  
  # Confirm that the files were copied
  if [ $? -eq 0 ]; then
    echo "Files successfully copied from $CERTS_FROM_PATH to $CERTS_TO_PATH"
  else
    echo "Error copying files from $CERTS_FROM_PATH to $CERTS_TO_PATH"
    exit 1
  fi
}

replace_lists_source () {
  # Loop over chain .yml files
  for file in $(find "conf" -type f -name "*.yml"); do
    # Check for references to Docker lists folder
    if grep -q "/home/gateway/conf/lists/" $file; then
      # Replace with local lists folder
      perl -pi -e 's|/home/gateway/conf/lists/|conf/lists/|g' $file
      echo "Replaced list locations in: $file"
    fi
  done
}

echo
echo
echo "===============  SETUP GATEWAY ==============="
echo
echo

read -p "Do you want to copy over client certificates (Y/N) >>> " COPY_CERTS
if [[ "$COPY_CERTS" == "Y" ||  "$COPY_CERTS" == "y" ]]
then
  copy_certs
else
  echo "Skipping copying client certificates"
fi

# Ask user to confirm and proceed
echo
echo "ℹ️ Confirm if this is correct:"
echo
printf "%30s %5s\n" "Copy configs FROM:" "$TEMPLATE_DIR"
printf "%30s %5s\n" "Copy configs TO:" "$HOST_CONF_PATH"
if [[ "$COPY_CERTS" == "Y" ||  "$COPY_CERTS" == "y" ]]
then
  echo
  printf "%30s %5s\n" "Copy certs FROM:" "$CERTS_FROM_PATH"
  printf "%30s %5s\n" "Copy certs TO:" "$CERTS_TO_PATH"
fi
echo

prompt_proceed
if [[ "$PROCEED" == "Y" || "$PROCEED" == "y" ]]
then
  copy_configs
  copy_lists
  replace_lists_source
else
  echo "Exiting..."
  exit
fi

# Gateway Code setup
echo
echo "===============  SETUP GATEWAY CODE ==============="
echo
echo "Gateway Code is a next-generation CLI for interacting with Gateway using Large Language Models."
echo

read -p "Do you want to set up Gateway Code? (Y/N) >>> " SETUP_GATEWAY_CODE
if [[ "$SETUP_GATEWAY_CODE" == "Y" ||  "$SETUP_GATEWAY_CODE" == "y" ]]
then
  echo "Setting up Gateway Code..."
  
  # Check if Node.js is installed
  if ! command -v node &> /dev/null
  then
    echo "Error: Node.js is not installed. Please install Node.js 18+ and try again."
    exit 1
  fi
  
  # Check if pnpm is installed
  if ! command -v pnpm &> /dev/null
  then
    echo "pnpm is not installed. Installing pnpm..."
    npm install -g pnpm
  fi
  
  # Install dependencies and build
  echo "Installing Gateway Code dependencies..."
  (cd "$GATEWAY_CODE_DIR" && pnpm install --no-frozen-lockfile)
  
  if [ $? -eq 0 ]; then
    echo "Successfully installed Gateway Code dependencies."
    
    # Build the project
    echo "Building Gateway Code..."
    (cd "$GATEWAY_CODE_DIR" && pnpm build)
    
    if [ $? -eq 0 ]; then
      echo "Gateway Code successfully set up!"
      echo "You can now run Gateway Code with: pnpm gateway-code"
    else
      echo "Error building Gateway Code. Please see $GATEWAY_CODE_DIR/README.md for troubleshooting."
      # Continue execution instead of stopping
      echo "Continuing with setup despite build errors..."
    fi
  else
    echo "Error installing Gateway Code dependencies."
    echo "Continuing with setup despite dependency installation errors..."
    # Continue execution instead of stopping
  fi
else
  echo "Skipping Gateway Code setup."
fi

echo
echo "===============  SETUP COMPLETE ==============="
echo
