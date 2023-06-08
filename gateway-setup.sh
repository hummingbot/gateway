#!/bin/bash
# init

echo
echo
echo "===============  SETUP GATEWAY ==============="
echo
echo


HOST_CONF_PATH="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )/conf"

TEMPLATE_DIR="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )/src/templates"

CERTS_TO_PATH="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )/certs"

# Ask for path to Hummingbot certs folder
read -p "Enter path to the Hummingbot certs folder >>> " CERTS_FROM_PATH
if [ ! -d "$CERTS_FROM_PATH" ]; then
  echo "Error: $CERTS_FROM_PATH does not exist or is not a directory"
  exit
fi

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
  cp $TEMPLATE_DIR/**.* $HOST_CONF_PATH
  # Confirm that the files were copied
  if [ $? -eq 0 ]; then
    echo "Files successfully copied from $TEMPLATE_DIR to $HOST_CONF_PATH"
  else
    echo "Error copying files from $TEMPLATE_DIR to $HOST_CONF_PATH"
    exit
  fi
}

copy_certs () {
  echo
  # Make destination folder if needed
  mkdir $CERTS_TO_PATH
  # Copy all files in the source folder to the destination folder
  cp -r $CERTS_FROM_PATH/* $CERTS_TO_PATH/
  # Confirm that the files were copied
  if [ $? -eq 0 ]; then
    echo "Files successfully copied from $CERTS_FROM_PATH to $CERTS_TO_PATH"
  else
    echo "Error copying files from $CERTS_FROM_PATH to $CERTS_TO_PATH"
    exit
  fi
}

# Ask user to confirm and proceed
echo
echo "ℹ️ Confirm if this is correct:"
echo
printf "%30s %5s\n" "Copy configs FROM:" "$TEMPLATE_DIR"
printf "%30s %5s\n" "Copy configs TO:" "$HOST_CONF_PATH"
echo
printf "%30s %5s\n" "Copy certs FROM:" "$CERTS_FROM_PATH"
printf "%30s %5s\n" "Copy certs TO:" "$CERTS_TO_PATH"
echo
prompt_proceed
if [[ "$PROCEED" == "Y" || "$PROCEED" == "y" ]]
then
  copy_configs
  copy_certs
else
  echo "Exiting..."
  exit
fi
