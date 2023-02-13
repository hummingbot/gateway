#!/bin/bash
# init
# =============================================

echo
echo
echo "===============  SET CERTS PATH IN GATEWAY INSTANCE ==============="
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
echo
echo "Stopping container: $INSTANCE_NAME"
docker stop $INSTANCE_NAME

# Ask for path to Gateway files folder
read -p "Enter path to Gateway files folder (default = \"gateway-files\") >>> " FOLDER
if [ "$FOLDER" == "" ]
then
  FOLDER=$PWD/$DEFAULT_FOLDER
elif [[ ${FOLDER::1} != "/" ]]; then
  FOLDER=$PWD/$FOLDER
fi
CONF_FOLDER="$FOLDER/conf"
LOGS_FOLDER="$FOLDER/logs"
CERTS_FOLDER="$FOLDER/certs"

# Copy hummingbot certs folder
copy_certs () {
  echo
  read -p "Enter absolute path to the folder where Hummingbot certificates are stored >>> " CERTS_PATH
  if [ ! -d "$CERTS_PATH" ]; then
    echo "Error: $CERTS_PATH does not exist or is not a directory"
    copy_certs
  fi

  # Copy all files in the source folder to the destination folder
  cp -r $CERTS_PATH/* $CERTS_FOLDER/

  # Confirm that the files were copied
  if [ $? -eq 0 ]; then
    echo "Files successfully copied from $CERTS_PATH to $CERTS_FOLDER"
  else
    echo "Error copying files from $CERTS_PATH to $CERTS_FOLDER"
    copy_certs
  fi
}
copy_certs

echo "Starting container: $INSTANCE_NAME"
docker start $INSTANCE_NAME && docker attach $INSTANCE_NAME
echo
