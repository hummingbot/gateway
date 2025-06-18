#!/bin/sh

# If /home/gateway/conf/root.yml does not exist, copy all templates (including directories)
if [ ! -f /home/gateway/conf/root.yml ]; then
  cp -r -n /home/gateway/src/templates/* /home/gateway/conf/
fi

# Execute the container's CMD
exec "$@"
