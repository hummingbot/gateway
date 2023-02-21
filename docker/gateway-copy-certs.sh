#!/bin/bash
# init
# =============================================

echo
echo
echo "===============  COPY CERTS TO GATEWAY FOLDER ==============="
echo
echo "ℹ️  Press [ENTER] for default values:"
echo

# Ask for Gateway instance name
echo "List of all Gateway containers:"
docker ps -a --filter ancestor=hummingbot/gateway
echo
read -p "Enter Gateway container name (default = \"gateway\") >>> " INSTANCE_NAME
echo
if [ "$INSTANCE_NAME" == "" ]
then
  INSTANCE_NAME="gateway"
fi
DEFAULT_FOLDER="${INSTANCE_NAME}_files/certs"
echo
echo "Stopping container: $INSTANCE_NAME"
docker stop $INSTANCE_NAME

# Ask for path to Hummingbot certs folder
read -p "Enter path to the Hummingbot certs folder >>> " CERTS_FROM_PATH
if [ ! -d "$CERTS_FROM_PATH" ]; then
  echo "Error: $CERTS_FROM_PATH does not exist or is not a directory"
  exit
fi

# Ask for path to Gateway files folder
read -p "Enter path to the Gateway certs folder (default = \"./gateway-files/certs/\") >>> " FOLDER
if [ "$FOLDER" == "" ]
then
  FOLDER=$PWD/$DEFAULT_FOLDER
elif [[ ${FOLDER::1} != "/" ]]; then
  FOLDER=$PWD/$FOLDER
fi
CERTS_TO_PATH="$FOLDER"

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

copy_certs () {
  # Copy all files in the source folder to the destination folder
  cp -r $CERTS_FROM_PATH/* $CERTS_TO_PATH/

  # Confirm that the files were copied
  echo
  if [ $? -eq 0 ]; then
    echo "Files successfully copied from $CERTS_FROM_PATH to $CERTS_TO_PATH"
  else
    echo "Error copying files from $CERTS_FROM_PATH to $CERTS_TO_PATH"
    exit
  fi

  echo "Starting container: $INSTANCE_NAME"
  docker start $INSTANCE_NAME && docker attach $INSTANCE_NAME
  echo
}

# Ask user to confirm and proceed
echo
echo "ℹ️ Confirm if this is correct:"
echo
printf "%30s %5s\n" "Copy certs FROM:" "$CERTS_FROM_PATH"
printf "%30s %5s\n" "Copy certs TO:" "$CERTS_TO_PATH"
echo
prompt_proceed
if [[ "$PROCEED" == "Y" || "$PROCEED" == "y" ]]
then
 copy_certs
else
 echo "Exiting..."
 exit
fi
