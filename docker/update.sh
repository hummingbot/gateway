#!/bin/bash
# init
# =============================================

# Specify Gateway version
select_version () {
 echo
 echo
 echo "===============  RESTART GATEWAY INSTANCE ==============="
 echo
 echo
 echo "ℹ️  Press [ENTER] for default values:"
 echo
 read -p "Enter Gateway version to restart [latest/development] (default = \"latest\") >>> " TAG
 if [ "$TAG" == "" ]
 then
   TAG="latest"
 fi
}

# List all docker instances using the same image
list_instances () {
 echo
 echo "List of all docker containers using the \"$TAG\" version:"
 echo
 docker ps -a --filter ancestor=hummingbot/gateway:$TAG
 echo
}

# Execute docker commands
execute_docker () {
 
 if [ ! "$INSTANCE_NAME" == "" ]
 then
  # 1) Delete instance and old gateway image
  echo
  echo "Stopping container: $INSTANCE_NAME"
  docker stop $INSTANCE_NAME
  echo "Removing container: $INSTANCE_NAME"
  docker rm $INSTANCE_NAME
  echo
 fi

 echo
 read -p "Proceed with update? [Y/N] >>> " PROCEED
 if [[ ! "$PROCEED" == "Y" && ! "$PROCEED" == "y" ]]
 then
  echo "Abort"
  exit
 fi

 # 2) Delete old image
 echo
 read -p "Delete current docker image hummingbot/gateway:$TAG? [Y/N] >>> " DELETE_IMAGE
 if [[ "$DELETE_IMAGE" == "Y" || "$DELETE_IMAGE" == "y" ]]
 then
  echo
  echo "Deleting old image: hummingbot/gateway:$TAG"
  docker image rm hummingbot/gateway:$TAG
  echo
 fi

 
 #3 ) Pull docker image
 echo
 read -p "Pulling docker image hummingbot/gateway:$TAG [Y/N] >>> " PULL_IMAGE
 if [[ "$PULL_IMAGE" == "Y" || "$PULL_IMAGE" == "y" ]]
 then
  docker pull hummingbot/gateway:$TAG
  echo
 fi

 # 4) Re-create instances with the most recent hummingbot version
 echo
 echo "Re-creating docker containers with updated image..."

 ./create.sh

 echo
 echo "Listing current running docker instances..."
 docker ps
 echo
 echo
}

# start script
select_version

# get container instances
list_instances

# Ask the user for the name of the new Gateway instance to update
read -p "Enter a name for your new Gateway instance to update >>> " INSTANCE_NAME

# Execute docker commands
execute_docker
# 

echo "✅  Update complete!"
echo