#!/bin/sh

# Set common path for source mount
source_path=/Users/aldfiar/Documents/projects/python/gateway

# Run Docker container with mounted volumes and environment variables
docker run -d --name uniswap-gateway \
  -p 15888:15888 \
  -v $source_path/conf:/usr/src/app/conf \
  -v $source_path/certs:/usr/src/app/certs \
  -v $source_path/logs:/usr/src/app/logs \
  -e  GATEWAY_PASSPHRASE=last \
  digitalbridged/gateway:uniswap